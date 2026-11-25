from rest_framework import permissions
from apps.organizations.domain_routing import normalize_host, classify_domain


class IsPlatformOwner(permissions.BasePermission):
    """
    Strict authorization permission class for Platform Owners.
    Requires:
      1. Authenticated user
      2. Active user account (is_active=True)
      3. is_staff=True
      4. is_superuser=True
      5. Originates from an approved platform host (never a tenant client domain).
    Both role flags (is_staff and is_superuser) must be true.
    """
    message = "You do not have authorization to access platform administration."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False

        if not (user.is_staff and user.is_superuser):
            return False

        # Domain boundary check: platform APIs must only be accessed via platform domains
        host = normalize_host(request.get_host())
        domain_category, _ = classify_domain(host)
        if domain_category != "platform" and host not in ("localhost", "127.0.0.1", "testserver"):
            return False

        return True
