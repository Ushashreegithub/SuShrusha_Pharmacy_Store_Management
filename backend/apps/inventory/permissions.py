from rest_framework import permissions
from apps.organizations.models import OrganizationMembership, StoreMembership


def is_user_org_owner(user, organization):
    """Checks if user has active owner or admin role in the active organization."""
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if organization and not organization.is_active:
        return False
    return OrganizationMembership.objects.filter(
        organization=organization,
        user=user,
        role__in=["owner", "admin"],
        is_active=True
    ).exists()


def is_user_assigned_store_manager(user, store):
    """Checks if user is an active assigned Store Manager for the given active store."""
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if store and store.organization and not store.organization.is_active:
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
    or is an active owner of the store's active organization.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if store and store.organization and not store.organization.is_active:
        return False
    # 1. Organization Owner has tenant-wide access to all stores in the organization
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
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if store and store.organization and not store.organization.is_active:
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


def get_user_organization(user):
    """Resolves the caller's active Organization from memberships."""
    if not user or not user.is_authenticated or not user.is_active:
        return None
    org_membership = OrganizationMembership.objects.filter(
        user=user, is_active=True
    ).select_related("organization").first()
    if org_membership and org_membership.organization.is_active:
        return org_membership.organization
    store_membership = StoreMembership.objects.filter(
        user=user, is_active=True
    ).select_related("store__organization").first()
    if store_membership and store_membership.store.organization.is_active:
        return store_membership.store.organization
    return None


class CanManageSuppliers(permissions.BasePermission):
    """
    Permission class for Supplier Master:
    - SAFE methods (GET, HEAD, OPTIONS): Accessible to any active organization/store member.
    - MUTATING methods (POST, PATCH, PUT): Restricted to Organization Owners and Store Managers.
    """
    message = "Only organization owners and store managers can create or modify suppliers."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated or not request.user.is_active:
            return False
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_user_org_owner(request.user, org) or StoreMembership.objects.filter(
            store__organization=org, user=request.user, role="manager", is_active=True
        ).exists()

    def has_object_permission(self, request, view, obj):
        org = getattr(obj, "organization", None)
        if not org or not org.is_active:
            return False
        user_org = get_user_organization(request.user)
        if not user_org or user_org.id != org.id:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_user_org_owner(request.user, org) or StoreMembership.objects.filter(
            store__organization=org, user=request.user, role="manager", is_active=True
        ).exists()


class CanManageGoodsReceipts(permissions.BasePermission):
    """
    Permission class for Goods Receipt / Purchase Inward:
    - View receipts: Allowed to any active member of the store.
    - Draft receipts: Allowed to store members (Pharmacist, Manager, Owner).
    - Post receipts to inventory: Restricted to Organization Owners and assigned Store Managers.
    """
    message = "You do not have permission to perform this goods receipt operation."

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_active

    def has_object_permission(self, request, view, obj):
        store = obj if hasattr(obj, "organization") and hasattr(obj, "code") else getattr(obj, "store", None)
        if not store or not store.organization.is_active:
            return False
        return is_user_store_member(request.user, store)


class CanManageTransfers(permissions.BasePermission):
    """
    Permission class for Inter-Store Stock Transfers:
    - View transfers: Allowed to active members of source_store, destination_store, or Org Owner.
    - Create transfers: Allowed to active members of source_store or Org Owner.
    """
    message = "You do not have permission to view or manage transfers for this store."

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_active

    def has_object_permission(self, request, view, obj):
        transfer = obj
        if hasattr(obj, "transfer"):
            transfer = obj.transfer
        elif hasattr(obj, "stock_transfer"):
            transfer = obj.stock_transfer
        elif hasattr(obj, "transfer_item"):
            transfer = obj.transfer_item.transfer

        source_store = getattr(transfer, "source_store", None)
        destination_store = getattr(transfer, "destination_store", None)
        if not source_store or not destination_store:
            return False

        org = source_store.organization
        if not org or not org.is_active:
            return False

        if is_user_org_owner(request.user, org):
            return True

        return is_user_store_member(request.user, source_store) or is_user_store_member(request.user, destination_store)


class CanManageAdjustments(permissions.BasePermission):
    """
    Permission class for Stock Adjustments:
    - View adjustments: Active members of the store or Org Owner.
    - Create/request adjustments: Active members of the store or Org Owner.
    - Approve/post adjustments: Handled with fine-grained checks in views (requires Owner or assigned Manager).
    """
    message = "You do not have permission to view or manage stock adjustments for this store."

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_active

    def has_object_permission(self, request, view, obj):
        store = getattr(obj, "store", None)
        if not store:
            return False
        org = store.organization
        if not org or not org.is_active:
            return False
        if is_user_org_owner(request.user, org):
            return True
        return is_user_store_member(request.user, store)


class CanManageStockCounts(permissions.BasePermission):
    """
    Permission class for Physical Stock Count sessions:
    - View sessions: Active members of the store or Org Owner.
    - Record counts: Active members of the store or Org Owner.
    - Reconcile / generate adjustments: Restricted to Org Owner or assigned Store Manager.
    """
    message = "You do not have permission to view or manage physical stock counts for this store."

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_active

    def has_object_permission(self, request, view, obj):
        store = getattr(obj, "store", None)
        if not store and hasattr(obj, "stock_count"):
            store = obj.stock_count.store
        if not store:
            return False
        org = store.organization
        if not org or not org.is_active:
            return False
        if is_user_org_owner(request.user, org):
            return True
        return is_user_store_member(request.user, store)


# =============================================================================
# Milestone 2C.4: Quarantine & Recall Permissions
# =============================================================================

class CanManageQuarantine(permissions.BasePermission):
    """
    Permission class for Quarantine workflows:
    - View quarantine records: Active store members or Org Owner.
    - Initiate quarantine: Store Pharmacist, Manager, or Org Owner.
    - Release / dispose: Store Manager or Org Owner.
    """
    message = "You do not have permission to view or manage quarantine records for this store."

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_active

    def has_object_permission(self, request, view, obj):
        store = getattr(obj, "store", None)
        if not store:
            return False
        org = store.organization
        if not org or not org.is_active:
            return False
        if is_user_org_owner(request.user, org):
            return True
        return is_user_store_member(request.user, store)


class CanManageRecalls(permissions.BasePermission):
    """
    Permission class for Batch Recall workflows:
    - View recall notices: Active members of any store within the organization or Org Owner.
    - Initiate / release recall: Organization Owner only.
    - Disposition: Organization Owner or assigned Store Manager.
    """
    message = "You do not have permission to manage organization-level batch recalls."

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_active

    def has_object_permission(self, request, view, obj):
        org = getattr(obj, "organization", None)
        if not org:
            return False
        if not org.is_active:
            return False
        # Organization Owners have full recall administration
        if is_user_org_owner(request.user, org):
            return True
        # For viewing recall notices, active store members within the org are permitted
        if request.method in permissions.SAFE_METHODS:
            return StoreMembership.objects.filter(
                user=request.user,
                store__organization=org,
                is_active=True
            ).exists()
        return False




