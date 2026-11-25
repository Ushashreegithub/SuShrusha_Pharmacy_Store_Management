import sys
import contextvars
from django.conf import settings
from apps.organizations.models import Organization, OrganizationMembership, StoreMembership
from apps.partners.models import Partner, PartnerMembership

# Context variable to hold the current request within the async/sync thread context
_current_request = contextvars.ContextVar("current_request", default=None)


def set_current_request(request):
    """Binds the current HTTP request to the context."""
    return _current_request.set(request)


def reset_current_request(token):
    """Resets the context variable after the request completes."""
    try:
        _current_request.reset(token)
    except Exception:
        pass


def get_current_request():
    """Returns the current HTTP request bound to this execution context."""
    return _current_request.get()


def _extract_user_and_request(user_or_request=None, request=None):
    req = None
    user = None

    if user_or_request is not None:
        if hasattr(user_or_request, "user"):
            req = user_or_request
            user = req.user
        elif hasattr(user_or_request, "is_authenticated"):
            user = user_or_request
            req = request or get_current_request()
    else:
        req = request or get_current_request()
        if req and hasattr(req, "user"):
            user = req.user

    return user, req


def get_authoritative_partner(user_or_request=None, request=None) -> Partner | None:
    """
    Resolves the active Partner for the current partner-domain request if the caller
    holds an active PartnerMembership. Returns None for customer pharmacy users or
    non-partner domains.
    In local development preview (localhost/127.0.0.1), resolves active Partner for Partner Owners.
    """
    user, req = _extract_user_and_request(user_or_request, request)
    if not user or not getattr(user, "is_authenticated", False) or not getattr(user, "is_active", False):
        return None

    if not req:
        # Fallback without request object (e.g. testing)
        mem = PartnerMembership.objects.filter(
            partner__is_active=True, user=user, is_active=True
        ).select_related("partner").first()
        return mem.partner if mem else None

    category = getattr(req, "domain_category", None)
    bound_partner = getattr(req, "bound_partner", None)

    if category == "partner" and bound_partner and bound_partner.is_active:
        is_partner_member = PartnerMembership.objects.filter(
            partner=bound_partner, user=user, is_active=True
        ).exists()
        return bound_partner if is_partner_member else None

    # In local development preview (localhost / 127.0.0.1), resolve partner for Partner Owners
    is_dev = getattr(settings, "DEBUG", False) or "test" in sys.argv
    if is_dev and category == "platform":
        session = getattr(req, "session", None)
        if session:
            sess_partner_id = session.get("active_partner_id")
            if sess_partner_id:
                mem = PartnerMembership.objects.filter(
                    partner_id=sess_partner_id, partner__is_active=True, user=user, is_active=True
                ).select_related("partner").first()
                if mem:
                    return mem.partner

        mem = PartnerMembership.objects.filter(
            partner__is_active=True, user=user, is_active=True
        ).select_related("partner").first()
        if mem:
            return mem.partner

    return None


def get_authoritative_organization(user_or_request=None, request=None) -> Organization | None:
    """
    Authoritative, security-hardened multi-tenant organization context resolver.

    Resolution rules:
    1. Partner Portal Domain (e.g. erp.sushrusaeclinic.com):
       - Partner Owners NEVER resolve an operational pharmacy organization.
       - Customer Pharmacy Managers/Staff strictly resolve active organizations belonging
         to bound_partner (`organization.partner == bound_partner, is_active=True`) where
         the caller holds an active OrganizationMembership or StoreMembership.
       - Session 'active_organization_id' selects among authorized partner-customer orgs.

    2. Dedicated Client Domain:
       - Uses request.bound_organization attached by DomainRoutingMiddleware.
       - Strictly enforces caller's active membership within THIS bound organization.

    3. Platform SaaS Domain (e.g. pharmapro.diracai.com):
       - Uses session 'active_organization_id' if active membership exists, else fallback.
    """
    user, req = _extract_user_and_request(user_or_request, request)

    if not user or not getattr(user, "is_authenticated", False) or not getattr(user, "is_active", False):
        return None

    if req:
        category = getattr(req, "domain_category", None)
        bound_org = getattr(req, "bound_organization", None)
        bound_partner = getattr(req, "bound_partner", None)

        # Priority 1A: Partner Portal Domain (Partner + Partner's Customer Pharmacies only)
        if category == "partner" or bound_partner:
            if not bound_partner or not bound_partner.is_active:
                return None

            # Partner Owners must never resolve a customer operational tenant context
            if PartnerMembership.objects.filter(
                partner=bound_partner, user=user, is_active=True
            ).exists():
                return None

            session = getattr(req, "session", None)
            if session:
                session_org_id = session.get("active_organization_id")
                if session_org_id:
                    mem = OrganizationMembership.objects.filter(
                        organization_id=session_org_id,
                        organization__partner=bound_partner,
                        organization__is_active=True,
                        user=user,
                        is_active=True,
                    ).select_related("organization").first()
                    if mem:
                        return mem.organization

                    sm = StoreMembership.objects.filter(
                        store__organization_id=session_org_id,
                        store__organization__partner=bound_partner,
                        store__organization__is_active=True,
                        user=user,
                        is_active=True,
                    ).select_related("store__organization").first()
                    if sm:
                        return sm.store.organization

            # Deterministic fallback across caller's active customer orgs under bound_partner
            org_mem = OrganizationMembership.objects.filter(
                organization__partner=bound_partner,
                organization__is_active=True,
                user=user,
                is_active=True,
            ).select_related("organization").order_by("created_at").first()
            if org_mem:
                return org_mem.organization

            store_mem = StoreMembership.objects.filter(
                store__organization__partner=bound_partner,
                store__organization__is_active=True,
                user=user,
                is_active=True,
            ).select_related("store__organization").order_by("created_at").first()
            if store_mem:
                return store_mem.store.organization

            return None

        # Priority 1B: Dedicated Client Domain
        if category == "client" or bound_org:
            if not bound_org or not bound_org.is_active:
                return None

            has_org = OrganizationMembership.objects.filter(
                organization=bound_org, user=user, is_active=True
            ).exists()
            has_store = StoreMembership.objects.filter(
                store__organization=bound_org, user=user, is_active=True
            ).exists()

            if has_org or has_store:
                return bound_org

            return None

        # Priority 2: Platform domain with active session organization
        session = getattr(req, "session", None)
        if session:
            session_org_id = session.get("active_organization_id")
            if session_org_id:
                mem = OrganizationMembership.objects.filter(
                    organization_id=session_org_id, user=user, is_active=True
                ).select_related("organization").first()
                if mem and mem.organization.is_active:
                    return mem.organization

                sm = StoreMembership.objects.filter(
                    store__organization_id=session_org_id, user=user, is_active=True
                ).select_related("store__organization").first()
                if sm and sm.store.organization.is_active:
                    return sm.store.organization

    if req and getattr(req, "domain_category", None) in ("client", "partner"):
        return None

    # Partner Owners never resolve a customer operational tenant organization
    if PartnerMembership.objects.filter(user=user, is_active=True).exists() and not (user.is_staff and user.is_superuser):
        return None

    org_mem = OrganizationMembership.objects.filter(
        user=user, is_active=True
    ).select_related("organization").first()
    if org_mem and org_mem.organization.is_active:
        return org_mem.organization

    store_mem = StoreMembership.objects.filter(
        user=user, is_active=True
    ).select_related("store__organization").first()
    if store_mem and store_mem.store.organization.is_active:
        return store_mem.store.organization

    return None
