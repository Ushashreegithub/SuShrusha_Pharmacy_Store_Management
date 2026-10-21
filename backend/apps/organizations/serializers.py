import re
from rest_framework import serializers
from apps.authentication.models import User
from apps.organizations.models import Organization, Store, StoreMembership, OrganizationMembership


class StoreSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    manager_name = serializers.SerializerMethodField()
    manager_email = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = Store
        fields = [
            "id",
            "name",
            "code",
            "address",
            "city",
            "state",
            "postal_code",
            "phone",
            "email",
            "status",
            "role",
            "is_active",
            "manager",
            "manager_name",
            "manager_email",
            "organization",
            "organization_name",
            "member_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "organization", "created_at", "updated_at"]

    def get_role(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return None
        if OrganizationMembership.objects.filter(
            organization=obj.organization, user=request.user, role="owner", is_active=True
        ).exists():
            return "owner"
        m = obj.memberships.filter(user=request.user).first()
        return m.role if m else None

    def get_is_active(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return True
        if OrganizationMembership.objects.filter(
            organization=obj.organization, user=request.user, role="owner", is_active=True
        ).exists():
            return True
        m = obj.memberships.filter(user=request.user).first()
        return m.is_active if m else True

    def get_manager_name(self, obj):
        return obj.manager.full_name if obj.manager else None

    def get_manager_email(self, obj):
        return obj.manager.email if obj.manager else None

    def get_member_count(self, obj):
        return obj.memberships.filter(is_active=True).count()

    def validate_name(self, value):
        val = value.strip()
        if not val or len(val) < 2:
            raise serializers.ValidationError("Store name must be at least 2 characters long.")
        return val

    def validate_code(self, value):
        val = value.strip().upper()
        if val and not re.match(r"^[A-Z0-9\-_]{2,20}$", val):
            raise serializers.ValidationError(
                "Store code must be 2-20 characters long and contain only uppercase letters, numbers, hyphens, and underscores."
            )
        return val

    def validate(self, attrs):
        org = self.context.get("organization")
        code = attrs.get("code", "").strip().upper()

        # If code is provided, check uniqueness within organization
        if code and org:
            query = Store.objects.filter(organization=org, code__iexact=code)
            if self.instance:
                query = query.exclude(pk=self.instance.pk)
            if query.exists():
                raise serializers.ValidationError(
                    {"code": f"A store with code '{code}' already exists in your organization."}
                )
        return attrs


class AssignManagerSerializer(serializers.Serializer):
    user_id = serializers.UUIDField(required=False)
    email = serializers.EmailField(required=False)

    def validate(self, attrs):
        user_id = attrs.get("user_id")
        email = attrs.get("email")

        if not user_id and not email:
            raise serializers.ValidationError("Either user_id or email must be provided.")

        user = None
        if user_id:
            user = User.objects.filter(id=user_id).first()
        elif email:
            user = User.objects.filter(email=email.strip().lower()).first()

        if not user:
            raise serializers.ValidationError("The designated user does not exist.")

        attrs["user"] = user
        return attrs


class StoreMembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    phone_number = serializers.CharField(source="user.phone_number", read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)

    class Meta:
        model = StoreMembership
        fields = [
            "id",
            "user_id",
            "full_name",
            "email",
            "phone_number",
            "store",
            "store_name",
            "store_code",
            "role",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class DirectAddMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=StoreMembership.ROLE_CHOICES)

    def validate_email(self, value):
        val = value.strip().lower()
        user = User.objects.filter(email=val).first()
        if not user:
            raise serializers.ValidationError(
                "No registered user found with this email. Use the invitation workflow to invite new team members."
            )
        return val


class OrganizationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "slug", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]
