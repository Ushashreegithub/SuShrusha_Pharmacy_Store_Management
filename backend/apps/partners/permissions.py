from rest_framework import permissions
from apps.partners.models import PartnerMembership


class IsPartnerOwner(permissions.BasePermission):
    """
    Strict authorization for Partner Owners (e.g. Sushrusha E-Clinic).
    Requires:
      1. Authenticated, active user
      2. NOT a PharmaPro platform admin (is_staff/is_superuser)
      3. Request classified as an active partner host (domain_category == 'partner')
      4. Active PartnerMembership with role='partner_owner' for request.bound_partner
    """
    message = "You do not have partner administration authorization."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False

        if user.is_staff or user.is_superuser:
            return False

        bound_partner = getattr(request, "bound_partner", None)
        if getattr(request, "domain_category", None) != "partner":
            from apps.organizations.domain_routing import is_local_dev
            if is_local_dev(request):
                bound_partner = bound_partner or getattr(request, "active_partner", None)
                if not bound_partner:
                    return False
            else:
                return False

        if not bound_partner or not bound_partner.is_active:
            return False

        # Ensure request.bound_partner is attached for view access
        if not getattr(request, "bound_partner", None):
            request.bound_partner = bound_partner

        return PartnerMembership.objects.filter(
            partner=bound_partner,
            user=user,
            role="partner_owner",
            is_active=True,
        ).exists()
