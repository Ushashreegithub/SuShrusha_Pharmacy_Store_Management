from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.organizations.models import Organization
from apps.partners.models import Partner


class OrganizationSubscription(models.Model):
    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not Started"
        TRIALING = "trialing", "Trialing"
        ACTIVE = "active", "Active"
        EXPIRED = "expired", "Expired"
        GRANDFATHERED = "grandfathered", "Grandfathered"

    organization = models.OneToOneField(
        Organization,
        on_delete=models.PROTECT,
        related_name="subscription",
    )
    partner = models.ForeignKey(
        Partner,
        on_delete=models.PROTECT,
        related_name="organization_subscriptions",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NOT_STARTED,
        db_index=True,
    )
    trial_started_at = models.DateTimeField(null=True, blank=True)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.organization.name} - {self.get_status_display()}"

    @property
    def is_valid(self) -> bool:
        if self.status == self.Status.GRANDFATHERED:
            return True
        if self.status in (self.Status.ACTIVE, self.Status.TRIALING):
            if not self.current_period_end:
                return True
            from django.utils import timezone
            return self.current_period_end >= timezone.now()
        return False

    @property
    def is_expired(self) -> bool:
        if self.status == self.Status.GRANDFATHERED:
            return False
        if self.status == self.Status.EXPIRED:
            return True
        if self.status in (self.Status.ACTIVE, self.Status.TRIALING):
            if self.current_period_end:
                from django.utils import timezone
                return self.current_period_end < timezone.now()
        return False

    @property
    def effective_status(self) -> str:
        if self.status == self.Status.GRANDFATHERED:
            return self.Status.GRANDFATHERED
        if self.status in (self.Status.ACTIVE, self.Status.TRIALING):
            if self.current_period_end:
                from django.utils import timezone
                if self.current_period_end < timezone.now():
                    return self.Status.EXPIRED
        return self.status

    @property
    def days_remaining(self) -> int | None:
        if self.status == self.Status.GRANDFATHERED:
            return None
        if self.current_period_end:
            from django.utils import timezone
            import math
            now = timezone.now()
            if self.current_period_end <= now:
                return 0
            delta = self.current_period_end - now
            return math.ceil(delta.total_seconds() / 86400)
        return None


class SubscriptionPayment(models.Model):
    subscription = models.ForeignKey(
        OrganizationSubscription,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    payment_reference = models.CharField(max_length=150, blank=True)
    confirmed_at = models.DateTimeField()
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="confirmed_subscription_payments",
    )
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-confirmed_at"]

    def __str__(self):
        return (
            f"{self.subscription.organization.name} - "
            f"{self.amount} {self.currency}"
        )

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError(
                "Subscription payment records are append-only."
            )

        if self.period_end <= self.period_start:
            raise ValidationError(
                "Payment period end must be after its start."
            )

        if self.amount <= 0:
            raise ValidationError(
                "Payment amount must be greater than zero."
            )

        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError(
            "Subscription payment records cannot be deleted."
        )
