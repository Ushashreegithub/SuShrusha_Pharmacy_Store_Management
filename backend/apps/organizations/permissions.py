from rest_framework import permissions
from apps.organizations.models import OrganizationMembership, StoreMembership


class IsOrganizationOwner(permissions.BasePermission):
    """
    Allows access only to authenticated users who are active owners of an organization.
    """
    message = "Only pharmacy organization owners are authorized to perform this action."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return OrganizationMembership.objects.filter(
            user=request.user, role="owner", is_active=True
        ).exists()


class IsStoreManagerOrOwner(permissions.BasePermission):
    """
    Allows access to organization owners or managers assigned to the store.
    """
    message = "You do not have management permissions for this store."

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        # Support both Store objects and objects with a .store attribute
        store = obj if hasattr(obj, "organization") and hasattr(obj, "code") else getattr(obj, "store", None)
        if not store:
            return False

        # Owner has full scope over organization stores
        if OrganizationMembership.objects.filter(
            organization=store.organization, user=request.user, role="owner", is_active=True
        ).exists():
            return True

        # Store manager check
        return StoreMembership.objects.filter(
            store=store, user=request.user, role="manager", is_active=True
        ).exists()

