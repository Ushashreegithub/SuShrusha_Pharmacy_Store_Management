from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from apps.authentication.models import User
from apps.organizations.models import (
    Organization,
    Store,
    OrganizationDomain,
    OrganizationMembership,
    StoreMembership,
)
from apps.audit.models import AuditEvent
from apps.platform.models import PlatformSettings
from apps.platform.permissions import IsPlatformOwner
from apps.platform.session_utils import (
    generate_secure_temporary_password,
    get_active_session_count,
    revoke_user_sessions,
    revoke_organization_sessions,
)
from apps.platform.serializers import (
    PlatformOverviewSerializer,
    PlatformOrganizationListSerializer,
    PlatformOrganizationDetailSerializer,
    PlatformOrganizationStatusSerializer,
    PlatformUserListSerializer,
    PlatformUserDetailSerializer,
    PlatformUserStatusSerializer,
    PlatformTemporaryPasswordRequestSerializer,
    PlatformDomainSerializer,
    PlatformDomainCreateSerializer,
    PlatformDomainVerifySerializer,
    PlatformDomainStatusSerializer,
    PlatformLoginActivitySerializer,
    PlatformAuditSerializer,
    PlatformRegistrationSettingsUpdateSerializer,
)


class StandardPlatformPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class PlatformOverviewView(APIView):
    """
    GET: High-level platform health, organization metrics, user stats, and activity.
    """
    permission_classes = [IsPlatformOwner]

    def get(self, request):
        total_orgs = Organization.objects.count()
        active_orgs = Organization.objects.filter(is_active=True).count()
        suspended_orgs = Organization.objects.filter(is_active=False).count()

        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        inactive_users = User.objects.filter(is_active=False).count()

        total_stores = Store.objects.count()

        total_domains = OrganizationDomain.objects.count()
        verified_domains = OrganizationDomain.objects.filter(is_verified=True).count()
        pending_domains = OrganizationDomain.objects.filter(is_verified=False).count()

        active_sessions = get_active_session_count()

        recent_events = (
            AuditEvent.objects.select_related("user", "organization")
            .order_by("-created_at")[:10]
        )
        recent_activity = PlatformAuditSerializer(recent_events, many=True).data

        payload = {
            "total_organizations": total_orgs,
            "active_organizations": active_orgs,
            "suspended_organizations": suspended_orgs,
            "total_users": total_users,
            "active_users": active_users,
            "inactive_users": inactive_users,
            "total_stores": total_stores,
            "total_domains": total_domains,
            "verified_domains": verified_domains,
            "pending_domains": pending_domains,
            "active_sessions": active_sessions,
            "recent_activity": recent_activity,
        }
        return Response(PlatformOverviewSerializer(payload).data, status=status.HTTP_200_OK)


class PlatformOrganizationListView(APIView):
    """
    GET: Paginated list of all registered organizations with search and status filters.
    """
    permission_classes = [IsPlatformOwner]

    def get(self, request):
        qs = (
            Organization.objects.select_related("owner")
            .prefetch_related("domains")
            .annotate(
                stores_count=Count("stores", distinct=True),
                users_count=Count("memberships", distinct=True),
            )
            .order_by("-created_at")
        )

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(slug__icontains=search)
                | Q(owner__email__icontains=search)
                | Q(owner__full_name__icontains=search)
            )

        status_param = request.query_params.get("status", "").strip().lower()
        if status_param == "active":
            qs = qs.filter(is_active=True)
        elif status_param == "suspended":
            qs = qs.filter(is_active=False)

        paginator = StandardPlatformPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = PlatformOrganizationListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PlatformOrganizationDetailView(APIView):
    """
    GET: Detailed profile of an organization including owner, branches, and domains.
    """
    permission_classes = [IsPlatformOwner]

    def get(self, request, org_id):
        org = get_object_or_404(
            Organization.objects.select_related("owner").prefetch_related("domains", "stores"),
            id=org_id,
        )
        serializer = PlatformOrganizationDetailSerializer(org)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PlatformOrganizationStatusView(APIView):
    """
    POST: Activate or suspend a pharmacy organization.
    When suspending:
      - Marks is_active=False
      - Revokes all active sessions for members of that organization
      - Logs an immutable audit event with admin reason
    """
    permission_classes = [IsPlatformOwner]

    def post(self, request, org_id):
        org = get_object_or_404(Organization, id=org_id)
        serializer = PlatformOrganizationStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = serializer.validated_data["is_active"]
        reason = serializer.validated_data["reason"]
        old_status = org.is_active

        if old_status == new_status:
            return Response(
                {
                    "message": f"Organization is already {'active' if new_status else 'suspended'}.",
                    "is_active": new_status,
                },
                status=status.HTTP_200_OK,
            )

        revoked_sessions = 0
        with transaction.atomic():
            org.is_active = new_status
            org.save(update_fields=["is_active", "updated_at"])

            # If suspending, evict all user sessions across the tenant
            if not new_status:
                revoked_sessions = revoke_organization_sessions(org)

            AuditEvent.log_event(
                event_type="PLATFORM_ORG_STATUS_CHANGED",
                request=request,
                user=request.user,
                organization=org,
                details={
                    "admin_id": str(request.user.id),
                    "admin_email": request.user.email,
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
                "message": f"Organization '{org.name}' successfully {'activated' if new_status else 'suspended'}.",
                "organization_id": str(org.id),
                "is_active": new_status,
                "revoked_sessions_count": revoked_sessions,
            },
            status=status.HTTP_200_OK,
        )


class PlatformUserListView(APIView):
    """
    GET: Search and filter registered users across all organizations.
    Never returns passwords, password hashes, or secret tokens.
    """
    permission_classes = [IsPlatformOwner]

    def get(self, request):
        qs = User.objects.all().order_by("-created_at")

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(email__icontains=search)
                | Q(full_name__icontains=search)
                | Q(phone_number__icontains=search)
            )

        org_id = request.query_params.get("organization_id", "").strip()
        if org_id:
            qs = qs.filter(
                Q(org_memberships__organization_id=org_id)
                | Q(store_memberships__store__organization_id=org_id)
            ).distinct()

        role = request.query_params.get("role", "").strip()
        if role:
            qs = qs.filter(
                Q(org_memberships__role=role) | Q(store_memberships__role=role)
            ).distinct()

        status_param = request.query_params.get("status", "").strip().lower()
        if status_param == "active":
            qs = qs.filter(is_active=True)
        elif status_param == "suspended":
            qs = qs.filter(is_active=False)

        paginator = StandardPlatformPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = PlatformUserListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PlatformUserDetailView(APIView):
    """
    GET: Detailed user profile with memberships, stores, and audit activity.
    """
    permission_classes = [IsPlatformOwner]

    def get(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        serializer = PlatformUserDetailSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PlatformUserStatusView(APIView):
    """
    POST: Activate or suspend an individual user account.
    When suspending:
      - Marks is_active=False
      - Revokes all active database sessions for that user
      - Logs audit event with admin reason
    """
    permission_classes = [IsPlatformOwner]

    def post(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        serializer = PlatformUserStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Cannot suspend own account
        if user.id == request.user.id:
            return Response(
                {"detail": "You cannot suspend your own Platform Owner account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_status = serializer.validated_data["is_active"]
        reason = serializer.validated_data["reason"]
        old_status = user.is_active

        if old_status == new_status:
            return Response(
                {
                    "message": f"User is already {'active' if new_status else 'suspended'}.",
                    "is_active": new_status,
                },
                status=status.HTTP_200_OK,
            )

        revoked_sessions = 0
        with transaction.atomic():
            user.is_active = new_status
            user.save(update_fields=["is_active", "updated_at"])

            if not new_status:
                revoked_sessions = revoke_user_sessions(user)

            AuditEvent.log_event(
                event_type="PLATFORM_USER_STATUS_CHANGED",
                request=request,
                user=request.user,
                details={
                    "admin_id": str(request.user.id),
                    "admin_email": request.user.email,
                    "target_user_id": str(user.id),
                    "target_user_email": user.email,
                    "before_is_active": old_status,
                    "after_is_active": new_status,
                    "reason": reason,
                    "revoked_sessions_count": revoked_sessions,
                },
            )

        return Response(
            {
                "message": f"User '{user.email}' successfully {'activated' if new_status else 'suspended'}.",
                "user_id": str(user.id),
                "is_active": new_status,
                "revoked_sessions_count": revoked_sessions,
            },
            status=status.HTTP_200_OK,
        )


class PlatformUserTemporaryPasswordView(APIView):
    """
    POST: Generates a high-entropy temporary password for a user.
    Enforces:
      - Cryptographically secure generation via secrets
      - PBKDF2 hashing via user.set_password()
      - must_change_password=True
      - Eviction of all existing sessions
      - Audit record with admin reason (WITHOUT password or hash)
      - Cache-Control: no-store
    """
    permission_classes = [IsPlatformOwner]

    def post(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        serializer = PlatformTemporaryPasswordRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        reason = serializer.validated_data["reason"]
        temp_password = generate_secure_temporary_password()

        with transaction.atomic():
            user.set_password(temp_password)
            user.must_change_password = True
            user.save(update_fields=["password", "must_change_password", "updated_at"])

            revoked_sessions = revoke_user_sessions(user)

            AuditEvent.log_event(
                event_type="PLATFORM_USER_TEMP_PASSWORD_GENERATED",
                request=request,
                user=request.user,
                details={
                    "admin_id": str(request.user.id),
                    "admin_email": request.user.email,
                    "target_user_id": str(user.id),
                    "target_user_email": user.email,
                    "reason": reason,
                    "revoked_sessions_count": revoked_sessions,
                },
            )

        response = Response(
            {
                "message": "Temporary password generated successfully. Reveal once and share securely with user.",
                "user_id": str(user.id),
                "email": user.email,
                "temporary_password": temp_password,
                "must_change_password": True,
            },
            status=status.HTTP_200_OK,
        )
        response["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response["Pragma"] = "no-cache"
        return response


class PlatformUserRevokeSessionsView(APIView):
    """
    POST: Terminates all active database sessions for a specific user.
    """
    permission_classes = [IsPlatformOwner]

    def post(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        reason = request.data.get("reason", "").strip() or "Administrator manual session revocation"

        revoked_count = revoke_user_sessions(user)

        AuditEvent.log_event(
            event_type="PLATFORM_USER_SESSIONS_REVOKED",
            request=request,
            user=request.user,
            details={
                "admin_id": str(request.user.id),
                "admin_email": request.user.email,
                "target_user_id": str(user.id),
                "target_user_email": user.email,
                "reason": reason,
                "revoked_count": revoked_count,
            },
        )

        return Response(
            {
                "message": f"Successfully revoked {revoked_count} active session(s) for '{user.email}'.",
                "user_id": str(user.id),
                "revoked_sessions_count": revoked_count,
            },
            status=status.HTTP_200_OK,
        )


class PlatformDomainListCreateView(APIView):
    """
    GET: List all custom domains across tenants.
    POST: Register a new domain mapping for an organization (created as pending, is_verified=False).
    """
    permission_classes = [IsPlatformOwner]

    def get(self, request):
        qs = (
            OrganizationDomain.objects.select_related("organization", "organization__owner")
            .prefetch_related("organization__stores")
            .exclude(domain__iendswith=".localhost")
            .exclude(domain__in=["localhost", "127.0.0.1", "testserver"])
            .order_by("-created_at")
        )

        org_id = request.query_params.get("organization_id", "").strip()
        if org_id:
            qs = qs.filter(organization_id=org_id)

        status_param = request.query_params.get("status", "").strip()
        if status_param:
            qs = qs.filter(status=status_param)

        verified = request.query_params.get("is_verified", "").strip().lower()
        if verified in ("true", "1"):
            qs = qs.filter(is_verified=True)
        elif verified in ("false", "0"):
            qs = qs.filter(is_verified=False)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(domain__icontains=search)

        paginator = StandardPlatformPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = PlatformDomainSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = PlatformDomainCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        org = Organization.objects.get(id=data["organization_id"])

        with transaction.atomic():
            domain_obj = OrganizationDomain.objects.create(
                organization=org,
                domain=data["domain"],
                domain_type=data.get("domain_type", "client"),
                is_primary=data.get("is_primary", False),
                is_verified=False,
                status="pending",
            )

            AuditEvent.log_event(
                event_type="PLATFORM_DOMAIN_CREATED",
                request=request,
                user=request.user,
                organization=org,
                details={
                    "admin_id": str(request.user.id),
                    "admin_email": request.user.email,
                    "domain_id": str(domain_obj.id),
                    "domain": domain_obj.domain,
                    "domain_type": domain_obj.domain_type,
                    "organization_id": str(org.id),
                    "organization_name": org.name,
                },
            )

        return Response(
            PlatformDomainSerializer(domain_obj).data,
            status=status.HTTP_201_CREATED,
        )


class PlatformDomainDetailView(APIView):
    """
    GET: Retrieve domain mapping details.
    DELETE: Remove a domain mapping.
    """
    permission_classes = [IsPlatformOwner]

    def get(self, request, domain_id):
        domain_obj = get_object_or_404(
            OrganizationDomain.objects.select_related("organization"), id=domain_id
        )
        return Response(PlatformDomainSerializer(domain_obj).data, status=status.HTTP_200_OK)

    def delete(self, request, domain_id):
        domain_obj = get_object_or_404(
            OrganizationDomain.objects.select_related("organization"), id=domain_id
        )
        reason = request.data.get("reason", "").strip() or "Administrator deletion"

        with transaction.atomic():
            AuditEvent.log_event(
                event_type="PLATFORM_DOMAIN_DELETED",
                request=request,
                user=request.user,
                organization=domain_obj.organization,
                details={
                    "admin_id": str(request.user.id),
                    "admin_email": request.user.email,
                    "deleted_domain": domain_obj.domain,
                    "organization_id": str(domain_obj.organization_id),
                    "organization_name": domain_obj.organization.name,
                    "reason": reason,
                },
            )
            domain_obj.delete()

        return Response(
            {"message": "Domain mapping deleted successfully."},
            status=status.HTTP_200_OK,
        )


class PlatformDomainVerifyView(APIView):
    """
    POST: Explicitly verify and activate a tenant domain.
    """
    permission_classes = [IsPlatformOwner]

    def post(self, request, domain_id):
        domain_obj = get_object_or_404(
            OrganizationDomain.objects.select_related("organization"), id=domain_id
        )
        serializer = PlatformDomainVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        reason = serializer.validated_data["reason"]

        with transaction.atomic():
            domain_obj.is_verified = True
            domain_obj.status = "active"
            domain_obj.save(update_fields=["is_verified", "status", "updated_at"])

            AuditEvent.log_event(
                event_type="PLATFORM_DOMAIN_VERIFIED",
                request=request,
                user=request.user,
                organization=domain_obj.organization,
                details={
                    "admin_id": str(request.user.id),
                    "admin_email": request.user.email,
                    "domain_id": str(domain_obj.id),
                    "domain": domain_obj.domain,
                    "organization_id": str(domain_obj.organization_id),
                    "organization_name": domain_obj.organization.name,
                    "reason": reason,
                },
            )

        return Response(
            {
                "message": f"Domain '{domain_obj.domain}' verified and activated.",
                "domain": PlatformDomainSerializer(domain_obj).data,
            },
            status=status.HTTP_200_OK,
        )


class PlatformDomainStatusView(APIView):
    """
    POST: Activate, suspend, or revoke a custom domain.
    """
    permission_classes = [IsPlatformOwner]

    def post(self, request, domain_id):
        domain_obj = get_object_or_404(
            OrganizationDomain.objects.select_related("organization"), id=domain_id
        )
        serializer = PlatformDomainStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = serializer.validated_data["status"]
        reason = serializer.validated_data["reason"]
        old_status = domain_obj.status

        if new_status == "active" and not domain_obj.is_verified:
            return Response(
                {
                    "detail": "Cannot activate an unverified domain. Complete domain verification before activating."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            domain_obj.status = new_status
            domain_obj.save(update_fields=["status", "updated_at"])

            AuditEvent.log_event(
                event_type="PLATFORM_DOMAIN_STATUS_CHANGED",
                request=request,
                user=request.user,
                organization=domain_obj.organization,
                details={
                    "admin_id": str(request.user.id),
                    "admin_email": request.user.email,
                    "domain_id": str(domain_obj.id),
                    "domain": domain_obj.domain,
                    "before_status": old_status,
                    "after_status": new_status,
                    "reason": reason,
                },
            )

        return Response(
            {
                "message": f"Domain status updated to '{new_status}'.",
                "domain": PlatformDomainSerializer(domain_obj).data,
            },
            status=status.HTTP_200_OK,
        )


class PlatformLoginActivityView(APIView):
    """
    GET: Filterable log of successful and failed authentication attempts across the SaaS platform.
    """
    permission_classes = [IsPlatformOwner]

    def get(self, request):
        qs = (
            AuditEvent.objects.filter(
                event_type__in=[
                    "AUTH_LOGIN_SUCCESS",
                    "AUTH_LOGIN_FAILED",
                    "AUTH_CROSS_TENANT_REJECTED",
                    "AUTH_LOGOUT",
                ]
            )
            .select_related("user", "organization")
            .order_by("-created_at")
        )

        email = request.query_params.get("email", "").strip()
        if email:
            qs = qs.filter(
                Q(user__email__icontains=email)
                | Q(details__attempted_email__icontains=email)
            )

        org_id = request.query_params.get("organization_id", "").strip()
        if org_id:
            qs = qs.filter(organization_id=org_id)

        status_param = request.query_params.get("status", "").strip().upper()
        if status_param == "SUCCESS":
            qs = qs.filter(event_type="AUTH_LOGIN_SUCCESS")
        elif status_param == "FAILED":
            qs = qs.filter(event_type__in=["AUTH_LOGIN_FAILED", "AUTH_CROSS_TENANT_REJECTED"])

        paginator = StandardPlatformPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = PlatformLoginActivitySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PlatformAuditView(APIView):
    """
    GET: Global immutable audit trail of administrative and security events.
    """
    permission_classes = [IsPlatformOwner]

    def get(self, request):
        qs = AuditEvent.objects.select_related("user", "organization").order_by("-created_at")

        event_type = request.query_params.get("event_type", "").strip()
        if event_type:
            qs = qs.filter(event_type=event_type)

        org_id = request.query_params.get("organization_id", "").strip()
        if org_id:
            qs = qs.filter(organization_id=org_id)

        actor_email = request.query_params.get("actor_email", "").strip()
        if actor_email:
            qs = qs.filter(user__email__icontains=actor_email)

        paginator = StandardPlatformPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = PlatformAuditSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PlatformHostInfoView(APIView):
    """
    GET: Returns the authoritative main platform domain (pharmapro.diracai.com) and
    production client domain configurations, strictly excluding local development aliases.
    """
    permission_classes = [IsPlatformOwner]

    @staticmethod
    def _is_dev_host(host: str) -> bool:
        h = (host or "").strip().lower()
        return h in ("localhost", "127.0.0.1", "testserver") or h.endswith(".localhost")

    def get(self, request):
        configured_platforms = getattr(settings, "PLATFORM_DOMAINS", ["pharmapro.diracai.com"])
        prod_platforms = [d for d in configured_platforms if not self._is_dev_host(d)]
        if "pharmapro.diracai.com" not in prod_platforms:
            prod_platforms.insert(0, "pharmapro.diracai.com")

        primary_domain = "pharmapro.diracai.com"

        client_map = getattr(settings, "CLIENT_DOMAIN_ORGANIZATION_MAP", {})
        configured_clients = []
        for dom, org_slug in client_map.items():
            # Never present development hosts like sushrusha.localhost as production domains
            if self._is_dev_host(dom):
                continue

            in_db = OrganizationDomain.objects.filter(domain=dom).exists()
            org = Organization.objects.filter(
                Q(slug=org_slug) | Q(name=org_slug)
            ).select_related("owner").first()

            configured_clients.append(
                {
                    "domain": dom,
                    "in_database": in_db,
                    "configured_target_slug": org_slug,
                    "organization_slug": org.slug if org else None,
                    "organization_name": org.name if org else None,
                    "organization_id": str(org.id) if org else None,
                    "organization_is_active": org.is_active if org else None,
                    "organization_created_at": org.created_at if org else None,
                    "owner_name": org.owner.full_name if org and org.owner else None,
                    "owner_email": org.owner.email if org and org.owner else None,
                }
            )

        return Response(
            {
                "primary_platform_domain": primary_domain,
                "configured_platform_domains": prod_platforms,
                "configured_client_mappings": configured_clients,
            },
            status=status.HTTP_200_OK,
        )


class PlatformRegistrationSettingsView(APIView):
    """
    GET: Retrieves current platform-wide public pharmacy registration setting and change history.
    POST: Enables or disables public pharmacy Owner registration, recording admin, timestamp, and reason.
    """
    permission_classes = [IsPlatformOwner]

    def _build_payload(self, settings_obj):
        history_events = (
            AuditEvent.objects.filter(event_type="PLATFORM_REGISTRATION_SETTING_CHANGED")
            .select_related("user")
            .order_by("-created_at")[:15]
        )
        history = [
            {
                "id": str(ev.id),
                "actor_email": ev.user.email if ev.user else (ev.details.get("admin_email") or "System"),
                "actor_name": ev.user.full_name if ev.user else "System",
                "before_enabled": ev.details.get("before_enabled"),
                "after_enabled": ev.details.get("after_enabled"),
                "reason": ev.details.get("reason", ""),
                "timestamp": ev.created_at,
            }
            for ev in history_events
        ]

        return {
            "public_registration_enabled": bool(settings_obj.public_registration_enabled),
            "last_updated_reason": settings_obj.last_updated_reason or "",
            "updated_at": settings_obj.updated_at,
            "updated_by_email": settings_obj.updated_by.email if settings_obj.updated_by else None,
            "updated_by_name": settings_obj.updated_by.full_name if settings_obj.updated_by else None,
            "history": history,
        }

    def get(self, request):
        settings_obj = PlatformSettings.get_settings()
        return Response(self._build_payload(settings_obj), status=status.HTTP_200_OK)

    def post(self, request):
        serializer = PlatformRegistrationSettingsUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_enabled = serializer.validated_data["public_registration_enabled"]
        reason = serializer.validated_data["reason"]

        settings_obj = PlatformSettings.get_settings()
        old_enabled = bool(settings_obj.public_registration_enabled)

        if old_enabled == new_enabled:
            payload = self._build_payload(settings_obj)
            payload["message"] = (
                f"Public pharmacy registration is already {'enabled' if new_enabled else 'disabled'}."
            )
            return Response(payload, status=status.HTTP_200_OK)

        with transaction.atomic():
            settings_obj.public_registration_enabled = new_enabled
            settings_obj.last_updated_reason = reason
            settings_obj.updated_by = request.user
            settings_obj.save(
                update_fields=["public_registration_enabled", "last_updated_reason", "updated_by", "updated_at"]
            )

            AuditEvent.log_event(
                event_type="PLATFORM_REGISTRATION_SETTING_CHANGED",
                request=request,
                user=request.user,
                details={
                    "admin_id": str(request.user.id),
                    "admin_email": request.user.email,
                    "before_enabled": old_enabled,
                    "after_enabled": new_enabled,
                    "reason": reason,
                },
            )

        payload = self._build_payload(settings_obj)
        payload["message"] = (
            f"Public pharmacy registration has been {'enabled' if new_enabled else 'disabled'} successfully."
        )
        return Response(payload, status=status.HTTP_200_OK)

