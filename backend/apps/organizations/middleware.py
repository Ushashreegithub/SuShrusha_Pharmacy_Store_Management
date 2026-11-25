from django.http import JsonResponse
from django.conf import settings
from django.db.models import Q
from apps.organizations.domain_routing import classify_host_context, normalize_host
from apps.organizations.models import OrganizationMembership, StoreMembership
from apps.organizations.tenant_context import (
    set_current_request,
    reset_current_request,
    get_authoritative_organization,
    get_authoritative_partner,
)


class DomainRoutingMiddleware:
    """
    Classifies incoming requests by Host header into Platform, Partner, Client, or Unknown.
    Fails closed for unknown/unverified domains and isolates Platform vs Partner endpoints.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        raw_host = request.get_host()
        category, bound_org, bound_partner = classify_host_context(raw_host)

        request.domain_category = category
        request.bound_organization = bound_org
        request.bound_partner = bound_partner

        norm = normalize_host(raw_host)
        # In DEBUG or testserver, treat localhost/127.0.0.1/testserver as platform
        if (settings.DEBUG or norm == "testserver") and (norm in ("localhost", "127.0.0.1", "testserver")):
            request.domain_category = "platform"
            category = "platform"

        # Unknown host fail-closed
        if category == "unknown":
            return JsonResponse(
                {"detail": "Invalid or unrecognized host domain."},
                status=400,
            )

        # Platform API boundary check: non-platform domains must NEVER access /api/platform/
        if request.path.startswith("/api/platform/"):
            if category != "platform":
                return JsonResponse(
                    {"detail": "Platform administration endpoints are restricted to platform hosts."},
                    status=403,
                )

        # Partner API boundary check: partner endpoints are restricted to active partner hosts
        if request.path.startswith("/api/partner/"):
            if category != "partner":
                from apps.organizations.domain_routing import is_local_dev
                if is_local_dev(request):
                    # In local development preview (localhost / 127.0.0.1 / testserver),
                    # allow requests to pass to SessionMiddleware, AuthenticationMiddleware,
                    # and TenantContextMiddleware where PartnerMembership and partner_owner role
                    # are strictly validated.
                    pass
                else:
                    return JsonResponse(
                        {"detail": "Partner administration endpoints are restricted to authorized partner domains."},
                        status=403,
                    )

        return self.get_response(request)


class TenantContextMiddleware:
    """
    Attaches request.active_organization and request.active_partner and enforces
    tenant/partner boundary validation and mandatory password change.
    """
    EXEMPT_PATHS = {
        "/api/auth/change-password/",
        "/api/auth/logout/",
        "/api/auth/me/",
        "/api/auth/csrf/",
        "/api/health/",
    }

    OPERATIONAL_API_PREFIXES = (
        "/api/organizations/",
        "/api/products/",
        "/api/inventory/",
        "/api/billing/",
        "/api/audit/",
        "/api/invitations/",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = set_current_request(request)
        try:
            request.active_organization = get_authoritative_organization(request)
            request.active_partner = get_authoritative_partner(request)

            # In local development preview (localhost / 127.0.0.1 / testserver),
            # ensure partner context is bound for partner administration APIs
            from apps.organizations.domain_routing import is_local_dev
            if is_local_dev(request):
                if request.active_partner and not getattr(request, "bound_partner", None):
                    request.bound_partner = request.active_partner
                if request.path.startswith("/api/partner/") and getattr(request, "bound_partner", None):
                    request.domain_category = "partner"

            if request.user and request.user.is_authenticated:
                # 1. Enforce password change requirement
                if getattr(request.user, "must_change_password", False):
                    if request.path.startswith("/api/") and request.path not in self.EXEMPT_PATHS:
                        return JsonResponse(
                            {
                                "detail": "Password change required before accessing the system.",
                                "code": "MUST_CHANGE_PASSWORD",
                            },
                            status=403,
                        )

                # 2. Centralized Subscription Expiry Enforcement for Janjeevan Partner Pharmacies
                active_org = request.active_organization
                if active_org and active_org.partner_id and request.path.startswith(self.OPERATIONAL_API_PREFIXES):
                    from apps.subscriptions.services import is_janjeevan_partner
                    if is_janjeevan_partner(active_org.partner_id):
                        sub = getattr(active_org, "subscription", None)
                        if sub is None:
                            from apps.subscriptions.models import OrganizationSubscription
                            sub = OrganizationSubscription.objects.filter(organization=active_org).first()
                        if sub:
                            from django.utils import timezone
                            now = timezone.now()
                            is_expired = (
                                sub.status == "expired"
                                or (
                                    sub.status in ("active", "trialing")
                                    and sub.current_period_end is not None
                                    and sub.current_period_end < now
                                )
                            )
                            if is_expired:
                                if sub.status != "expired":
                                    sub.status = "expired"
                                    sub.save(update_fields=["status", "updated_at"])
                                return JsonResponse(
                                    {
                                        "detail": "Your pharmacy subscription has expired. Please contact Janjeevan support or your administrator to renew.",
                                        "code": "SUBSCRIPTION_EXPIRED",
                                        "organization_id": str(active_org.id),
                                        "organization_name": active_org.name,
                                        "expired_at": sub.current_period_end.isoformat() if sub.current_period_end else None,
                                    },
                                    status=403,
                                )

                category = getattr(request, "domain_category", None)

                # 2. Domain-bound client organization validation & suspension blocking
                if category == "client":
                    if not request.active_organization:
                        from django.contrib.auth import logout
                        logout(request)
                        return JsonResponse(
                            {"detail": "Access to this organization domain is restricted to active members."},
                            status=401,
                        )
                    if not request.active_organization.is_active:
                        from django.contrib.auth import logout
                        logout(request)
                        return JsonResponse(
                            {"detail": "This pharmacy organization has been suspended or is inactive."},
                            status=403,
                        )

                # 3. Partner portal validation & isolation
                elif category == "partner":
                    bound_partner = getattr(request, "bound_partner", None)
                    if not bound_partner or not bound_partner.is_active:
                        from django.contrib.auth import logout
                        logout(request)
                        return JsonResponse(
                            {"detail": "This partner portal is suspended or inactive."},
                            status=403,
                        )

                    if request.active_partner:
                        # Partner Owner must never access customer operational pharmacy APIs
                        if request.path.startswith(self.OPERATIONAL_API_PREFIXES):
                            return JsonResponse(
                                {"detail": "Partner administrators cannot access customer pharmacy operational data."},
                                status=403,
                            )
                    else:
                        # Customer pharmacy user on partner portal
                        if not request.active_organization:
                            from django.contrib.auth import logout
                            # Check whether user has an inactive/suspended membership under this partner
                            has_suspended_org = (
                                OrganizationMembership.objects.filter(
                                    organization__partner=bound_partner,
                                    organization__is_active=False,
                                    user=request.user,
                                ).exists()
                                or StoreMembership.objects.filter(
                                    store__organization__partner=bound_partner,
                                    store__organization__is_active=False,
                                    user=request.user,
                                ).exists()
                            )
                            logout(request)
                            if has_suspended_org:
                                return JsonResponse(
                                    {"detail": "This pharmacy organization has been suspended or is inactive."},
                                    status=403,
                                )
                            return JsonResponse(
                                {"detail": "Access to this partner portal is restricted to active members."},
                                status=401,
                            )

                        if not request.active_organization.is_active:
                            from django.contrib.auth import logout
                            logout(request)
                            return JsonResponse(
                                {"detail": "This pharmacy organization has been suspended or is inactive."},
                                status=403,
                            )

                # 4. Platform host validation & partner owner operational barrier
                elif category == "platform":
                    from apps.partners.models import PartnerMembership
                    is_partner = bool(request.active_partner) or PartnerMembership.objects.filter(user=request.user, is_active=True).exists()
                    if is_partner and not (request.user.is_staff and request.user.is_superuser):
                        if request.path.startswith(self.OPERATIONAL_API_PREFIXES):
                            return JsonResponse(
                                {"detail": "Partner administrators cannot access customer pharmacy operational data."},
                                status=403,
                            )

            return self.get_response(request)
        finally:
            reset_current_request(token)
