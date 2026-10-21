import uuid
import secrets
from datetime import timedelta
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.authentication.models import hash_token
from apps.organizations.models import Organization, Store


class EmployeeInvitation(models.Model):
    """
    Secure, expiring, single-use invitation for pharmacy staff and managers.
    Tokens are stored as SHA-256 hashes.
    """
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("accepted", "Accepted"),
        ("revoked", "Revoked"),
        ("expired", "Expired"),
    ]

    ROLE_CHOICES = [
        ("manager", "Store Manager"),
        ("pharmacist", "Pharmacist"),
        ("cashier", "Cashier"),
        ("staff", "Staff"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="invitations"
    )
    store = models.ForeignKey(
        Store, on_delete=models.CASCADE, related_name="invitations"
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sent_invitations",
    )
    email = models.EmailField(db_index=True)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    token_hash = models.CharField(max_length=64, db_index=True)
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "employee_invitations"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Invite for {self.email} -> {self.store.name} ({self.role}) [{self.status}]"

    @classmethod
    def create_invitation(cls, organization, store, invited_by, email, role, expiry_hours=24):
        # Revoke existing pending invitations for this email in this store
        cls.objects.filter(
            store=store,
            email=email.lower().strip(),
            status="pending",
        ).update(status="revoked")

        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_token(raw_token)
        expires_at = timezone.now() + timedelta(hours=expiry_hours)

        invitation = cls.objects.create(
            organization=organization,
            store=store,
            invited_by=invited_by,
            email=email.lower().strip(),
            role=role,
            token_hash=token_hash,
            expires_at=expires_at,
            status="pending",
        )
        return invitation, raw_token

    def is_valid(self) -> bool:
        if self.status != "pending":
            return False
        if timezone.now() >= self.expires_at:
            self.status = "expired"
            self.save(update_fields=["status"])
            return False
        return True

