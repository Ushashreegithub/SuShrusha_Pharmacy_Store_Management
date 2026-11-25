from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from apps.authentication.models import User
from apps.organizations.models import OrganizationMembership, StoreMembership


class OwnerRegistrationSerializer(serializers.Serializer):
    fullName = serializers.CharField(max_length=255, required=True)
    organizationName = serializers.CharField(max_length=255, required=True)
    email = serializers.EmailField(required=True)
    phoneNumber = serializers.CharField(max_length=30, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    confirmPassword = serializers.CharField(write_only=True, required=True)

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email=normalized).exists():
            raise serializers.ValidationError(
                "An account with this email may already exist. Please sign in or reset your password if needed.",
                code="email_already_registered",
            )
        return normalized

    def validate(self, attrs):
        password = attrs.get("password")
        confirm_password = attrs.get("confirmPassword")

        if password != confirm_password:
            raise serializers.ValidationError({"confirmPassword": "Passwords do not match."})

        # Validate with Django's configured password validators
        try:
            validate_password(password)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": list(e.messages)})

        return attrs


class EmailVerificationSerializer(serializers.Serializer):
    token = serializers.CharField(required=True, trim_whitespace=True)


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        return value.strip().lower()


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True)
    rememberMe = serializers.BooleanField(required=False, default=False)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(required=True, trim_whitespace=True)
    password = serializers.CharField(required=True, write_only=True, min_length=8)
    confirmPassword = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        password = attrs.get("password")
        confirm_password = attrs.get("confirmPassword")

        if password != confirm_password:
            raise serializers.ValidationError({"confirmPassword": "Passwords do not match."})

        try:
            validate_password(password)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": list(e.messages)})

        return attrs


class UserProfileSerializer(serializers.ModelSerializer):
    organizations = serializers.SerializerMethodField()
    stores = serializers.SerializerMethodField()
    primary_role = serializers.SerializerMethodField()
    portal_role = serializers.SerializerMethodField()
    active_organization = serializers.SerializerMethodField()
    active_partner = serializers.SerializerMethodField()
    is_platform_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "phone_number",
            "is_email_verified",
            "is_staff",
            "is_superuser",
            "is_platform_admin",
            "primary_role",
            "portal_role",
            "must_change_password",
            "created_at",
            "active_partner",
            "active_organization",
            "organizations",
            "stores",
        ]
        read_only_fields = fields

    def _get_partner_context(self, user):
        request = self.context.get("request")
        if request:
            active_partner = getattr(request, "active_partner", None)
            if active_partner is not None:
                return active_partner
            from apps.organizations.tenant_context import get_authoritative_partner
            active_partner = get_authoritative_partner(user, request=request)
            if active_partner is not None:
                return active_partner
        from apps.partners.models import PartnerMembership
        mem = PartnerMembership.objects.filter(
            user=user, is_active=True, partner__is_active=True
        ).select_related("partner").first()
        return mem.partner if mem else None

    def get_active_partner(self, user):
        partner = self._get_partner_context(user)
        if not partner:
            return None
        request = self.context.get("request")
        logo_url = None
        if partner.logo:
            logo_url = (
                request.build_absolute_uri(partner.logo.url)
                if request
                else partner.logo.url
            )
            ts = int(partner.updated_at.timestamp()) if partner.updated_at else 0
            sep = "&" if "?" in logo_url else "?"
            logo_url = f"{logo_url}{sep}v={ts}"
        return {
            "id": str(partner.id),
            "name": partner.name,
            "slug": partner.slug,
            "logo_url": logo_url,
        }

    def get_active_organization(self, user):
        if self._get_partner_context(user):
            return None
        request = self.context.get("request")
        if not request:
            return None
        active_org = getattr(request, "active_organization", None)
        if not active_org:
            from apps.organizations.tenant_context import get_authoritative_organization
            active_org = get_authoritative_organization(user, request=request)
        if not active_org:
            return None
        sub_info = None
        if active_org.partner_id:
            from apps.subscriptions.services import is_janjeevan_partner
            if is_janjeevan_partner(active_org.partner_id):
                sub = getattr(active_org, "subscription", None)
                if sub is None:
                    from apps.subscriptions.models import OrganizationSubscription
                    sub = OrganizationSubscription.objects.filter(organization=active_org).first()
                if sub:
                    sub_info = {
                        "status": sub.effective_status,
                        "is_expired": sub.is_expired,
                        "is_valid": sub.is_valid,
                        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
                    }

        return {
            "id": str(active_org.id),
            "name": active_org.name,
            "slug": active_org.slug,
            "logo_url": (
                request.build_absolute_uri(active_org.logo.url)
                if active_org.logo and request
                else active_org.logo.url
                if active_org.logo
                else None
            ),
            "subscription": sub_info,
        }

    def get_is_platform_admin(self, user):
        return bool(user.is_staff and user.is_superuser)

    def get_primary_role(self, user):
        if self._get_partner_context(user):
            return "none"
        request = self.context.get("request")
        bound_partner = getattr(request, "bound_partner", None) if request else None
        domain_category = getattr(request, "domain_category", None) if request else None
        org_filter = {}
        store_filter = {}
        if domain_category == "partner" and bound_partner:
            org_filter = {"organization__partner": bound_partner, "organization__is_active": True}
            store_filter = {"store__organization__partner": bound_partner, "store__organization__is_active": True}

        if OrganizationMembership.objects.filter(
            user=user, role__in=["owner", "admin"], is_active=True, **org_filter
        ).exists():
            return "owner"
        if StoreMembership.objects.filter(
            user=user, role="manager", is_active=True, **store_filter
        ).exists():
            return "manager"
        if StoreMembership.objects.filter(
            user=user, is_active=True, **store_filter
        ).exists():
            return "employee"
        return "none"

    def get_portal_role(self, user):
        if user.is_staff and user.is_superuser:
            return "PLATFORM_OWNER"
        if self._get_partner_context(user):
            return "PARTNER_OWNER"
        primary = self.get_primary_role(user)
        if primary in ("owner", "manager"):
            return "PHARMACY_MANAGER"
        if primary == "employee":
            return "PHARMACY_STAFF"
        return "NONE"

    def get_organizations(self, user):
        if self._get_partner_context(user):
            return []
        request = self.context.get("request")
        memberships = OrganizationMembership.objects.filter(
            user=user, is_active=True, organization__is_active=True
        ).select_related("organization")
        if request and getattr(request, "domain_category", None) == "partner" and getattr(request, "bound_partner", None):
            memberships = memberships.filter(organization__partner=request.bound_partner)
        return [
            {
                "id": str(m.organization.id),
                "name": m.organization.name,
                "slug": m.organization.slug,
                "role": m.role,
                "is_owner": m.role == "owner",
                "logo_url": (
                    request.build_absolute_uri(m.organization.logo.url)
                    if m.organization.logo and request
                    else m.organization.logo.url
                    if m.organization.logo
                    else None
                ),
            }
            for m in memberships
        ]

    def get_stores(self, user):
        if self._get_partner_context(user):
            return []
        request = self.context.get("request")
        memberships = StoreMembership.objects.filter(
            user=user, is_active=True, store__organization__is_active=True
        ).select_related("store", "store__organization")
        if request and getattr(request, "domain_category", None) == "partner" and getattr(request, "bound_partner", None):
            memberships = memberships.filter(store__organization__partner=request.bound_partner)
        return [
            {
                "id": str(m.store.id),
                "name": m.store.name,
                "code": m.store.code,
                "role": m.role,
                "status": m.store.status,
                "is_active": m.is_active,
                "organization_id": str(m.store.organization_id),
                "organization_name": m.store.organization.name,
                "organization_logo_url": (
                    request.build_absolute_uri(m.store.organization.logo.url)
                    if m.store.organization.logo and request
                    else m.store.organization.logo.url
                    if m.store.organization.logo
                    else None
                ),
            }
            for m in memberships
        ]


class SwitchOrganizationSerializer(serializers.Serializer):
    organization_id = serializers.UUIDField(required=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(write_only=True, required=True, min_length=8)
    confirm_new_password = serializers.CharField(write_only=True, required=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_new_password"]:
            raise serializers.ValidationError({"confirm_new_password": "New passwords do not match."})
        return attrs


