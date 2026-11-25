import re
from rest_framework import serializers
from apps.authentication.models import User
from apps.organizations.models import Organization, Store, OrganizationMembership, StoreMembership, OrganizationDomain
from apps.audit.models import AuditEvent


class PlatformOverviewSerializer(serializers.Serializer):
    total_organizations = serializers.IntegerField()
    active_organizations = serializers.IntegerField()
    suspended_organizations = serializers.IntegerField()
    total_users = serializers.IntegerField()
    active_users = serializers.IntegerField()
    inactive_users = serializers.IntegerField()
    total_stores = serializers.IntegerField()
    total_domains = serializers.IntegerField()
    verified_domains = serializers.IntegerField()
    pending_domains = serializers.IntegerField()
    active_sessions = serializers.IntegerField()
    recent_activity = serializers.ListField()


class PlatformOrganizationListSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    owner_email = serializers.CharField(source="owner.email", read_only=True)
    stores_count = serializers.IntegerField(read_only=True)
    users_count = serializers.IntegerField(read_only=True)
    domains = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "owner_id",
            "owner_name",
            "owner_email",
            "is_active",
            "stores_count",
            "users_count",
            "domains",
            "created_at",
            "updated_at",
        ]

    def get_domains(self, obj):
        return [
            {
                "id": str(d.id),
                "domain": d.domain,
                "is_verified": d.is_verified,
                "is_primary": d.is_primary,
                "status": d.status,
            }
            for d in obj.domains.all()
        ]


class PlatformOrganizationDetailSerializer(PlatformOrganizationListSerializer):
    owner = serializers.SerializerMethodField()
    stores = serializers.SerializerMethodField()

    class Meta(PlatformOrganizationListSerializer.Meta):
        fields = PlatformOrganizationListSerializer.Meta.fields + [
            "owner",
            "stores",
        ]

    def get_owner(self, obj):
        if not obj.owner:
            return None
        return {
            "id": str(obj.owner.id),
            "full_name": obj.owner.full_name,
            "email": obj.owner.email,
            "phone_number": obj.owner.phone_number,
            "is_active": obj.owner.is_active,
            "is_email_verified": obj.owner.is_email_verified,
            "created_at": obj.owner.created_at,
        }

    def get_stores(self, obj):
        return [
            {
                "id": str(s.id),
                "name": s.name,
                "code": s.code,
                "status": s.status,
                "manager_name": s.manager.full_name if s.manager else None,
                "manager_email": s.manager.email if s.manager else None,
                "created_at": s.created_at,
            }
            for s in obj.stores.all()
        ]


class PlatformOrganizationStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField(required=True)
    reason = serializers.CharField(required=True, min_length=3, max_length=500)


class PlatformUserListSerializer(serializers.ModelSerializer):
    organizations = serializers.SerializerMethodField()
    stores = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "phone_number",
            "is_active",
            "is_staff",
            "is_superuser",
            "is_email_verified",
            "must_change_password",
            "created_at",
            "last_login",
            "organizations",
            "stores",
        ]
        read_only_fields = fields

    def get_organizations(self, user):
        memberships = OrganizationMembership.objects.filter(
            user=user
        ).select_related("organization")
        return [
            {
                "id": str(m.organization.id),
                "name": m.organization.name,
                "slug": m.organization.slug,
                "role": m.role,
                "is_active": m.is_active,
                "is_org_active": m.organization.is_active,
            }
            for m in memberships
        ]

    def get_stores(self, user):
        memberships = StoreMembership.objects.filter(
            user=user
        ).select_related("store", "store__organization")
        return [
            {
                "id": str(m.store.id),
                "name": m.store.name,
                "code": m.store.code,
                "role": m.role,
                "is_active": m.is_active,
                "organization_name": m.store.organization.name,
            }
            for m in memberships
        ]


class PlatformUserDetailSerializer(PlatformUserListSerializer):
    audit_activity = serializers.SerializerMethodField()

    class Meta(PlatformUserListSerializer.Meta):
        fields = PlatformUserListSerializer.Meta.fields + ["audit_activity"]

    def get_audit_activity(self, user):
        events = AuditEvent.objects.filter(user=user).order_by("-created_at")[:10]
        return [
            {
                "id": str(e.id),
                "event_type": e.event_type,
                "timestamp": e.created_at,
                "ip_address": e.ip_address,
                "details": e.details,
            }
            for e in events
        ]


class PlatformUserStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField(required=True)
    reason = serializers.CharField(required=True, min_length=3, max_length=500)


class PlatformTemporaryPasswordRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, min_length=3, max_length=500)


class PlatformDomainSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)
    organization_is_active = serializers.BooleanField(source="organization.is_active", read_only=True)
    organization_created_at = serializers.DateTimeField(source="organization.created_at", read_only=True)
    owner_name = serializers.SerializerMethodField()
    owner_email = serializers.SerializerMethodField()
    stores_count = serializers.SerializerMethodField()
    verification_method = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationDomain
        fields = [
            "id",
            "organization_id",
            "organization_name",
            "organization_slug",
            "organization_is_active",
            "organization_created_at",
            "owner_name",
            "owner_email",
            "stores_count",
            "domain",
            "domain_type",
            "is_verified",
            "verification_method",
            "is_primary",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_verified", "created_at", "updated_at"]

    def get_owner_name(self, obj):
        if obj.organization and obj.organization.owner:
            return obj.organization.owner.full_name
        return None

    def get_owner_email(self, obj):
        if obj.organization and obj.organization.owner:
            return obj.organization.owner.email
        return None

    def get_stores_count(self, obj):
        if obj.organization:
            return obj.organization.stores.count()
        return 0

    def get_verification_method(self, obj):
        return "manual_admin" if obj.is_verified else "unverified"


class PlatformDomainCreateSerializer(serializers.Serializer):
    organization_id = serializers.UUIDField(required=True)
    domain = serializers.CharField(required=True, max_length=255)
    domain_type = serializers.ChoiceField(
        choices=OrganizationDomain.DOMAIN_TYPE_CHOICES, default="client"
    )
    is_primary = serializers.BooleanField(default=False)

    def validate_domain(self, value):
        norm = value.strip().lower()
        # Strip protocol if accidentally included
        norm = re.sub(r"^https?://", "", norm)
        # Strip trailing slash or path
        norm = norm.split("/")[0].split(":")[0].strip()

        # Disallow reserved platform hosts and local dev hostnames
        reserved = {"pharmapro.diracai.com", "localhost", "127.0.0.1", "testserver"}
        if norm in reserved or norm.endswith(".localhost"):
            raise serializers.ValidationError("Cannot register reserved platform or local development hosts as tenant domains.")

        # FQDN validation
        fqdn_pattern = re.compile(
            r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$",
            re.IGNORECASE,
        )
        if not fqdn_pattern.match(norm):
            raise serializers.ValidationError("Invalid domain format. Enter a valid fully qualified domain name (e.g. erp.client.com).")

        # Check existing
        if OrganizationDomain.objects.filter(domain=norm).exists():
            raise serializers.ValidationError(f"Domain '{norm}' is already mapped in PharmaPro.")

        return norm

    def validate_organization_id(self, value):
        if not Organization.objects.filter(id=value).exists():
            raise serializers.ValidationError("Target organization does not exist.")
        return value


class PlatformDomainVerifySerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, min_length=3, max_length=500)


class PlatformDomainStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=OrganizationDomain.STATUS_CHOICES, required=True)
    reason = serializers.CharField(required=True, min_length=3, max_length=500)


class PlatformLoginActivitySerializer(serializers.ModelSerializer):
    user_email = serializers.SerializerMethodField()
    organization_name = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    timestamp = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "event_type",
            "status",
            "timestamp",
            "user_id",
            "user_email",
            "organization_id",
            "organization_name",
            "ip_address",
            "user_agent",
            "details",
        ]

    def get_user_email(self, obj):
        if obj.user:
            return obj.user.email
        return obj.details.get("attempted_email") or "Unknown"

    def get_organization_name(self, obj):
        if obj.organization:
            return obj.organization.name
        return None

    def get_status(self, obj):
        if obj.event_type == "AUTH_LOGIN_SUCCESS":
            return "SUCCESS"
        if obj.event_type in ("AUTH_LOGIN_FAILED", "AUTH_CROSS_TENANT_REJECTED"):
            return "FAILED"
        if obj.event_type == "AUTH_LOGOUT":
            return "LOGOUT"
        return "INFO"


class PlatformAuditSerializer(serializers.ModelSerializer):
    actor_email = serializers.SerializerMethodField()
    organization_name = serializers.SerializerMethodField()
    timestamp = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "event_type",
            "timestamp",
            "actor_email",
            "organization_id",
            "organization_name",
            "ip_address",
            "user_agent",
            "details",
        ]

    def get_actor_email(self, obj):
        return obj.user.email if obj.user else "System / Anonymous"

    def get_organization_name(self, obj):
        return obj.organization.name if obj.organization else None


class PlatformRegistrationSettingsUpdateSerializer(serializers.Serializer):
    public_registration_enabled = serializers.BooleanField(required=True)
    reason = serializers.CharField(required=True, min_length=3, max_length=500)

