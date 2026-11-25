from decimal import Decimal
from rest_framework import serializers

from apps.subscriptions.models import OrganizationSubscription, SubscriptionPayment


class SubscriptionPaymentSerializer(serializers.ModelSerializer):
    confirmed_by_id = serializers.CharField(source="confirmed_by.id", read_only=True)
    confirmed_by_name = serializers.CharField(source="confirmed_by.full_name", read_only=True)
    confirmed_by_email = serializers.CharField(source="confirmed_by.email", read_only=True)

    class Meta:
        model = SubscriptionPayment
        fields = [
            "id",
            "subscription_id",
            "amount",
            "currency",
            "payment_reference",
            "confirmed_at",
            "confirmed_by_id",
            "confirmed_by_name",
            "confirmed_by_email",
            "period_start",
            "period_end",
            "notes",
            "created_at",
        ]
        read_only_fields = fields


class OrganizationSubscriptionListSerializer(serializers.ModelSerializer):
    organization_id = serializers.UUIDField(source="organization.id", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)
    owner_name = serializers.SerializerMethodField()
    owner_email = serializers.SerializerMethodField()
    owner_phone = serializers.SerializerMethodField()
    effective_status = serializers.CharField(read_only=True)
    is_valid = serializers.BooleanField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    days_remaining = serializers.IntegerField(read_only=True)
    payments_count = serializers.SerializerMethodField()
    latest_payment_at = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationSubscription
        fields = [
            "id",
            "organization_id",
            "organization_name",
            "organization_slug",
            "owner_name",
            "owner_email",
            "owner_phone",
            "status",
            "effective_status",
            "trial_started_at",
            "current_period_start",
            "current_period_end",
            "days_remaining",
            "is_valid",
            "is_expired",
            "payments_count",
            "latest_payment_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_owner_name(self, obj):
        owner = getattr(obj.organization, "owner", None)
        return owner.full_name if owner else ""

    def get_owner_email(self, obj):
        owner = getattr(obj.organization, "owner", None)
        return owner.email if owner else ""

    def get_owner_phone(self, obj):
        owner = getattr(obj.organization, "owner", None)
        return getattr(owner, "phone_number", "") or ""

    def get_payments_count(self, obj):
        if hasattr(obj, "payments_count_annotated"):
            return obj.payments_count_annotated
        return obj.payments.count()

    def get_latest_payment_at(self, obj):
        latest = obj.payments.order_by("-confirmed_at").first()
        return latest.confirmed_at.isoformat() if latest else None


class OrganizationSubscriptionDetailSerializer(OrganizationSubscriptionListSerializer):
    payments = SubscriptionPaymentSerializer(many=True, read_only=True)

    class Meta(OrganizationSubscriptionListSerializer.Meta):
        fields = OrganizationSubscriptionListSerializer.Meta.fields + ["payments"]
        read_only_fields = fields


class ManualPaymentConfirmSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=True,
    )
    currency = serializers.CharField(max_length=3, required=False, default="INR")
    payment_reference = serializers.CharField(max_length=150, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class SubscriptionRenewalSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)
    payment_reference = serializers.CharField(max_length=150, required=False, allow_blank=True)
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        default=Decimal("0.00"),
    )
    currency = serializers.CharField(max_length=3, required=False, default="INR")


class CustomerSubscriptionSerializer(serializers.ModelSerializer):
    organization_id = serializers.UUIDField(source="organization.id", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)
    plan_name = serializers.SerializerMethodField()
    effective_status = serializers.CharField(read_only=True)
    is_valid = serializers.BooleanField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_grandfathered = serializers.SerializerMethodField()
    days_remaining = serializers.IntegerField(read_only=True)
    renewal_instructions = serializers.SerializerMethodField()
    partner = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationSubscription
        fields = [
            "id",
            "organization_id",
            "organization_name",
            "organization_slug",
            "plan_name",
            "status",
            "effective_status",
            "is_valid",
            "is_expired",
            "is_grandfathered",
            "trial_started_at",
            "current_period_start",
            "current_period_end",
            "days_remaining",
            "renewal_instructions",
            "partner",
            "payments",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_plan_name(self, obj):
        return "Janjeevan 365-Day Partner License"

    def get_is_grandfathered(self, obj):
        return obj.status == OrganizationSubscription.Status.GRANDFATHERED

    def get_renewal_instructions(self, obj):
        return "Please contact Janjeevan Organisation to arrange subscription payment and renewal."

    def get_partner(self, obj):
        partner = obj.partner
        if not partner:
            return None
        partner_owner_user = None
        from apps.partners.models import PartnerMembership
        mem = PartnerMembership.objects.filter(
            partner=partner, role="partner_owner", is_active=True
        ).select_related("user").first()
        if mem:
            partner_owner_user = mem.user

        return {
            "partner_id": str(partner.id),
            "partner_name": partner.name,
            "contact_email": getattr(partner, "contact_email", "") or (partner_owner_user.email if partner_owner_user else "support@sushrusaeclinic.com"),
            "contact_phone": getattr(partner, "contact_phone", "") or (getattr(partner_owner_user, "phone_number", "") if partner_owner_user else ""),
            "website": getattr(partner, "website", "") or "",
            "address": getattr(partner, "address", "") or "",
            "city": getattr(partner, "city", "") or "",
            "state": getattr(partner, "state", "") or "",
        }

    def get_payments(self, obj):
        ordered_payments = obj.payments.all().order_by("-confirmed_at")
        return SubscriptionPaymentSerializer(ordered_payments, many=True).data
