import secrets
import string
from django.utils import timezone
from django.contrib.sessions.models import Session
from apps.organizations.models import OrganizationMembership, StoreMembership


def generate_secure_temporary_password(length: int = 14) -> str:
    """
    Generates a cryptographically secure, high-entropy temporary password
    containing uppercase, lowercase, digits, and special characters.
    """
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.isupper() for c in password)
            and any(c.islower() for c in password)
            and any(c.isdigit() for c in password)
            and any(c in "!@#$%^&*" for c in password)
        ):
            return password


def get_active_session_count() -> int:
    """Returns the total number of currently unexpired sessions in the database."""
    try:
        return Session.objects.filter(expire_date__gt=timezone.now()).count()
    except Exception:
        return 0


def revoke_user_sessions(user) -> int:
    """
    Identifies and revokes all active database sessions belonging to the specified user.
    Safely decodes active sessions and deletes matching session keys.
    """
    if not user:
        return 0

    user_id_str = str(user.id)
    revoked_count = 0
    active_sessions = Session.objects.filter(expire_date__gt=timezone.now())
    sessions_to_delete = []

    for session in active_sessions:
        try:
            data = session.get_decoded()
            if str(data.get("_auth_user_id")) == user_id_str:
                sessions_to_delete.append(session.session_key)
        except Exception:
            continue

    if sessions_to_delete:
        revoked_count = Session.objects.filter(session_key__in=sessions_to_delete).delete()[0]

    return revoked_count


def revoke_organization_sessions(organization) -> int:
    """
    Revokes all active sessions for all owners, managers, and staff belonging to an organization.
    """
    if not organization:
        return 0

    org_user_ids = set(
        OrganizationMembership.objects.filter(organization=organization).values_list("user_id", flat=True)
    )
    store_user_ids = set(
        StoreMembership.objects.filter(store__organization=organization).values_list("user_id", flat=True)
    )
    all_user_ids = {str(uid) for uid in (org_user_ids | store_user_ids)}

    if not all_user_ids:
        return 0

    revoked_count = 0
    active_sessions = Session.objects.filter(expire_date__gt=timezone.now())
    sessions_to_delete = []

    for session in active_sessions:
        try:
            data = session.get_decoded()
            if str(data.get("_auth_user_id")) in all_user_ids:
                sessions_to_delete.append(session.session_key)
        except Exception:
            continue

    if sessions_to_delete:
        revoked_count = Session.objects.filter(session_key__in=sessions_to_delete).delete()[0]

    return revoked_count
