import re
from rest_framework import serializers
from apps.invitations.models import EmployeeInvitation
from apps.organizations.models import Store, StoreMembership, OrganizationMembership


class CreateInvitationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    store_id = serializers.UUIDField()
    role = serializers.ChoiceField(choices=EmployeeInvitation.ROLE_CHOICES)

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        user = self.context.get("request").user
        store_id = attrs.get("store_id")
        role = attrs.get("role")
        email = attrs.get("email")

        store = Store.objects.filter(id=store_id).select_related("organization").first()
        if not store:
            raise serializers.ValidationError({"store_id": "Specified store branch does not exist."})

        # Check permissions
        is_owner = OrganizationMembership.objects.filter(
            organization=store.organization, user=user, role="owner", is_active=True
        ).exists()

        is_mgr = StoreMembership.objects.filter(
            store=store, user=user, role="manager", is_active=True
        ).exists()

        if not is_owner and not is_mgr:
            raise serializers.ValidationError("You do not have permission to invite team members to this store branch.")

        # Managers cannot invite owners or administrators
        if not is_owner and role in ["owner", "admin"]:
            raise serializers.ValidationError({"role": "Store managers can only invite store staff and pharmacists."})

        # Check if already active member in this store
        existing_active = StoreMembership.objects.filter(
            store=store, user__email=email, is_active=True
        ).exists()
        if existing_active:
            raise serializers.ValidationError(
                {"email": f"A user with email '{email}' is already an active member of this store."}
            )

        attrs["store"] = store
        attrs["organization"] = store.organization
        return attrs


class InvitationDetailSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source="store.name", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    invited_by_name = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeInvitation
        fields = [
            "id",
            "email",
            "role",
            "status",
            "store",
            "store_name",
            "store_code",
            "organization",
            "organization_name",
            "invited_by",
            "invited_by_name",
            "expires_at",
            "accepted_at",
            "created_at",
        ]
        read_only_fields = ["id", "status", "expires_at", "accepted_at", "created_at"]

    def get_invited_by_name(self, obj):
        return obj.invited_by.full_name if obj.invited_by else "Owner"


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)
    fullName = serializers.CharField(min_length=2, max_length=150, required=True)
    password = serializers.CharField(min_length=8, required=True)
    confirmPassword = serializers.CharField(min_length=8, required=True)

    def validate(self, attrs):
        if attrs["password"] != attrs["confirmPassword"]:
            raise serializers.ValidationError({"confirmPassword": "Passwords do not match."})
        return attrs

