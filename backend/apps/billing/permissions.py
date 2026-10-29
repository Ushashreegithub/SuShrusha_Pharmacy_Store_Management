from rest_framework import permissions
from apps.organizations.models import OrganizationMembership, StoreMembership
from apps.inventory.permissions import is_user_org_owner, is_user_assigned_store_manager, is_user_store_member


def get_user_store_role(user, store) -> str | None:
    """Returns the effective role of the user within the store context."""
    if not user or not user.is_authenticated or not user.is_active:
        return None
    if is_user_org_owner(user, store.organization):
        return "owner"
    sm = StoreMembership.objects.filter(store=store, user=user, is_active=True).first()
    return sm.role if sm else None


class CanAccessBilling(permissions.BasePermission):
    """
    Allows billing operations (POS, drafts, customer lookup) to active store members
    (Owner, Store Manager, Cashier, Pharmacist, Staff).
    Rejects cross-tenant access and unassigned users.
    """
    message = "You do not have cashier/billing permissions for this store."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_active)

    def has_object_permission(self, request, view, obj):
        store = getattr(obj, "store", obj)
        if not store:
            return False
        return is_user_store_member(request.user, store)


class CanApproveDiscount(permissions.BasePermission):
    """
    Allows manual discount approvals.
    Restricted strictly to Organization Owners and assigned Store Managers.
    Cashiers and Pharmacists are strictly prohibited from approving discounts.
    """
    message = "Only organization owners and assigned store managers can approve manual discounts."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_active)

    def has_object_permission(self, request, view, obj):
        store = getattr(obj, "store", obj)
        if not store:
            return False
        return is_user_org_owner(request.user, store.organization) or is_user_assigned_store_manager(request.user, store)


class CanAuthorizePrescription(permissions.BasePermission):
    """
    Allows pharmacist dispensing authorization for Schedule H / H1 / X / Rx drugs.
    Restricted to registered Pharmacists, Store Managers, and Owners.
    Plain Cashiers cannot authorize restricted dispensing.
    """
    message = "Only a registered pharmacist or authorized store manager can approve prescription dispensing."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_active)

    def has_object_permission(self, request, view, obj):
        store = getattr(obj, "store", obj)
        if not store:
            return False
        if is_user_org_owner(request.user, store.organization):
            return True
        role = get_user_store_role(request.user, store)
        return role in ["manager", "pharmacist"]

