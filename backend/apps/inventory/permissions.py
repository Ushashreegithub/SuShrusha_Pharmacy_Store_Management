from rest_framework import permissions
from apps.organizations.models import OrganizationMembership, StoreMembership


def is_user_org_owner(user, organization):
    """Checks if user has active owner or admin role in the organization."""
    if not user or not user.is_authenticated:
        return False
    return OrganizationMembership.objects.filter(
        organization=organization,
        user=user,
        role__in=["owner", "admin"],
        is_active=True
    ).exists()


def is_user_assigned_store_manager(user, store):
    """Checks if user is an active assigned Store Manager for the given store."""
    if not user or not user.is_authenticated:
        return False
    return StoreMembership.objects.filter(
        store=store,
        user=user,
        role="manager",
        is_active=True
    ).exists()


def is_user_store_member(user, store):
    """
    Checks if user has active store membership (Manager, Pharmacist, Cashier, Staff)
    or is an active owner of the store's organization.
    """
    if not user or not user.is_authenticated:
        return False
    # 1. Organization Owner has tenant-wide access to all stores
    if is_user_org_owner(user, store.organization):
        return True
    # 2. Store-level membership
    return StoreMembership.objects.filter(
        store=store,
        user=user,
        is_active=True
    ).exists()


def can_user_view_cost_data(user, store):
    """
    Returns True if user is authorized to view purchase cost and valuation metrics.
    Restricted strictly to Organization Owners and assigned Store Managers.
    Pharmacists, Cashiers, and Staff return False.
    """
    if not user or not user.is_authenticated:
        return False
    if is_user_org_owner(user, store.organization):
        return True
    if is_user_assigned_store_manager(user, store):
        return True
    return False


class CanPostStoreOpeningStock(permissions.BasePermission):
    """
    Permission class for Opening Stock intake.
    Allowed only to Organization Owners and assigned Store Managers of the specific store.
    Pharmacists, Cashiers, Staff, and unassigned Platform Admins are strictly forbidden.
    """
    message = "Only organization owners and assigned store managers can initialize opening stock."

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        # obj is expected to be a Store instance or have a .store attribute
        store = obj if hasattr(obj, "organization") and hasattr(obj, "code") else getattr(obj, "store", None)
        if not store:
            return False
        return is_user_org_owner(request.user, store.organization) or is_user_assigned_store_manager(request.user, store)


class CanViewStoreStock(permissions.BasePermission):
    """
    Permission class for viewing store stock listing.
    Allowed to any active member of the store (Owner, Manager, Pharmacist, Cashier, Staff).
    Unassigned users and cross-organization actors are strictly forbidden.
    """
    message = "You do not have permission to view inventory for this store."

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        store = obj if hasattr(obj, "organization") and hasattr(obj, "code") else getattr(obj, "store", None)
        if not store:
            return False
        return is_user_store_member(request.user, store)

