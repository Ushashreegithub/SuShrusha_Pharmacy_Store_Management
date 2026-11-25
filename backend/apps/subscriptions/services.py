from datetime import timedelta
from decimal import Decimal
from django.db import transaction
from django.db.models import Q, Count
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.audit.models import AuditEvent
from apps.subscriptions.models import OrganizationSubscription, SubscriptionPayment

JANJEEVAN_PARTNER_SLUG = "sushrusha-eclinic"
JANJEEVAN_PARTNER_IDS = {
    "34fa8868-0a34-4fe3-8d96-ea59fd178e88",
    "1332abd4-e807-4fd9-8a24-e11f4497c098",
}


def is_janjeevan_partner(partner_or_id) -> bool:
    """
    Identifies whether a partner entity or UUID represents the Janjeevan / Sushrusha partner.
    Supports local dev UUIDs, production UUID, and the canonical partner slug.
    """
    if not partner_or_id:
        return False
    if hasattr(partner_or_id, "slug"):
        if partner_or_id.slug == JANJEEVAN_PARTNER_SLUG:
            return True
    if hasattr(partner_or_id, "id"):
        pid = str(partner_or_id.id)
        if pid in JANJEEVAN_PARTNER_IDS:
            return True

    pid_str = str(partner_or_id).strip()
    if pid_str in JANJEEVAN_PARTNER_IDS or pid_str == JANJEEVAN_PARTNER_SLUG:
        return True

    from apps.partners.models import Partner
    try:
        return Partner.objects.filter(
            Q(id=partner_or_id) if len(pid_str) == 36 else Q(slug=pid_str),
            slug=JANJEEVAN_PARTNER_SLUG,
        ).exists()
    except Exception:
        return False


def confirm_manual_payment(
    subscription: OrganizationSubscription,
    amount: Decimal,
    confirmed_by,
    currency: str = "INR",
    payment_reference: str = "",
    notes: str = "",
) -> tuple[SubscriptionPayment, OrganizationSubscription]:
    """
    Records an append-only manual payment and extends subscription validity by 365 days.
    - If currently valid, extends from existing current_period_end.
    - If expired or not_started, starts validity from now.
    - Transitions status to ACTIVE.
    """
    if amount <= Decimal("0.00"):
        raise ValidationError("Payment amount must be greater than zero.")

    with transaction.atomic():
        sub = (
            OrganizationSubscription.objects.select_for_update()
            .select_related("organization", "partner")
            .get(pk=subscription.pk)
        )

        now = timezone.now()
        prev_status = sub.status

        # Calculate extension
        if sub.current_period_end and sub.current_period_end > now and sub.status in (
            OrganizationSubscription.Status.ACTIVE,
            OrganizationSubscription.Status.TRIALING,
        ):
            period_start = sub.current_period_end
            period_end = sub.current_period_end + timedelta(days=365)
        else:
            period_start = now
            period_end = now + timedelta(days=365)
            if not sub.current_period_start:
                sub.current_period_start = now

        sub.current_period_end = period_end
        sub.status = OrganizationSubscription.Status.ACTIVE
        sub.save(
            update_fields=[
                "status",
                "current_period_start",
                "current_period_end",
                "updated_at",
            ]
        )

        payment = SubscriptionPayment.objects.create(
            subscription=sub,
            amount=amount,
            currency=currency.strip().upper() or "INR",
            payment_reference=(payment_reference or "").strip(),
            confirmed_at=now,
            confirmed_by=confirmed_by,
            period_start=period_start,
            period_end=period_end,
            notes=(notes or "").strip(),
        )

        AuditEvent.objects.create(
            event_type="PARTNER_SUBSCRIPTION_PAYMENT_CONFIRMED",
            user=confirmed_by,
            organization=sub.organization,
            details={
                "partner_id": str(sub.partner_id),
                "subscription_id": sub.id,
                "payment_id": payment.id,
                "amount": str(amount),
                "currency": payment.currency,
                "payment_reference": payment.payment_reference,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "previous_status": prev_status,
                "new_status": sub.status,
                "action": "manual_payment_confirmed",
            },
        )

        return payment, sub


def renew_subscription_365_days(
    subscription: OrganizationSubscription,
    user,
    notes: str = "",
    payment_reference: str = "",
    amount: Decimal = Decimal("0.00"),
    currency: str = "INR",
) -> tuple[SubscriptionPayment, OrganizationSubscription]:
    """
    Renews subscription for 365 days. If amount > 0, records full payment;
    otherwise records 365-day renewal payment record with recorded reference.
    """
    effective_amount = amount if amount > Decimal("0.00") else Decimal("0.01")
    return confirm_manual_payment(
        subscription=subscription,
        amount=effective_amount,
        confirmed_by=user,
        currency=currency,
        payment_reference=payment_reference or "ANNUAL-RENEWAL-MANUAL",
        notes=notes or "Annual subscription renewal for 365 days.",
    )


def get_subscription_metrics(partner) -> dict:
    """
    Returns summary counters for partner pharmacy subscriptions.
    """
    subs = OrganizationSubscription.objects.filter(partner=partner)
    now = timezone.now()

    total = subs.count()
    grandfathered = subs.filter(status=OrganizationSubscription.Status.GRANDFATHERED).count()
    not_started = subs.filter(status=OrganizationSubscription.Status.NOT_STARTED).count()

    # Dynamic status evaluation: active/trialing but past current_period_end is expired
    explicit_expired = subs.filter(status=OrganizationSubscription.Status.EXPIRED).count()
    overdue_active = subs.filter(
        status__in=[OrganizationSubscription.Status.ACTIVE, OrganizationSubscription.Status.TRIALING],
        current_period_end__lt=now,
    ).count()
    expired = explicit_expired + overdue_active

    active = subs.filter(
        status=OrganizationSubscription.Status.ACTIVE,
        current_period_end__gte=now,
    ).count()

    trialing = subs.filter(
        status=OrganizationSubscription.Status.TRIALING,
        current_period_end__gte=now,
    ).count()

    return {
        "total": total,
        "active": active,
        "trialing": trialing,
        "expired": expired,
        "not_started": not_started,
        "grandfathered": grandfathered,
    }
