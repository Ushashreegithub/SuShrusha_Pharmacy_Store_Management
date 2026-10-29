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

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "phone_number",
            "is_email_verified",
            "is_staff",
            "primary_role",
            "created_at",
            "organizations",
            "stores",
        ]
        read_only_fields = fields

    def get_primary_role(self, user):
        if OrganizationMembership.objects.filter(user=user, role="owner", is_active=True).exists():
            return "owner"
        if StoreMembership.objects.filter(user=user, role="manager", is_active=True).exists():
            return "manager"
        if StoreMembership.objects.filter(user=user, is_active=True).exists():
            return "employee"
        return "none"

    def get_organizations(self, user):
        memberships = OrganizationMembership.objects.filter(
            user=user, is_active=True
        ).select_related("organization")
        request = self.context.get("request")
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
        memberships = StoreMembership.objects.filter(
            user=user
        ).select_related("store", "store__organization")
        request = self.context.get("request")
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


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(write_only=True, required=True, min_length=8)
    confirm_new_password = serializers.CharField(write_only=True, required=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_new_password"]:
            raise serializers.ValidationError({"confirm_new_password": "New passwords do not match."})
        return attrs


