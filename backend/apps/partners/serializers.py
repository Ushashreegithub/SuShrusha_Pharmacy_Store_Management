import os
import re
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from apps.authentication.models import User
from apps.organizations.models import Organization, Store
from apps.partners.models import Partner


def _validate_optional_password(password: str | None) -> str | None:
    if not password:
        return None
    try:
        validate_password(password)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages))
    return password


class PartnerPharmacyListSerializer(serializers.ModelSerializer):
    stores_count = serializers.IntegerField(read_only=True)
    active_stores_count = serializers.IntegerField(read_only=True)
    managers_count = serializers.SerializerMethodField()
    primary_manager = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "contact_email",
            "contact_phone",
            "address",
            "city",
            "state",
            "postal_code",
            "license_number",
            "gstin",
            "notes",
            "is_active",
            "stores_count",
            "active_stores_count",
            "managers_count",
            "primary_manager",
            "created_at",
            "updated_at",
        ]

    def get_managers_count(self, obj):
        return (
            User.objects.filter(
                is_active=True,
            )
            .filter(
                org_memberships__organization=obj,
                org_memberships__role__in=["owner", "admin"],
                org_memberships__is_active=True,
            )
            .distinct()
            .count()
            or User.objects.filter(
                store_memberships__store__organization=obj,
                store_memberships__role="manager",
                store_memberships__is_active=True,
            )
            .distinct()
            .count()
        )

    def get_primary_manager(self, obj):
        mgr = obj.owner
        if not mgr:
            m = obj.memberships.filter(role__in=["owner", "admin"], is_active=True).select_related("user").first()
            mgr = m.user if m else None
        if not mgr:
            return None
        return {
            "id": str(mgr.id),
            "full_name": mgr.full_name,
            "email": mgr.email,
            "phone_number": mgr.phone_number,
            "is_active": mgr.is_active,
            "must_change_password": mgr.must_change_password,
        }


class PartnerInitialStoreInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=True)
    code = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")
    city = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    state = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(choices=Store.STATUS_CHOICES, required=False, default="active")

    def validate_name(self, value):
        val = value.strip()
        if len(val) < 2:
            raise serializers.ValidationError("Store name must be at least 2 characters.")
        return val

    def validate_code(self, value):
        val = value.strip().upper()
        if val and not re.match(r"^[A-Z0-9\-_]{2,20}$", val):
            raise serializers.ValidationError(
                "Store code must be 2-20 uppercase alphanumeric characters, hyphens, or underscores."
            )
        return val


class PartnerInitialManagerInputSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, required=True)
    email = serializers.EmailField(required=True)
    phone_number = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def validate_full_name(self, value):
        val = value.strip()
        if len(val) < 2:
            raise serializers.ValidationError("Manager full name must be at least 2 characters.")
        return val

    def validate_email(self, value):
        return value.strip().lower()

    def validate_password(self, value):
        if value:
            return _validate_optional_password(value)
        return ""


class PartnerCreatePharmacySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True, default="")
    contact_phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")
    city = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    state = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    license_number = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    gstin = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    initial_store = PartnerInitialStoreInputSerializer(required=False, allow_null=True)
    stores = PartnerInitialStoreInputSerializer(many=True, required=False)
    manager = PartnerInitialManagerInputSerializer(required=False, allow_null=True)

    def validate_name(self, value):
        val = value.strip()
        if len(val) < 2:
            raise serializers.ValidationError("Pharmacy organization name must be at least 2 characters.")
        return val


class PartnerUpdatePharmacySerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "name",
            "contact_email",
            "contact_phone",
            "address",
            "city",
            "state",
            "postal_code",
            "license_number",
            "gstin",
            "notes",
        ]

    def validate_name(self, value):
        val = value.strip()
        if len(val) < 2:
            raise serializers.ValidationError("Pharmacy organization name must be at least 2 characters.")
        return val


class PartnerStatusReasonSerializer(serializers.Serializer):
    is_active = serializers.BooleanField(required=True)
    reason = serializers.CharField(required=True, min_length=3, max_length=500)


class PartnerStoreSerializer(serializers.ModelSerializer):
    organization_id = serializers.UUIDField(source="organization.id", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_is_active = serializers.BooleanField(source="organization.is_active", read_only=True)
    manager_id = serializers.UUIDField(source="manager.id", read_only=True, allow_null=True)
    manager_name = serializers.CharField(source="manager.full_name", read_only=True, allow_null=True)
    manager_email = serializers.CharField(source="manager.email", read_only=True, allow_null=True)

    class Meta:
        model = Store
        fields = [
            "id",
            "organization_id",
            "organization_name",
            "organization_is_active",
            "name",
            "code",
            "address",
            "city",
            "state",
            "postal_code",
            "phone",
            "email",
            "status",
            "manager_id",
            "manager_name",
            "manager_email",
            "created_at",
            "updated_at",
        ]


class PartnerCreateStoreSerializer(PartnerInitialStoreInputSerializer):
    organization_id = serializers.UUIDField(required=True)
    manager_id = serializers.UUIDField(required=False, allow_null=True)


class PartnerUpdateStoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = [
            "name",
            "code",
            "address",
            "city",
            "state",
            "postal_code",
            "phone",
            "email",
            "status",
        ]

    def validate_name(self, value):
        val = value.strip()
        if len(val) < 2:
            raise serializers.ValidationError("Store name must be at least 2 characters.")
        return val

    def validate_code(self, value):
        val = value.strip().upper()
        if val and not re.match(r"^[A-Z0-9\-_]{2,20}$", val):
            raise serializers.ValidationError(
                "Store code must be 2-20 uppercase alphanumeric characters, hyphens, or underscores."
            )
        return val


class PartnerStoreStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Store.STATUS_CHOICES, required=True)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")


class PartnerCreateManagerSerializer(serializers.Serializer):
    organization_id = serializers.UUIDField(required=True)
    full_name = serializers.CharField(max_length=255, required=True)
    email = serializers.EmailField(required=True)
    phone_number = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    store_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
    )

    def validate_full_name(self, value):
        val = value.strip()
        if len(val) < 2:
            raise serializers.ValidationError("Full name must be at least 2 characters.")
        return val

    def validate_email(self, value):
        return value.strip().lower()

    def validate_password(self, value):
        if value:
            return _validate_optional_password(value)
        return ""


class PartnerAssignManagerStoresSerializer(serializers.Serializer):
    organization_id = serializers.UUIDField(required=True)
    store_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=True,
    )


class PartnerResetPasswordSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, min_length=3, max_length=500)


def validate_partner_logo(file):
    if not file:
        raise serializers.ValidationError("No logo file provided.")

    # 1. Size check: 5 MB limit
    max_size = 5 * 1024 * 1024
    if file.size > max_size:
        raise serializers.ValidationError("Logo image file size must not exceed 5 MB.")

    # 2. Extension check
    ext = os.path.splitext(file.name)[1].lower()
    allowed_exts = [".png", ".jpg", ".jpeg", ".webp"]
    if ext not in allowed_exts:
        raise serializers.ValidationError(
            f"Unsupported file format '{ext}'. Allowed formats: PNG, JPG, JPEG, WEBP."
        )

    # 3. Content-Type check
    allowed_types = ["image/png", "image/jpeg", "image/webp"]
    content_type = getattr(file, "content_type", "")
    if content_type and content_type not in allowed_types:
        raise serializers.ValidationError(
            f"Invalid image content type '{content_type}'."
        )

    # 4. Pillow content verification
    try:
        from PIL import Image
        file.seek(0)
        img = Image.open(file)
        img.verify()
        format_name = (img.format or "").upper()
        if format_name not in ["PNG", "JPEG", "WEBP"]:
            raise serializers.ValidationError(
                f"Invalid image format '{format_name}'. Allowed formats: PNG, JPEG, WEBP."
            )
        file.seek(0)
    except Exception as exc:
        if isinstance(exc, serializers.ValidationError):
            raise
        raise serializers.ValidationError("The uploaded file is corrupted or not a valid image.")

    return file


class PartnerProfileSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    logo = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Partner
        fields = [
            "id",
            "name",
            "slug",
            "logo",
            "logo_url",
            "contact_email",
            "contact_phone",
            "website",
            "address",
            "city",
            "state",
            "postal_code",
            "gstin",
            "drug_license_number",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "is_active", "created_at", "updated_at"]

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        url = obj.logo.url
        if request:
            url = request.build_absolute_uri(url)
        ts = int(obj.updated_at.timestamp()) if obj.updated_at else 0
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}v={ts}"

    def validate_name(self, value):
        val = value.strip()
        if len(val) < 2:
            raise serializers.ValidationError("Organization name must be at least 2 characters.")
        return val

    def validate_logo(self, value):
        if value:
            return validate_partner_logo(value)
        return value

    def validate_gstin(self, value):
        val = value.strip().upper()
        if val and not re.match(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$", val):
            if len(val) > 15 or len(val) < 5:
                raise serializers.ValidationError("GSTIN must be a valid alphanumeric business registration number.")
        return val


class PartnerBrandingSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Partner
        fields = [
            "name",
            "slug",
            "logo_url",
            "contact_email",
            "contact_phone",
            "website",
        ]

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        url = obj.logo.url
        if request:
            url = request.build_absolute_uri(url)
        ts = int(obj.updated_at.timestamp()) if obj.updated_at else 0
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}v={ts}"


class PartnerLogoUploadSerializer(serializers.Serializer):
    logo = serializers.ImageField(required=True)

    def validate_logo(self, value):
        return validate_partner_logo(value)

