import os
import uuid
from django.db import models
from django.conf import settings
from django.utils.text import slugify


def org_logo_upload_path(instance, filename):
    """
    Generate unique, sanitized file path for organization logo:
    org_logos/<org_id>_<uuid>.<ext>
    """
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        ext = ".png"
    return f"org_logos/{instance.id}_{uuid.uuid4().hex[:8]}{ext}"


class Organization(models.Model):
    """
    Pharmacy Business Organization (Tenant root).
    Created during Owner registration in a database transaction.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    logo = models.ImageField(upload_to=org_logo_upload_path, null=True, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="owned_organizations",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organizations"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name) or "pharmacy"
            candidate = base_slug
            counter = 1
            while Organization.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base_slug}-{counter}"
                counter += 1
            self.slug = candidate
        super().save(*args, **kwargs)


class Store(models.Model):
    """
    Store or Branch belonging to an Organization.
    """
    STATUS_CHOICES = [
        ("setup", "Under Setup"),
        ("active", "Active"),
        ("inactive", "Inactive"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="stores"
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="setup")
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_stores",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "stores"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.organization.name})"


class OrganizationMembership(models.Model):
    """
    User membership within an organization.
    Owners receive organization-wide oversight across all branches.
    """
    ROLE_CHOICES = [
        ("owner", "Owner"),
        ("admin", "Administrator"),
        ("member", "Member"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="org_memberships",
    )
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "organization_memberships"
        unique_together = ("organization", "user")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.email} -> {self.organization.name} [{self.role}]"


class StoreMembership(models.Model):
    """
    User membership within an individual store branch.
    Deactivating a store membership affects that store only; never deactivates the user account.
    """
    ROLE_CHOICES = [
        ("manager", "Store Manager"),
        ("pharmacist", "Pharmacist"),
        ("cashier", "Cashier"),
        ("staff", "Staff"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        Store, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="store_memberships",
    )
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "store_memberships"
        unique_together = ("store", "user")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.email} -> {self.store.name} [{self.role}]"

