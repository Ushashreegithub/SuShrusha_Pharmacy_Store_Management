import os
import uuid
from django.db import models
from django.conf import settings
from django.utils.text import slugify


def partner_logo_upload_path(instance, filename):
    """
    Generate unique, sanitized file path for partner logo:
    partner_logos/<partner_id>_<uuid>.<ext>
    """
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        ext = ".png"
    return f"partner_logos/{instance.id}_{uuid.uuid4().hex[:8]}{ext}"


class Partner(models.Model):
    """
    Authorized reseller / channel partner entity (e.g. Sushrusha E-Clinic).
    Separate from operating pharmacy Organization records so partner onboarding
    and customer pharmacy tenants never share operational state.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    logo = models.ImageField(upload_to=partner_logo_upload_path, null=True, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    website = models.URLField(max_length=255, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    gstin = models.CharField(max_length=50, blank=True)
    drug_license_number = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "partners"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name) or "partner"
            candidate = base_slug
            counter = 1
            while Partner.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base_slug}-{counter}"
                counter += 1
            self.slug = candidate
        super().save(*args, **kwargs)


class PartnerMembership(models.Model):
    """
    Associates a user account with a Partner entity in a partner-level governance role.
    Partner Owners never gain operational membership inside customer pharmacies.
    """
    ROLE_CHOICES = [
        ("partner_owner", "Partner Owner"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        Partner, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="partner_memberships",
    )
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default="partner_owner")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "partner_memberships"
        unique_together = ("partner", "user")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.email} -> {self.partner.name} [{self.role}]"


class PartnerDomain(models.Model):
    """
    Verified domain mapping for a Partner portal (e.g. erp.sushrusaeclinic.com).
    Hosts partner owner login + customer pharmacy manager/staff login for this partner.
    """
    STATUS_CHOICES = [
        ("pending", "Pending Verification"),
        ("active", "Active"),
        ("suspended", "Suspended"),
        ("revoked", "Revoked"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        Partner, on_delete=models.CASCADE, related_name="domains"
    )
    domain = models.CharField(max_length=255, unique=True, db_index=True)
    is_verified = models.BooleanField(default=False, db_index=True)
    is_primary = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "partner_domains"
        ordering = ["-is_primary", "-created_at"]

    def save(self, *args, **kwargs):
        if self.domain:
            self.domain = self.domain.split(":")[0].strip().lower().rstrip(".")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.domain} -> {self.partner.name} [{self.status}]"
