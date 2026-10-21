from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q, Count

from apps.authentication.models import User
from apps.organizations.models import Organization, Store, StoreMembership, OrganizationMembership
from apps.invitations.models import EmployeeInvitation
from apps.audit.models import AuditEvent
from apps.organizations.serializers import (
    StoreSerializer,
    AssignManagerSerializer,
    StoreMembershipSerializer,
    DirectAddMemberSerializer,
    OrganizationSettingsSerializer,
)
from apps.organizations.permissions import IsOrganizationOwner


def get_user_organization(user):
    """Returns active organization where user is owner, or None."""
    membership = OrganizationMembership.objects.filter(
        user=user, role="owner", is_active=True
    ).select_related("organization").first()
    return membership.organization if membership else None


class StoreListView(APIView):
    """
    GET: Returns stores accessible to the user based on role, with search and status filtering.
    POST: Organization Owners can create new store branches in PostgreSQL.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        search_query = request.query_params.get("search", "").strip()
        status_filter = request.query_params.get("status", "").strip()

        # 1. Organization Owner scope
        owner_membership = OrganizationMembership.objects.filter(
            user=user, role="owner", is_active=True
        ).first()

        if owner_membership:
            qs = Store.objects.filter(
                organization=owner_membership.organization
            ).select_related("manager", "organization").prefetch_related("memberships")

            if search_query:
                qs = qs.filter(
                    Q(name__icontains=search_query) | Q(code__icontains=search_query)
                )
            if status_filter:
                qs = qs.filter(status=status_filter)

            stores = qs.order_by("name")
            serializer = StoreSerializer(stores, many=True, context={"request": request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        # 2. Manager scope (assigned stores)
        manager_stores = Store.objects.filter(
            memberships__user=user,
            memberships__role="manager",
            memberships__is_active=True,
        ).distinct().select_related("manager", "organization").prefetch_related("memberships")

        if manager_stores.exists():
            qs = manager_stores
            if search_query:
                qs = qs.filter(
                    Q(name__icontains=search_query) | Q(code__icontains=search_query)
                )
            if status_filter:
                qs = qs.filter(status=status_filter)
            stores = qs.order_by("name")
            serializer = StoreSerializer(stores, many=True, context={"request": request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        # 3. Employee / Staff scope (assigned memberships)
        emp_stores = Store.objects.filter(
            memberships__user=user
        ).distinct().select_related("manager", "organization").prefetch_related("memberships")

        if search_query:
            emp_stores = emp_stores.filter(
                Q(name__icontains=search_query) | Q(code__icontains=search_query)
            )
        if status_filter:
            emp_stores = emp_stores.filter(status=status_filter)

        stores = emp_stores.order_by("name")
        serializer = StoreSerializer(stores, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        user = request.user
        org = get_user_organization(user)
        if not org:
            return Response(
                {"detail": "Only organization owners can create store branches."},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data.copy()

        # Auto-generate a clean store code if left blank
        if not data.get("code") or not data.get("code").strip():
            count = Store.objects.filter(organization=org).count() + 1
            data["code"] = f"STR-{count:03d}"

        serializer = StoreSerializer(data=data, context={"organization": org})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            store = serializer.save(organization=org)

            # Audit event
            AuditEvent.log_event(
                event_type="STORE_CREATED",
                request=request,
                user=user,
                organization=org,
                details={
                    "store_id": str(store.id),
                    "store_name": store.name,
                    "store_code": store.code,
                    "status": store.status,
                },
            )

        return Response(StoreSerializer(store, context={"request": request}).data, status=status.HTTP_201_CREATED)


class StoreDetailView(APIView):
    """
    GET: Retrieve specific store branch details.
    PUT/PATCH: Update store details (Owner or assigned manager).
    """
    permission_classes = [IsAuthenticated]

    def get_store_and_check_permission(self, request, store_id, for_write=False):
        user = request.user
        store = Store.objects.filter(id=store_id).select_related("organization", "manager").first()
        if not store:
            return None, Response({"detail": "Store branch not found."}, status=status.HTTP_404_NOT_FOUND)

        is_owner = OrganizationMembership.objects.filter(
            organization=store.organization, user=user, role="owner", is_active=True
        ).exists()

        if is_owner:
            return store, None

        is_manager = StoreMembership.objects.filter(
            store=store, user=user, role="manager", is_active=True
        ).exists()

        if is_manager:
            return store, None

        if for_write:
            return None, Response(
                {"detail": "You do not have permission to modify this store."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # For read, check if active employee
        is_member = StoreMembership.objects.filter(
            store=store, user=user, is_active=True
        ).exists()

        if is_member:
            return store, None

        # Check if inactive membership exists
        inactive_member = StoreMembership.objects.filter(
            store=store, user=user, is_active=False
        ).exists()
        if inactive_member:
            return None, Response(
                {"detail": "Your membership for this store branch is currently inactive. Please contact your manager."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return None, Response(
            {"detail": "You do not have permission to access this store branch."},
            status=status.HTTP_403_FORBIDDEN,
        )

    def get(self, request, store_id):
        store, error_response = self.get_store_and_check_permission(request, store_id, for_write=False)
        if error_response:
            return error_response

        serializer = StoreSerializer(store, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request, store_id):
        return self.patch(request, store_id)

    def patch(self, request, store_id):
        store, error_response = self.get_store_and_check_permission(request, store_id, for_write=True)
        if error_response:
            return error_response

        serializer = StoreSerializer(
            store,
            data=request.data,
            partial=True,
            context={"organization": store.organization, "request": request},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            updated_store = serializer.save()

            AuditEvent.log_event(
                event_type="STORE_UPDATED",
                request=request,
                user=request.user,
                organization=store.organization,
                details={
                    "store_id": str(updated_store.id),
                    "store_name": updated_store.name,
                    "updated_fields": list(request.data.keys()),
                },
            )

        return Response(StoreSerializer(updated_store, context={"request": request}).data, status=status.HTTP_200_OK)


class StoreAssignManagerView(APIView):
    """
    Assigns or updates the manager of a store branch.
    Owner-only operation.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id):
        user = request.user
        org = get_user_organization(user)
        if not org:
            return Response(
                {"detail": "Only organization owners can assign store managers."},
                status=status.HTTP_403_FORBIDDEN,
            )

        store = Store.objects.filter(id=store_id, organization=org).first()
        if not store:
            return Response({"detail": "Store branch not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AssignManagerSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        manager_user = serializer.validated_data["user"]

        with transaction.atomic():
            old_manager = store.manager
            store.manager = manager_user
            store.save(update_fields=["manager", "updated_at"])

            # Create or update StoreMembership for manager
            membership, _ = StoreMembership.objects.update_or_create(
                store=store,
                user=manager_user,
                defaults={"role": "manager", "is_active": True},
            )

            # Audit event
            AuditEvent.log_event(
                event_type="STORE_MANAGER_ASSIGNED",
                request=request,
                user=user,
                organization=org,
                details={
                    "store_id": str(store.id),
                    "store_name": store.name,
                    "new_manager_id": str(manager_user.id),
                    "new_manager_email": manager_user.email,
                    "previous_manager_email": old_manager.email if old_manager else None,
                },
            )

        return Response(StoreSerializer(store, context={"request": request}).data, status=status.HTTP_200_OK)


class StoreMembersView(APIView):
    """
    GET: Lists staff and manager memberships for a specific store.
    POST: Assigns an existing verified user directly to this store.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        user = request.user
        store = Store.objects.filter(id=store_id).select_related("organization").first()
        if not store:
            return Response({"detail": "Store branch not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check permission (Owner or Store Manager)
        is_owner = OrganizationMembership.objects.filter(
            organization=store.organization, user=user, role="owner", is_active=True
        ).exists()
        is_mgr = StoreMembership.objects.filter(
            store=store, user=user, role="manager", is_active=True
        ).exists()

        if not is_owner and not is_mgr:
            return Response(
                {"detail": "You do not have permission to view this store's team."},
                status=status.HTTP_403_FORBIDDEN,
            )

        memberships = StoreMembership.objects.filter(store=store).select_related("user").order_by("-is_active", "role", "user__full_name")
        serializer = StoreMembershipSerializer(memberships, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, store_id):
        user = request.user
        store = Store.objects.filter(id=store_id).select_related("organization").first()
        if not store:
            return Response({"detail": "Store branch not found."}, status=status.HTTP_404_NOT_FOUND)

        is_owner = OrganizationMembership.objects.filter(
            organization=store.organization, user=user, role="owner", is_active=True
        ).exists()
        is_mgr = StoreMembership.objects.filter(
            store=store, user=user, role="manager", is_active=True
        ).exists()

        if not is_owner and not is_mgr:
            return Response(
                {"detail": "You do not have permission to add members to this store."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DirectAddMemberSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        role = serializer.validated_data["role"]
        target_user = User.objects.get(email=email)

        # Managers cannot assign owner or admin roles
        if not is_owner and role in ["owner", "admin"]:
            return Response(
                {"detail": "Managers cannot grant owner or administrative roles."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            membership, created = StoreMembership.objects.update_or_create(
                store=store,
                user=target_user,
                defaults={"role": role, "is_active": True},
            )

            AuditEvent.log_event(
                event_type="STORE_MEMBERSHIP_ASSIGNED",
                request=request,
                user=user,
                organization=store.organization,
                details={
                    "store_id": str(store.id),
                    "store_name": store.name,
                    "target_user_id": str(target_user.id),
                    "target_email": target_user.email,
                    "role": role,
                    "created": created,
                },
            )

        return Response(StoreMembershipSerializer(membership).data, status=status.HTTP_200_OK)


class StoreMemberDetailView(APIView):
    """
    PATCH: Updates membership status (active/inactive) or role.
    Deactivating a membership only affects this store; never deactivates user account or other stores.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, store_id, membership_id):
        user = request.user
        membership = StoreMembership.objects.filter(
            id=membership_id, store_id=store_id
        ).select_related("store", "store__organization", "user").first()

        if not membership:
            return Response({"detail": "Store membership not found."}, status=status.HTTP_404_NOT_FOUND)

        store = membership.store
        is_owner = OrganizationMembership.objects.filter(
            organization=store.organization, user=user, role="owner", is_active=True
        ).exists()
        is_mgr = StoreMembership.objects.filter(
            store=store, user=user, role="manager", is_active=True
        ).exists()

        if not is_owner and not is_mgr:
            return Response(
                {"detail": "You do not have permission to manage store memberships."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Prevent manager from deactivating the owner or modifying owner membership
        if membership.role == "owner":
            return Response(
                {"detail": "Organization owner membership cannot be modified here."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_active = request.data.get("is_active")
        new_role = request.data.get("role")

        with transaction.atomic():
            if is_active is not None:
                membership.is_active = bool(is_active)
            if new_role and new_role in dict(StoreMembership.ROLE_CHOICES):
                membership.role = new_role
            membership.save()

            AuditEvent.log_event(
                event_type="STORE_MEMBERSHIP_UPDATED",
                request=request,
                user=user,
                organization=store.organization,
                details={
                    "store_id": str(store.id),
                    "store_name": store.name,
                    "target_user_email": membership.user.email,
                    "is_active": membership.is_active,
                    "role": membership.role,
                },
            )

        return Response(StoreMembershipSerializer(membership).data, status=status.HTTP_200_OK)


class OrganizationOverviewView(APIView):
    """
    GET: Returns real PostgreSQL metrics for the Owner dashboard overview:
    - total_stores, active_stores, setup_stores
    - total_members, active_members
    - pending_invitations
    - recent_activity (AuditEvent records)
    - stores_summary
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        org = get_user_organization(user)
        if not org:
            return Response(
                {"detail": "Only organization owners can view organization metrics."},
                status=status.HTTP_403_FORBIDDEN,
            )

        stores = Store.objects.filter(organization=org).select_related("manager").prefetch_related("memberships")
        total_stores = stores.count()
        active_stores = stores.filter(status="active").count()
        setup_stores = stores.filter(status="setup").count()

        # Members across all organization stores
        distinct_members = User.objects.filter(
            store_memberships__store__organization=org
        ).distinct()
        total_members = distinct_members.count()
        active_members = distinct_members.filter(store_memberships__is_active=True).distinct().count()

        # Pending invitations
        pending_invitations = EmployeeInvitation.objects.filter(
            organization=org, status="pending"
        ).count()

        # Recent 6 audit events
        recent_events = AuditEvent.objects.filter(
            organization=org
        ).select_related("user").order_by("-created_at")[:6]

        recent_activity_data = [
            {
                "id": str(e.id),
                "event_type": e.event_type,
                "user_email": e.user.email if e.user else "System",
                "details": e.details,
                "created_at": e.created_at.isoformat(),
            }
            for e in recent_events
        ]

        stores_summary_data = [
            {
                "id": str(s.id),
                "name": s.name,
                "code": s.code,
                "status": s.status,
                "address": s.address,
                "phone": s.phone,
                "city": s.city,
                "manager_name": s.manager.full_name if s.manager else "Unassigned",
                "manager_email": s.manager.email if s.manager else None,
                "active_members_count": s.memberships.filter(is_active=True).count(),
            }
            for s in stores[:10]
        ]

        return Response(
            {
                "organization": {
                    "id": str(org.id),
                    "name": org.name,
                    "slug": org.slug,
                    "is_active": org.is_active,
                    "created_at": org.created_at.isoformat(),
                },
                "metrics": {
                    "total_stores": total_stores,
                    "active_stores": active_stores,
                    "setup_stores": setup_stores,
                    "total_members": total_members,
                    "active_members": active_members,
                    "pending_invitations": pending_invitations,
                },
                "recent_activity": recent_activity_data,
                "stores_summary": stores_summary_data,
            },
            status=status.HTTP_200_OK,
        )


class OrganizationTeamView(APIView):
    """
    GET: Returns all team members across all branches of the organization.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        org = get_user_organization(user)
        if not org:
            return Response(
                {"detail": "Only organization owners can access organization-wide team directory."},
                status=status.HTTP_403_FORBIDDEN,
            )

        memberships = StoreMembership.objects.filter(
            store__organization=org
        ).select_related("user", "store").order_by("user__full_name")

        # Group by user
        users_map = {}
        for m in memberships:
            u_id = str(m.user.id)
            if u_id not in users_map:
                users_map[u_id] = {
                    "user_id": u_id,
                    "full_name": m.user.full_name,
                    "email": m.user.email,
                    "phone_number": m.user.phone_number,
                    "is_email_verified": m.user.is_email_verified,
                    "created_at": m.user.created_at.isoformat(),
                    "store_assignments": [],
                }
            users_map[u_id]["store_assignments"].append({
                "membership_id": str(m.id),
                "store_id": str(m.store.id),
                "store_name": m.store.name,
                "store_code": m.store.code,
                "role": m.role,
                "is_active": m.is_active,
            })

        # Also include the Owner in the list if not already
        owner_id = str(org.owner.id)
        if owner_id not in users_map:
            users_map[owner_id] = {
                "user_id": owner_id,
                "full_name": org.owner.full_name,
                "email": org.owner.email,
                "phone_number": org.owner.phone_number,
                "is_email_verified": org.owner.is_email_verified,
                "created_at": org.owner.created_at.isoformat(),
                "store_assignments": [
                    {
                        "membership_id": "owner-org",
                        "store_id": "all",
                        "store_name": "All Branches",
                        "store_code": "ORG-WIDE",
                        "role": "owner",
                        "is_active": True,
                    }
                ],
            }

        return Response(list(users_map.values()), status=status.HTTP_200_OK)


class OrganizationSettingsView(APIView):
    """
    GET, PATCH: View and update organization settings.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        org = get_user_organization(user)
        if not org:
            return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(OrganizationSettingsSerializer(org).data, status=status.HTTP_200_OK)

    def patch(self, request):
        user = request.user
        org = get_user_organization(user)
        if not org:
            return Response({"detail": "Only owners can update organization settings."}, status=status.HTTP_403_FORBIDDEN)

        serializer = OrganizationSettingsSerializer(org, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            updated_org = serializer.save()
            AuditEvent.log_event(
                event_type="ORGANIZATION_SETTINGS_UPDATED",
                request=request,
                user=user,
                organization=updated_org,
                details=request.data,
            )

        return Response(OrganizationSettingsSerializer(updated_org).data, status=status.HTTP_200_OK)
