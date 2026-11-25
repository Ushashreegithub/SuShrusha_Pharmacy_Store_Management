from django.db import models
from django.conf import settings


class PlatformSettings(models.Model):
    """
    Persistent singleton configuration for DiracPharma platform-wide policies.
    """
    id = models.IntegerField(primary_key=True, default=1, editable=False)
    public_registration_enabled = models.BooleanField(default=True)
    last_updated_reason = models.CharField(max_length=500, blank=True, default="")
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_platform_settings",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "platform_settings"
        verbose_name = "Platform Settings"
        verbose_name_plural = "Platform Settings"

    @classmethod
    def get_settings(cls):
        """Returns the authoritative singleton PlatformSettings row, creating it with defaults if absent."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        state = "Enabled" if self.public_registration_enabled else "Disabled"
        return f"DiracPharma Platform Settings (Public Registration: {state})"
