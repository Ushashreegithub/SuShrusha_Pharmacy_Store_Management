from apps.partners.permissions import IsPartnerOwner
from apps.subscriptions.services import is_janjeevan_partner


class IsJanjeevanPartnerOwner(IsPartnerOwner):
    """
    Strict authorization enforcing that only the Janjeevan Partner Owner
    can access and manage pharmacy subscriptions.
    Blocks:
      - Other partner owners
      - Pharmacy managers, admins, and employees
      - Platform owners (is_staff/is_superuser)
      - Unauthenticated or inactive users
    """
    message = "Subscription management is restricted to authorized Janjeevan Partner Owners."

    def has_permission(self, request, view):
        # 1. Base partner owner authorization (authenticated, not staff, partner membership role=partner_owner)
        if not super().has_permission(request, view):
            return False

        # 2. Strict Janjeevan Partner identity check
        bound_partner = getattr(request, "bound_partner", None)
        if not bound_partner:
            from apps.organizations.domain_routing import is_local_dev
            if is_local_dev(request):
                bound_partner = getattr(request, "active_partner", None)

        if not bound_partner or not is_janjeevan_partner(bound_partner):
            return False

        if not getattr(request, "bound_partner", None):
            request.bound_partner = bound_partner

        return True
