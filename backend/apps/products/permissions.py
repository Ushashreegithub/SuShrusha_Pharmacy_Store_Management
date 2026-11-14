from rest_framework import permissions
from apps.organizations.models import OrganizationMembership, StoreMembership


def get_user_organization(user_or_request, request=None):
    """
    Authoritative, domain-aware tenant context resolver.
    """
    from apps.organizations.tenant_context import get_authoritative_organization
    return get_authoritative_organization(user_or_request, request=request)


def is_user_owner_or_manager(user, organization=None):
    """
    Checks if user is an Organization Owner or an active Store Manager in the given organization.
    Enforces strict organization scoping to prevent cross-tenant elevation.
    """
    if not user or not user.is_authenticated:
        return False

    if not organization:
        organization = get_user_organization(user)
    if not organization:
        return False

    # Owner check
    is_owner = OrganizationMembership.objects.filter(
        organization=organization, user=user, role__in=["owner", "admin"], is_active=True
    ).exists()
    if is_owner:
        return True

    # Manager check
    is_manager = StoreMembership.objects.filter(
        store__organization=organization, user=user, role="manager", is_active=True
    ).exists()
    return is_manager


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


class CanImportProducts(permissions.BasePermission):
    """
    Permission class for bulk Excel medicine catalogue import.
    Strictly matches existing product write permissions (Owners and Store Managers only).
    """
    message = "Only organization owners and store managers can import medicines into the catalogue."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        org = get_user_organization(request.user)
        if not org:
            self.message = "You are not assigned to an active pharmacy organization."
            return False

        if not is_user_owner_or_manager(request.user, org):
            return False

        return True

