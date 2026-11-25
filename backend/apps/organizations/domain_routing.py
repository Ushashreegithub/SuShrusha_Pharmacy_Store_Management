import sys
from django.conf import settings
from django.db.models import Q
from apps.organizations.models import Organization, OrganizationDomain
from apps.partners.models import Partner, PartnerDomain


def normalize_host(host_string: str | None) -> str:
    """
    Normalizes a hostname:
    - Strips port numbers (:8000, :3000, etc.)
    - Lowercases
    - Strips whitespace and trailing periods
    """
    if not host_string:
        return ""
    host = host_string.split(":")[0].strip().lower()
    return host.rstrip(".")


def is_local_dev(request=None) -> bool:
    """
    Returns True if running in local development mode (DEBUG=True or test suite).
    If a request is provided, also checks that the normalized host is a local host
    (localhost, 127.0.0.1, testserver, or *.localhost).
    """
    is_debug_or_test = bool(getattr(settings, "DEBUG", False) or "test" in sys.argv)
    if not is_debug_or_test:
        return False
    if request:
        raw_host = request.get_host() if hasattr(request, "get_host") else str(request)
        host = normalize_host(raw_host)
        return host in ("localhost", "127.0.0.1", "testserver") or host.endswith(".localhost")
    return True


def get_platform_domains() -> set[str]:
    """
    Returns configured platform domains (PharmaPro SaaS platform).
    Defaults to pharmapro.diracai.com, localhost, 127.0.0.1.
    """
    configured = getattr(settings, "PLATFORM_DOMAINS", [])
    defaults = {"pharmapro.diracai.com", "localhost", "127.0.0.1"}
    return defaults.union(set(configured))


def _lookup_partner_domain(domain: str) -> tuple[bool, Partner | None]:
    """
    Authoritative PartnerDomain DB lookup.
    Returns (record_exists, verified_active_partner_or_none).
    """
    try:
        db_record = (
            PartnerDomain.objects.filter(domain=domain)
            .select_related("partner")
            .first()
        )
        if db_record is not None:
            if (
                db_record.is_verified
                and db_record.status == "active"
                and db_record.partner
                and db_record.partner.is_active
            ):
                return (True, db_record.partner)
            return (True, None)
    except Exception:
        return (False, None)
    return (False, None)


def _lookup_client_domain(domain: str) -> tuple[bool, Organization | None]:
    """
    Authoritative OrganizationDomain DB lookup.
    Returns (record_exists, verified_active_organization_or_none).
    """
    try:
        db_record = (
            OrganizationDomain.objects.filter(domain=domain)
            .select_related("organization")
            .first()
        )
        if db_record is not None:
            if (
                db_record.is_verified
                and db_record.status == "active"
                and db_record.organization
                and db_record.organization.is_active
            ):
                return (True, db_record.organization)
            return (True, None)
    except Exception:
        return (False, None)
    return (False, None)


def get_domain_bound_partner(host_string: str | None) -> Partner | None:
    """
    Resolves a normalized partner domain to its verified active Partner.
    DB PartnerDomain lookup is authoritative and fails closed on non-active/unverified rows.
    """
    domain = normalize_host(host_string)
    if not domain:
        return None

    exists, partner = _lookup_partner_domain(domain)
    if exists:
        return partner

    # Explicit local development preview (.localhost) only when Partner exists in DB
    is_dev_or_test = bool(getattr(settings, "DEBUG", False) or "test" in sys.argv)
    if is_dev_or_test and domain.endswith(".localhost"):
        partner_map = getattr(settings, "PARTNER_DOMAIN_MAP", {})
        partner_identifier = partner_map.get(domain)
        if partner_identifier:
            try:
                return Partner.objects.filter(
                    Q(slug=partner_identifier) | Q(name=partner_identifier),
                    is_active=True,
                ).first()
            except Exception:
                pass

    return None


def get_domain_bound_organization(host_string: str | None) -> Organization | None:
    """
    Resolves a normalized client domain to its verified active Organization.
    1. Database OrganizationDomain lookup is strictly authoritative:
       If a record exists, it MUST have is_verified=True, status='active', and organization.is_active=True.
       If a record exists in pending, unverified, suspended, or revoked state, fail closed immediately.
    2. Explicit local development preview (.localhost) only applies when DEBUG=True or running tests,
       and only if no database record overrides it. Production domains never bypass DB verification.
    """
    domain = normalize_host(host_string)
    if not domain:
        return None

    exists, org = _lookup_client_domain(domain)
    if exists:
        return org

    # Explicit local development preview (.localhost) only
    is_dev_or_test = bool(getattr(settings, "DEBUG", False) or "test" in sys.argv)
    if is_dev_or_test and domain.endswith(".localhost"):
        client_map = getattr(settings, "CLIENT_DOMAIN_ORGANIZATION_MAP", {})
        org_identifier = client_map.get(domain)
        if org_identifier:
            try:
                return Organization.objects.filter(
                    Q(slug=org_identifier) | Q(name=org_identifier),
                    is_active=True,
                ).first()
            except Exception:
                pass

    return None


def classify_host_context(host_string: str | None) -> tuple[str, Organization | None, Partner | None]:
    """
    Classifies an incoming host into:
    - ("partner", None, Partner)
    - ("client", Organization, None)
    - ("platform", None, None)
    - ("unknown", None, None)
    """
    domain = normalize_host(host_string)
    if not domain:
        return ("unknown", None, None)

    # 1. Authoritative DB lookup: PartnerDomain
    partner_exists, partner_obj = _lookup_partner_domain(domain)
    if partner_exists:
        if partner_obj:
            return ("partner", None, partner_obj)
        return ("unknown", None, None)

    # 2. Authoritative DB lookup: OrganizationDomain
    client_exists, client_org = _lookup_client_domain(domain)
    if client_exists:
        if client_org:
            return ("client", client_org, None)
        return ("unknown", None, None)

    # 3. Local dev preview (.localhost) fallback only
    is_dev_or_test = bool(getattr(settings, "DEBUG", False) or "test" in sys.argv)
    if is_dev_or_test and domain.endswith(".localhost"):
        partner_obj = get_domain_bound_partner(domain)
        if partner_obj:
            return ("partner", None, partner_obj)
        client_org = get_domain_bound_organization(domain)
        if client_org:
            return ("client", client_org, None)

    # 4. Platform domains
    if domain in get_platform_domains():
        return ("platform", None, None)

    return ("unknown", None, None)


def classify_domain(host_string: str | None) -> tuple[str, Organization | None]:
    """
    Backward-compatible 2-tuple classifier:
    - ("platform", None)
    - ("partner", None)
    - ("client", Organization)
    - ("unknown", None)
    """
    category, org, _partner = classify_host_context(host_string)
    return (category, org)
