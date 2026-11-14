from django.db import transaction, IntegrityError
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.pagination import PageNumberPagination

from apps.authentication.models import User
from apps.organizations.models import Organization, Store, OrganizationMembership, StoreMembership
from apps.partners.models import Partner, PartnerMembership
from apps.audit.models import AuditEvent
from apps.platform.session_utils import (
    generate_secure_temporary_password,
    revoke_user_sessions,
    revoke_organization_sessions,
)
from apps.partners.permissions import IsPartnerOwner
from apps.partners.serializers import (
    PartnerPharmacyListSerializer,
    PartnerCreatePharmacySerializer,
    PartnerUpdatePharmacySerializer,
    PartnerStatusReasonSerializer,
    PartnerStoreSerializer,
    PartnerCreateStoreSerializer,
    PartnerUpdateStoreSerializer,
    PartnerStoreStatusSerializer,
    PartnerCreateManagerSerializer,
    PartnerAssignManagerStoresSerializer,
    PartnerResetPasswordSerializer,
    PartnerProfileSerializer,
    PartnerBrandingSerializer,
    PartnerLogoUploadSerializer,
)


class StandardPartnerPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def _no_store_response(payload: dict, status_code: int = status.HTTP_200_OK) -> Response:
    response = Response(payload, status=status_code)
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    response["Pragma"] = "no-cache"
    return response


def _generate_store_code(org: Organization, requested_code: str = "") -> str:
    cleaned = (requested_code or "").strip().upper()
    if cleaned:
        return cleaned
    counter = Store.objects.filter(organization=org).count() + 1
    while True:
        candidate = f"STR-{counter:03d}"
        if not Store.objects.filter(organization=org, code__iexact=candidate).exists():
            return candidate
        counter += 1


def _get_partner_manager_users(partner):
    return (
        User.objects.filter(
            Q(
                org_memberships__organization__partner=partner,
                org_memberships__role__in=["owner", "admin"],
            )
            | Q(
                store_memberships__store__organization__partner=partner,
                store_memberships__role="manager",
            )
        )
        .distinct()
        .order_by("-created_at")
    )


def _serialize_partner_manager(user: User, partner) -> dict:
    org_mems = (
        OrganizationMembership.objects.filter(
            user=user,
            organization__partner=partner,
            role__in=["owner", "admin"],
        )
        .select_related("organization")
        .order_by("-created_at")
    )
    store_mems = (
        StoreMembership.objects.filter(
            user=user,
            store__organization__partner=partner,
            role="manager",
        )
        .select_related("store", "store__organization")
        .order_by("store__name")
    )

    orgs_data = [
        {
            "id": str(m.organization.id),
            "name": m.organization.name,
            "slug": m.organization.slug,
            "is_active": m.organization.is_active,
            "role": m.role,
            "membership_active": m.is_active,
        }
        for m in org_mems
    ]
    seen_org_ids = {o["id"] for o in orgs_data}
    stores_data = []
    for sm in store_mems:
        oid = str(sm.store.organization_id)
        if oid not in seen_org_ids:
            seen_org_ids.add(oid)
            orgs_data.append(
                {
                    "id": oid,
                    "name": sm.store.organization.name,
                    "slug": sm.store.organization.slug,
                    "is_active": sm.store.organization.is_active,
                    "role": "manager",
                    "membership_active": sm.is_active,
                }
            )
        stores_data.append(
            {
                "id": str(sm.store.id),
                "name": sm.store.name,
                "code": sm.store.code,
                "status": sm.store.status,
                "organization_id": oid,
                "organization_name": sm.store.organization.name,
                "is_active": sm.is_active,
            }
        )

    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "phone_number": user.phone_number,
        "is_active": user.is_active,
        "must_change_password": bool(getattr(user, "must_change_password", False)),
        "organizations": orgs_data,
        "assigned_stores": stores_data,
        "created_at": user.created_at.isoformat(),
    }


def _annotate_pharmacy_qs(qs):
    return qs.annotate(
        stores_count=Count("stores", distinct=True),
        active_stores_count=Count("stores", filter=Q(stores__status="active"), distinct=True),
    )


class PartnerOverviewView(APIView):
    """
    GET: Partner governance overview metrics and provisioning audit summary.
    Contains zero customer operational/clinical/sales data.
    """
    permission_classes = [IsPartnerOwner]

    def get(self, request):
        partner = request.bound_partner
        pharmacies_qs = _annotate_pharmacy_qs(
            Organization.objects.filter(partner=partner).select_related("owner")
        )
        stores_qs = Store.objects.filter(organization__partner=partner)
        managers_qs = _get_partner_manager_users(partner)

        total_pharmacies = pharmacies_qs.count()
        active_pharmacies = pharmacies_qs.filter(is_active=True).count()
        inactive_pharmacies = total_pharmacies - active_pharmacies

        total_stores = stores_qs.count()
        active_stores = stores_qs.filter(status="active").count()

        total_managers = managers_qs.count()
        active_managers = managers_qs.filter(is_active=True).count()
        pending_password_changes = managers_qs.filter(must_change_password=True).count()

        recent_pharmacies = PartnerPharmacyListSerializer(
            pharmacies_qs.order_by("-created_at")[:5], many=True
        ).data

        partner_events = (
            AuditEvent.objects.filter(
                event_type__startswith="PARTNER_",
            )
            .filter(
                Q(organization__partner=partner)
                | Q(details__partner_id=str(partner.id))
            )
            .select_related("user", "organization")
            .order_by("-created_at")[:12]
        )

        recent_activity = [
            {
                "id": str(ev.id),
                "event_type": ev.event_type,
                "actor_email": ev.user.email if ev.user else None,
                "organization_id": str(ev.organization_id) if ev.organization_id else None,
                "organization_name": ev.organization.name if ev.organization else None,
                "details": ev.details,
                "created_at": ev.created_at.isoformat(),
            }
            for ev in partner_events
        ]

        return Response(
            {
                "partner": {
                    "id": str(partner.id),
                    "name": partner.name,
                    "slug": partner.slug,
                    "domain": request.get_host().split(":")[0].lower(),
                },
                "metrics": {
                    "total_pharmacies": total_pharmacies,
                    "active_pharmacies": active_pharmacies,
                    "inactive_pharmacies": inactive_pharmacies,
                    "total_stores": total_stores,
                    "active_stores": active_stores,
                    "total_managers": total_managers,
                    "active_managers": active_managers,
                    "pending_password_changes": pending_password_changes,
                },
                "recent_pharmacies": recent_pharmacies,
                "recent_activity": recent_activity,
            },
            status=status.HTTP_200_OK,
        )


class PartnerPharmacyListCreateView(APIView):
    """
    GET: List partner-owned customer pharmacy organizations.
    POST: Provision a new customer pharmacy organization (+ optional initial stores and manager).
    """
    permission_classes = [IsPartnerOwner]

    def get(self, request):
        partner = request.bound_partner
        search = request.query_params.get("search", "").strip()
        status_filter = request.query_params.get("status", "").strip().lower()

        qs = _annotate_pharmacy_qs(
            Organization.objects.filter(partner=partner).select_related("owner")
        ).order_by("-created_at")

        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(slug__icontains=search)
                | Q(city__icontains=search)
                | Q(contact_email__icontains=search)
                | Q(owner__email__icontains=search)
            )
        if status_filter == "active":
            qs = qs.filter(is_active=True)
        elif status_filter == "inactive":
            qs = qs.filter(is_active=False)

        paginator = StandardPartnerPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = PartnerPharmacyListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        partner = request.bound_partner
        serializer = PartnerCreatePharmacySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        manager_data = data.get("manager")
        stores_inputs = list(data.get("stores") or [])
        if data.get("initial_store"):
            stores_inputs.insert(0, data["initial_store"])

        # Prevent duplicate organization submissions under the same partner
        if Organization.objects.filter(partner=partner, name__iexact=data["name"]).exists():
            return Response(
                {
                    "code": "pharmacy_already_exists",
                    "detail": f"A customer pharmacy named '{data['name']}' already exists under this partner.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        # Pre-check store code uniqueness across submitted initial stores before opening transaction
        seen_store_codes = set()
        for store_in in stores_inputs:
            explicit_code = (store_in.get("code") or "").strip().upper()
            if explicit_code:
                if explicit_code in seen_store_codes:
                    return Response(
                        {"stores": [f"Duplicate store code '{explicit_code}' within the same pharmacy."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                seen_store_codes.add(explicit_code)

        # Pre-check manager email uniqueness cleanly
        if manager_data:
            mgr_email = manager_data["email"].strip().lower()
            if User.objects.filter(email=mgr_email).exists():
                return Response(
                    {
                        "code": "email_already_exists",
                        "detail": "An account with this manager email address already exists.",
                        "email": mgr_email,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        generated_temp_password = None

        try:
            with transaction.atomic():
                org = Organization.objects.create(
                    name=data["name"],
                    partner=partner,
                    contact_email=data.get("contact_email", ""),
                    contact_phone=data.get("contact_phone", ""),
                    address=data.get("address", ""),
                    city=data.get("city", ""),
                    state=data.get("state", ""),
                    postal_code=data.get("postal_code", ""),
                    license_number=data.get("license_number", ""),
                    gstin=data.get("gstin", ""),
                    notes=data.get("notes", ""),
                    is_active=True,
                )

                created_stores = []
                for store_in in stores_inputs:
                    code = _generate_store_code(org, store_in.get("code", ""))
                    if Store.objects.filter(organization=org, code__iexact=code).exists():
                        transaction.set_rollback(True)
                        return Response(
                            {"stores": [f"Duplicate store code '{code}' within the same pharmacy."]},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    st = Store.objects.create(
                        organization=org,
                        name=store_in["name"],
                        code=code,
                        address=store_in.get("address", ""),
                        city=store_in.get("city", ""),
                        state=store_in.get("state", ""),
                        postal_code=store_in.get("postal_code", ""),
                        phone=store_in.get("phone", ""),
                        email=store_in.get("email", ""),
                        status=store_in.get("status", "active"),
                    )
                    created_stores.append(st)

                created_manager = None
                if manager_data:
                    raw_pw = manager_data.get("password") or generate_secure_temporary_password()
                    generated_temp_password = raw_pw
                    created_manager = User.objects.create_user(
                        email=manager_data["email"],
                        password=raw_pw,
                        full_name=manager_data["full_name"],
                        phone_number=manager_data.get("phone_number", ""),
                        is_email_verified=True,
                        is_active=True,
                        must_change_password=True,
                    )
                    org.owner = created_manager
                    org.save(update_fields=["owner", "updated_at"])

                    OrganizationMembership.objects.create(
                        organization=org,
                        user=created_manager,
                        role="owner",
                        is_active=True,
                    )

                    for st in created_stores:
                        StoreMembership.objects.create(
                            store=st,
                            user=created_manager,
                            role="manager",
                            is_active=True,
                        )
                        if not st.manager:
                            st.manager = created_manager
                            st.save(update_fields=["manager", "updated_at"])

                AuditEvent.log_event(
                    event_type="PARTNER_PHARMACY_CREATED",
                    request=request,
                    user=request.user,
                    organization=org,
                    details={
                        "partner_id": str(partner.id),
                        "partner_name": partner.name,
                        "organization_id": str(org.id),
                        "organization_name": org.name,
                        "stores_created": len(created_stores),
                        "manager_email": created_manager.email if created_manager else None,
                    },
                )

            annotated_org = _annotate_pharmacy_qs(Organization.objects.filter(id=org.id)).first()
            payload = {
                "message": f"Customer pharmacy '{org.name}' provisioned successfully.",
                "pharmacy": PartnerPharmacyListSerializer(annotated_org).data,
                "stores": PartnerStoreSerializer(created_stores, many=True).data,
            }
            if created_manager:
                payload["manager_credentials"] = {
                    "user_id": str(created_manager.id),
                    "full_name": created_manager.full_name,
                    "email": created_manager.email,
                    "temporary_password": generated_temp_password,
                    "must_change_password": True,
                }
            return _no_store_response(payload, status.HTTP_201_CREATED)

        except IntegrityError:
            return Response(
                {"detail": "Could not provision customer pharmacy due to conflicting unique details."},
                status=status.HTTP_409_CONFLICT,
            )


class PartnerPharmacyDetailView(APIView):
    """
    GET: View customer pharmacy governance metadata, stores, and managers.
    PATCH: Update customer pharmacy profile metadata (never operational data).
    """
    permission_classes = [IsPartnerOwner]

    def get(self, request, org_id):
        partner = request.bound_partner
        org = get_object_or_404(
            _annotate_pharmacy_qs(Organization.objects.select_related("owner")),
            id=org_id,
            partner=partner,
        )
        stores = Store.objects.filter(organization=org).select_related("manager", "organization").order_by("name")
        managers = (
            User.objects.filter(
                Q(org_memberships__organization=org, org_memberships__role__in=["owner", "admin"])
                | Q(store_memberships__store__organization=org, store_memberships__role="manager")
            )
            .distinct()
            .order_by("-created_at")
        )
        return Response(
            {
                "pharmacy": PartnerPharmacyListSerializer(org).data,
                "stores": PartnerStoreSerializer(stores, many=True).data,
                "managers": [_serialize_partner_manager(m, partner) for m in managers],
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, org_id):
        partner = request.bound_partner
        org = get_object_or_404(Organization, id=org_id, partner=partner)
        serializer = PartnerUpdatePharmacySerializer(org, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            serializer.save()
            AuditEvent.log_event(
                event_type="PARTNER_PHARMACY_UPDATED",
                request=request,
                user=request.user,
                organization=org,
                details={
                    "partner_id": str(partner.id),
                    "organization_id": str(org.id),
                    "updated_fields": list(serializer.validated_data.keys()),
                },
            )

        refreshed = _annotate_pharmacy_qs(Organization.objects.select_related("owner")).get(id=org.id)
        return Response(
            {
                "message": "Customer pharmacy details updated.",
                "pharmacy": PartnerPharmacyListSerializer(refreshed).data,
            },
            status=status.HTTP_200_OK,
        )


class PartnerPharmacyStatusView(APIView):
    """
    POST: Activate, deactivate, or suspend a partner customer pharmacy organization.
    Suspending immediately revokes all active user sessions for that organization.
    Historical operational data is preserved intact.
    """
    permission_classes = [IsPartnerOwner]

    def post(self, request, org_id):
        partner = request.bound_partner
        org = get_object_or_404(Organization, id=org_id, partner=partner)

        serializer = PartnerStatusReasonSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = serializer.validated_data["is_active"]
        reason = serializer.validated_data["reason"]
        old_status = org.is_active

        if old_status == new_status:
            return Response(
                {
                    "message": f"Pharmacy '{org.name}' is already {'active' if new_status else 'suspended'}.",
                    "organization_id": str(org.id),
                    "is_active": new_status,
                    "revoked_sessions_count": 0,
                },
                status=status.HTTP_200_OK,
            )

        revoked_sessions = 0
        with transaction.atomic():
            org.is_active = new_status
            org.save(update_fields=["is_active", "updated_at"])

            if not new_status:
                revoked_sessions = revoke_organization_sessions(org)

            AuditEvent.log_event(
                event_type="PARTNER_PHARMACY_STATUS_CHANGED",
                request=request,
                user=request.user,
                organization=org,
                details={
                    "partner_id": str(partner.id),
                    "organization_id": str(org.id),
                    "organization_name": org.name,
                    "before_is_active": old_status,
                    "after_is_active": new_status,
                    "reason": reason,
                    "revoked_sessions_count": revoked_sessions,
                },
            )

        return Response(
            {
                "message": f"Pharmacy '{org.name}' {'activated' if new_status else 'suspended'} successfully.",
                "organization_id": str(org.id),
                "is_active": new_status,
                "revoked_sessions_count": revoked_sessions,
            },
            status=status.HTTP_200_OK,
        )


class PartnerStoreListCreateView(APIView):
    """
    GET: List stores across partner customer pharmacies.
    POST: Create a new store under a partner-owned customer organization.
    """
    permission_classes = [IsPartnerOwner]

    def get(self, request):
        partner = request.bound_partner
        org_id = request.query_params.get("organization_id", "").strip()
        status_filter = request.query_params.get("status", "").strip()
        search = request.query_params.get("search", "").strip()

        qs = Store.objects.filter(organization__partner=partner).select_related(
            "organization", "manager"
        ).order_by("-created_at")

        if org_id:
            qs = qs.filter(organization_id=org_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(code__icontains=search)
                | Q(city__icontains=search)
                | Q(organization__name__icontains=search)
            )

        paginator = StandardPartnerPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = PartnerStoreSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        partner = request.bound_partner
        serializer = PartnerCreateStoreSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        org = get_object_or_404(Organization, id=data["organization_id"], partner=partner)

        code = _generate_store_code(org, data.get("code", ""))
        if Store.objects.filter(organization=org, code__iexact=code).exists():
            return Response(
                {"code": [f"A store with code '{code}' already exists in '{org.name}'."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        assigned_manager = None
        manager_id = data.get("manager_id")
        if manager_id:
            assigned_manager = User.objects.filter(id=manager_id, is_active=True).first()
            if not assigned_manager:
                return Response(
                    {"manager_id": ["Selected manager account was not found or is inactive."]},
                    status=status.HTTP_404_NOT_FOUND,
                )
            belongs_to_org = (
                OrganizationMembership.objects.filter(
                    organization=org, user=assigned_manager, is_active=True
                ).exists()
                or StoreMembership.objects.filter(
                    store__organization=org, user=assigned_manager, is_active=True
                ).exists()
            )
            if not belongs_to_org:
                return Response(
                    {"manager_id": ["Manager must belong to the same customer pharmacy organization."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            store = Store.objects.create(
                organization=org,
                name=data["name"],
                code=code,
                address=data.get("address", ""),
                city=data.get("city", ""),
                state=data.get("state", ""),
                postal_code=data.get("postal_code", ""),
                phone=data.get("phone", ""),
                email=data.get("email", ""),
                status=data.get("status", "active"),
                manager=assigned_manager,
            )

            if assigned_manager:
                StoreMembership.objects.get_or_create(
                    store=store,
                    user=assigned_manager,
                    defaults={"role": "manager", "is_active": True},
                )

            AuditEvent.log_event(
                event_type="PARTNER_STORE_CREATED",
                request=request,
                user=request.user,
                organization=org,
                details={
                    "partner_id": str(partner.id),
                    "store_id": str(store.id),
                    "store_name": store.name,
                    "store_code": store.code,
                },
            )

        return Response(
            {
                "message": f"Store '{store.name}' created under '{org.name}'.",
                "store": PartnerStoreSerializer(store).data,
            },
            status=status.HTTP_201_CREATED,
        )


class PartnerStoreDetailView(APIView):
    """
    PATCH: Update store metadata for a partner customer pharmacy store.
    """
    permission_classes = [IsPartnerOwner]

    def patch(self, request, store_id):
        partner = request.bound_partner
        store = get_object_or_404(
            Store.objects.select_related("organization", "manager"),
            id=store_id,
            organization__partner=partner,
        )
        serializer = PartnerUpdateStoreSerializer(store, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_code = serializer.validated_data.get("code")
        if new_code and Store.objects.filter(
            organization=store.organization, code__iexact=new_code
        ).exclude(id=store.id).exists():
            return Response(
                {"code": [f"A store with code '{new_code}' already exists in '{store.organization.name}'."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            serializer.save()
            AuditEvent.log_event(
                event_type="PARTNER_STORE_UPDATED",
                request=request,
                user=request.user,
                organization=store.organization,
                details={
                    "partner_id": str(partner.id),
                    "store_id": str(store.id),
                    "updated_fields": list(serializer.validated_data.keys()),
                },
            )

        return Response(
            {
                "message": f"Store '{store.name}' updated.",
                "store": PartnerStoreSerializer(store).data,
            },
            status=status.HTTP_200_OK,
        )


class PartnerStoreStatusView(APIView):
    """
    POST: Change a customer store's lifecycle status (setup/active/inactive).
    """
    permission_classes = [IsPartnerOwner]

    def post(self, request, store_id):
        partner = request.bound_partner
        store = get_object_or_404(
            Store.objects.select_related("organization", "manager"),
            id=store_id,
            organization__partner=partner,
        )
        serializer = PartnerStoreStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        old_status = store.status
        new_status = serializer.validated_data["status"]
        reason = serializer.validated_data.get("reason", "")

        with transaction.atomic():
            store.status = new_status
            store.save(update_fields=["status", "updated_at"])
            AuditEvent.log_event(
                event_type="PARTNER_STORE_STATUS_CHANGED",
                request=request,
                user=request.user,
                organization=store.organization,
                details={
                    "partner_id": str(partner.id),
                    "store_id": str(store.id),
                    "before_status": old_status,
                    "after_status": new_status,
                    "reason": reason,
                },
            )

        return Response(
            {
                "message": f"Store '{store.name}' status set to {new_status}.",
                "store": PartnerStoreSerializer(store).data,
            },
            status=status.HTTP_200_OK,
        )


class PartnerManagerListCreateView(APIView):
    """
    GET: List customer pharmacy managers belonging to partner's organizations.
    POST: Create a customer pharmacy manager account with temporary credentials and store assignments.
    """
    permission_classes = [IsPartnerOwner]

    def get(self, request):
        partner = request.bound_partner
        org_id = request.query_params.get("organization_id", "").strip()
        search = request.query_params.get("search", "").strip()
        status_filter = request.query_params.get("status", "").strip().lower()

        qs = _get_partner_manager_users(partner)
        if org_id:
            qs = qs.filter(
                Q(org_memberships__organization_id=org_id, org_memberships__organization__partner=partner)
                | Q(store_memberships__store__organization_id=org_id, store_memberships__store__organization__partner=partner)
            ).distinct()
        if search:
            qs = qs.filter(Q(full_name__icontains=search) | Q(email__icontains=search))
        if status_filter == "active":
            qs = qs.filter(is_active=True)
        elif status_filter == "inactive":
            qs = qs.filter(is_active=False)

        paginator = StandardPartnerPagination()
        page = paginator.paginate_queryset(qs, request)
        results = [_serialize_partner_manager(u, partner) for u in page]
        return paginator.get_paginated_response(results)

    def post(self, request):
        partner = request.bound_partner
        serializer = PartnerCreateManagerSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        org = get_object_or_404(Organization, id=data["organization_id"], partner=partner)
        email = data["email"]

        if User.objects.filter(email=email).exists():
            return Response(
                {
                    "code": "email_already_exists",
                    "detail": "An account with this email address already exists.",
                    "email": email,
                },
                status=status.HTTP_409_CONFLICT,
            )

        store_ids = list(dict.fromkeys(data.get("store_ids") or []))
        stores = list(Store.objects.filter(id__in=store_ids, organization=org))
        if len(stores) != len(store_ids):
            return Response(
                {"store_ids": ["One or more selected stores do not belong to the chosen customer pharmacy."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        temp_password = data.get("password") or generate_secure_temporary_password()

        try:
            with transaction.atomic():
                mgr = User.objects.create_user(
                    email=email,
                    password=temp_password,
                    full_name=data["full_name"],
                    phone_number=data.get("phone_number", ""),
                    is_email_verified=True,
                    is_active=True,
                    must_change_password=True,
                )

                OrganizationMembership.objects.create(
                    organization=org,
                    user=mgr,
                    role="owner",
                    is_active=True,
                )
                if not org.owner:
                    org.owner = mgr
                    org.save(update_fields=["owner", "updated_at"])

                for st in stores:
                    StoreMembership.objects.create(
                        store=st,
                        user=mgr,
                        role="manager",
                        is_active=True,
                    )
                    if not st.manager:
                        st.manager = mgr
                        st.save(update_fields=["manager", "updated_at"])

                AuditEvent.log_event(
                    event_type="PARTNER_MANAGER_CREATED",
                    request=request,
                    user=request.user,
                    organization=org,
                    details={
                        "partner_id": str(partner.id),
                        "manager_id": str(mgr.id),
                        "manager_email": mgr.email,
                        "assigned_store_ids": [str(s.id) for s in stores],
                    },
                )

            return _no_store_response(
                {
                    "message": f"Manager account created for '{org.name}'.",
                    "manager": _serialize_partner_manager(mgr, partner),
                    "temporary_password": temp_password,
                    "must_change_password": True,
                },
                status.HTTP_201_CREATED,
            )
        except IntegrityError:
            return Response(
                {
                    "code": "email_already_exists",
                    "detail": "An account with this email address already exists.",
                    "email": email,
                },
                status=status.HTTP_409_CONFLICT,
            )


class PartnerManagerAssignStoresView(APIView):
    """
    PATCH: Assign/update store manager assignments for a customer pharmacy manager
    strictly within the same customer organization.
    """
    permission_classes = [IsPartnerOwner]

    def patch(self, request, user_id):
        partner = request.bound_partner
        mgr = get_object_or_404(_get_partner_manager_users(partner), id=user_id)

        serializer = PartnerAssignManagerStoresSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        org = get_object_or_404(Organization, id=serializer.validated_data["organization_id"], partner=partner)

        # Ensure manager already belongs to this customer org
        belongs_to_org = (
            OrganizationMembership.objects.filter(organization=org, user=mgr).exists()
            or StoreMembership.objects.filter(store__organization=org, user=mgr).exists()
        )
        if not belongs_to_org:
            return Response(
                {"detail": "Manager does not belong to the specified customer pharmacy organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        store_ids = list(dict.fromkeys(serializer.validated_data["store_ids"]))
        stores = list(Store.objects.filter(id__in=store_ids, organization=org))
        if len(stores) != len(store_ids):
            return Response(
                {"store_ids": ["All assigned stores must belong to the selected customer pharmacy organization."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            target_set = {s.id for s in stores}
            # Deactivate store manager links removed from target set
            StoreMembership.objects.filter(
                user=mgr,
                store__organization=org,
                role="manager",
            ).exclude(store_id__in=target_set).update(is_active=False)

            Store.objects.filter(
                organization=org,
                manager=mgr,
            ).exclude(id__in=target_set).update(manager=None)

            for st in stores:
                sm, created = StoreMembership.objects.get_or_create(
                    store=st,
                    user=mgr,
                    defaults={"role": "manager", "is_active": True},
                )
                if not created and (sm.role != "manager" or not sm.is_active):
                    sm.role = "manager"
                    sm.is_active = True
                    sm.save(update_fields=["role", "is_active"])
                if not st.manager:
                    st.manager = mgr
                    st.save(update_fields=["manager", "updated_at"])

            AuditEvent.log_event(
                event_type="PARTNER_MANAGER_STORES_UPDATED",
                request=request,
                user=request.user,
                organization=org,
                details={
                    "partner_id": str(partner.id),
                    "manager_id": str(mgr.id),
                    "manager_email": mgr.email,
                    "assigned_store_ids": [str(s.id) for s in stores],
                },
            )

        return Response(
            {
                "message": "Manager store assignments updated.",
                "manager": _serialize_partner_manager(mgr, partner),
            },
            status=status.HTTP_200_OK,
        )


class PartnerManagerResetPasswordView(APIView):
    """
    POST: Issue a new one-time temporary password for a customer pharmacy manager,
    set must_change_password=True, and revoke existing sessions.
    """
    permission_classes = [IsPartnerOwner]

    def post(self, request, user_id):
        partner = request.bound_partner
        mgr = get_object_or_404(_get_partner_manager_users(partner), id=user_id)

        if mgr.is_staff or mgr.is_superuser or PartnerMembership.objects.filter(user=mgr, is_active=True).exists():
            return Response(
                {"detail": "Cannot reset password for platform or partner administrative accounts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PartnerResetPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        reason = serializer.validated_data["reason"]
        temp_password = generate_secure_temporary_password()

        org_mem = OrganizationMembership.objects.filter(
            user=mgr, organization__partner=partner
        ).select_related("organization").first()

        with transaction.atomic():
            mgr.set_password(temp_password)
            mgr.must_change_password = True
            mgr.save(update_fields=["password", "must_change_password", "updated_at"])
            revoked = revoke_user_sessions(mgr)

            AuditEvent.log_event(
                event_type="PARTNER_MANAGER_TEMP_PASSWORD_GENERATED",
                request=request,
                user=request.user,
                organization=org_mem.organization if org_mem else None,
                details={
                    "partner_id": str(partner.id),
                    "target_user_id": str(mgr.id),
                    "target_user_email": mgr.email,
                    "reason": reason,
                    "revoked_sessions_count": revoked,
                },
            )

        return _no_store_response(
            {
                "message": "Temporary password generated. Share once with the manager; password change is required at next sign-in.",
                "user_id": str(mgr.id),
                "email": mgr.email,
                "temporary_password": temp_password,
                "must_change_password": True,
                "revoked_sessions_count": revoked,
            },
            status.HTTP_200_OK,
        )


class PartnerManagerStatusView(APIView):
    """
    POST: Activate or deactivate a customer pharmacy manager account.
    """
    permission_classes = [IsPartnerOwner]

    def post(self, request, user_id):
        partner = request.bound_partner
        mgr = get_object_or_404(_get_partner_manager_users(partner), id=user_id)

        if mgr.is_staff or mgr.is_superuser or PartnerMembership.objects.filter(user=mgr, is_active=True).exists():
            return Response(
                {"detail": "Cannot modify platform or partner administrative accounts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PartnerStatusReasonSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = serializer.validated_data["is_active"]
        reason = serializer.validated_data["reason"]
        old_status = mgr.is_active

        org_mem = OrganizationMembership.objects.filter(
            user=mgr, organization__partner=partner
        ).select_related("organization").first()

        revoked = 0
        with transaction.atomic():
            mgr.is_active = new_status
            mgr.save(update_fields=["is_active", "updated_at"])

            OrganizationMembership.objects.filter(
                user=mgr, organization__partner=partner
            ).update(is_active=new_status)
            StoreMembership.objects.filter(
                user=mgr, store__organization__partner=partner
            ).update(is_active=new_status)

            if not new_status:
                revoked = revoke_user_sessions(mgr)

            AuditEvent.log_event(
                event_type="PARTNER_MANAGER_STATUS_CHANGED",
                request=request,
                user=request.user,
                organization=org_mem.organization if org_mem else None,
                details={
                    "partner_id": str(partner.id),
                    "target_user_id": str(mgr.id),
                    "target_user_email": mgr.email,
                    "before_is_active": old_status,
                    "after_is_active": new_status,
                    "reason": reason,
                    "revoked_sessions_count": revoked,
                },
            )

        return Response(
            {
                "message": f"Manager '{mgr.full_name}' {'activated' if new_status else 'deactivated'}.",
                "user_id": str(mgr.id),
                "is_active": new_status,
                "revoked_sessions_count": revoked,
                "manager": _serialize_partner_manager(mgr, partner),
            },
            status=status.HTTP_200_OK,
        )


class PartnerOrganizationProfileView(APIView):
    """
    GET: Retrieve the partner organization's profile and branding details.
    PATCH: Update display name, description, contact information, address, and registration details.
    Only authorized for active Partner Owners belonging to this Partner.
    """
    permission_classes = [IsPartnerOwner]

    def _get_partner(self, request):
        partner = getattr(request, "bound_partner", None)
        if not partner:
            partner = getattr(request, "active_partner", None)
        if not partner:
            mem = PartnerMembership.objects.filter(
                user=request.user, is_active=True, partner__is_active=True
            ).select_related("partner").first()
            if mem:
                partner = mem.partner
        return partner

    def get(self, request):
        partner = self._get_partner(request)
        if not partner:
            return Response({"detail": "Partner organization not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = PartnerProfileSerializer(partner, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        partner = self._get_partner(request)
        if not partner:
            return Response({"detail": "Partner organization not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PartnerProfileSerializer(
            partner, data=request.data, partial=True, context={"request": request}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        old_logo = None
        new_logo = request.FILES.get("logo")
        if new_logo:
            old_logo = partner.logo

        with transaction.atomic():
            updated_partner = serializer.save()
            if old_logo and old_logo != updated_partner.logo:
                try:
                    old_logo.delete(save=False)
                except Exception:
                    pass

            AuditEvent.log_event(
                event_type="PARTNER_PROFILE_UPDATED",
                request=request,
                user=request.user,
                details={
                    "partner_id": str(partner.id),
                    "partner_name": updated_partner.name,
                    "updated_fields": list(serializer.validated_data.keys()),
                },
            )

        return Response(
            PartnerProfileSerializer(updated_partner, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class PartnerLogoUploadView(APIView):
    """
    POST: Upload, replace, and validate the Partner organization logo (PNG/JPG/WEBP <= 5MB).
    DELETE: Remove uploaded logo and restore default icon branding.
    """
    permission_classes = [IsPartnerOwner]

    def _get_partner(self, request):
        partner = getattr(request, "bound_partner", None) or getattr(request, "active_partner", None)
        if not partner:
            mem = PartnerMembership.objects.filter(
                user=request.user, is_active=True, partner__is_active=True
            ).select_related("partner").first()
            if mem:
                partner = mem.partner
        return partner

    def post(self, request):
        partner = self._get_partner(request)
        if not partner:
            return Response({"detail": "Partner organization not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PartnerLogoUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        logo_file = serializer.validated_data["logo"]
        old_logo = partner.logo

        with transaction.atomic():
            partner.logo = logo_file
            partner.save(update_fields=["logo", "updated_at"])

            if old_logo and old_logo != partner.logo:
                try:
                    old_logo.delete(save=False)
                except Exception:
                    pass

            AuditEvent.log_event(
                event_type="PARTNER_LOGO_UPDATED",
                request=request,
                user=request.user,
                details={"partner_id": str(partner.id), "action": "Logo uploaded/replaced"},
            )

        profile_data = PartnerProfileSerializer(partner, context={"request": request}).data
        return Response(
            {
                "message": "Organization logo uploaded successfully.",
                "logo_url": profile_data["logo_url"],
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request):
        partner = self._get_partner(request)
        if not partner:
            return Response({"detail": "Partner organization not found."}, status=status.HTTP_404_NOT_FOUND)

        if partner.logo:
            old_logo = partner.logo
            with transaction.atomic():
                partner.logo = None
                partner.save(update_fields=["logo", "updated_at"])
                try:
                    old_logo.delete(save=False)
                except Exception:
                    pass

                AuditEvent.log_event(
                    event_type="PARTNER_LOGO_REMOVED",
                    request=request,
                    user=request.user,
                    details={"partner_id": str(partner.id), "action": "Logo removed, default restored"},
                )

        return Response(
            {
                "message": "Organization logo removed successfully. Default branding restored.",
                "logo_url": None,
            },
            status=status.HTTP_200_OK,
        )


class PartnerBrandingView(APIView):
    """
    GET: Public/tenant-aware branding configuration for the active partner host.
    Powers dynamic sidebar logo, tab title, and favicon across the Partner Portal.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        partner = getattr(request, "bound_partner", None) or getattr(request, "active_partner", None)
        if not partner and request.user.is_authenticated:
            mem = PartnerMembership.objects.filter(
                user=request.user, is_active=True, partner__is_active=True
            ).select_related("partner").first()
            if mem:
                partner = mem.partner

        if not partner:
            partner = Partner.objects.filter(is_active=True).first()

        if not partner:
            return Response(
                {
                    "name": "Sushrusha E-Clinic",
                    "slug": "sushrusha-eclinic",
                    "logo_url": None,
                    "website": "",
                },
                status=status.HTTP_200_OK,
            )

        serializer = PartnerBrandingSerializer(partner, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

