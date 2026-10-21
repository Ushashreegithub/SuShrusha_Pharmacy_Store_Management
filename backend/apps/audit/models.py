import uuid
from django.db import models
from django.conf import settings
from apps.organizations.models import Organization


class AuditEvent(models.Model):
    """
    Immutable audit log recording security and administrative actions.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    event_type = models.CharField(max_length=100, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_events"
        ordering = ["-created_at"]

    def __str__(self):
        user_str = self.user.email if self.user else "Anonymous"
        return f"[{self.created_at:%Y-%m-%d %H:%M}] {self.event_type} by {user_str}"

    @classmethod
    def log_event(cls, event_type, request=None, user=None, organization=None, details=None):
        ip = None
        user_agent = ""
        if request:
            x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
            if x_forwarded_for:
                ip = x_forwarded_for.split(",")[0].strip()
            else:
                ip = request.META.get("REMOTE_ADDR")
            user_agent = request.META.get("HTTP_USER_AGENT", "")[:500]

            if not user and request.user.is_authenticated:
                user = request.user

        return cls.objects.create(
            event_type=event_type,
            user=user,
            organization=organization,
            ip_address=ip,
            user_agent=user_agent,
            details=details or {},
        )

