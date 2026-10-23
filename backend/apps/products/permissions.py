from rest_framework import permissions
from apps.organizations.models import OrganizationMembership, StoreMembership


def get_user_organization(user):
    """
    Resolves the caller's active Organization.
    1. If user is owner: returns active owned organization.
    2. If user is member: returns active organization membership.
    3. If user has store membership: returns active store's organization.
    Returns None if user is unassigned or inactive.
    """
    if not user or not user.is_authenticated:
        return None

    # 1. Organization Owner / Admin
    org_membership = OrganizationMembership.objects.filter(
        user=user, is_active=True
    ).select_related("organization").first()
    if org_membership and org_membership.organization.is_active:
        return org_membership.organization

    # 2. Store-level membership (Manager, Pharmacist, Cashier, Staff)
    store_membership = StoreMembership.objects.filter(
        user=user, is_active=True
    ).select_related("store__organization").first()
    if store_membership and store_membership.store.organization.is_active:
        return store_membership.store.organization

    return None


def is_user_owner_or_manager(user, organization=None):
    """
    Checks if user is an Organization Owner or an active Store Manager in the given organization.
    """
    if not user or not user.is_authenticated:
        return False

    # Owner check
    is_owner = OrganizationMembership.objects.filter(
        user=user, role__in=["owner", "admin"], is_active=True
    )
    if organization:
        is_owner = is_owner.filter(organization=organization)
    if is_owner.exists():
        return True

    # Manager check
    is_manager = StoreMembership.objects.filter(
        user=user, role="manager", is_active=True
    )
    if organization:
        is_manager = is_manager.filter(store__organization=organization)
    return is_manager.exists()


class CanManageProducts(permissions.BasePermission):
    """
    Permission class for product catalog operations:
    - Safe methods (GET, HEAD, OPTIONS): Accessible to Owners, Managers, and Staff in the organization.
    - Unsafe methods (POST, PATCH, PUT, DELETE): Restricted to Owners and Store Managers. Staff are read-only.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        org = get_user_organization(request.user)
        if not org:
            self.message = "You are not assigned to an active pharmacy organization."
            return False

        # Read methods allowed for all active organization members
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write/Update methods restricted to Owner & Store Managers
        if not is_user_owner_or_manager(request.user, org):
            self.message = "Pharmacy staff have read-only catalog access. Only organization owners and store managers can create, edit, or archive products."
            return False

        return True

    def has_object_permission(self, request, view, obj):
        org = get_user_organization(request.user)
        if not org or obj.organization_id != org.id:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        return is_user_owner_or_manager(request.user, org)

