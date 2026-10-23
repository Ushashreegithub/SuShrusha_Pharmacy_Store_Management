from decimal import Decimal
from rest_framework import serializers
from django.db.models import Q
from apps.products.models import Product


class ProductListSerializer(serializers.ModelSerializer):
    """
    Compact serializer for product catalog table and searching.
    """
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    item_type_display = serializers.CharField(source="get_item_type_display", read_only=True)
    dosage_form_display = serializers.CharField(source="get_dosage_form_display", read_only=True)
    prescription_class_display = serializers.CharField(source="get_prescription_class_display", read_only=True)
    storage_condition_display = serializers.CharField(source="get_storage_condition_display", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "brand_name",
            "generic_name",
            "sku",
            "barcode",
            "hsn_code",
            "item_type",
            "item_type_display",
            "category",
            "category_display",
            "manufacturer",
            "strength",
            "dosage_form",
            "dosage_form_display",
            "prescription_class",
            "prescription_class_display",
            "is_narcotic",
            "pack_description",
            "base_unit",
            "sale_unit",
            "conversion_factor",
            "is_loose_dispensing_allowed",
            "gst_rate",
            "storage_condition",
            "storage_condition_display",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ProductDetailSerializer(serializers.ModelSerializer):
    """
    Detailed serializer for product inspection and editing.
    """
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    item_type_display = serializers.CharField(source="get_item_type_display", read_only=True)
    dosage_form_display = serializers.CharField(source="get_dosage_form_display", read_only=True)
    prescription_class_display = serializers.CharField(source="get_prescription_class_display", read_only=True)
    storage_condition_display = serializers.CharField(source="get_storage_condition_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "organization",
            "organization_name",
            "name",
            "brand_name",
            "generic_name",
            "sku",
            "barcode",
            "hsn_code",
            "item_type",
            "item_type_display",
            "category",
            "category_display",
            "manufacturer",
            "strength",
            "dosage_form",
            "dosage_form_display",
            "prescription_class",
            "prescription_class_display",
            "is_narcotic",
            "pack_description",
            "base_unit",
            "sale_unit",
            "conversion_factor",
            "is_loose_dispensing_allowed",
            "gst_rate",
            "storage_condition",
            "storage_condition_display",
            "description",
            "is_active",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "organization_name",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by else None

    def get_updated_by_name(self, obj):
        return obj.updated_by.full_name if obj.updated_by else None


class ProductCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Validates and persists Product creation or updates.
    Enforces tenant-scoped SKU and Barcode uniqueness.
    """
    sku = serializers.CharField(max_length=100, required=True)
    barcode = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    conversion_factor = serializers.IntegerField(min_value=1, default=1)
    gst_rate = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0.00"), default=Decimal("12.00"))

    class Meta:
        model = Product
        fields = [
            "name",
            "brand_name",
            "generic_name",
            "sku",
            "barcode",
            "hsn_code",
            "item_type",
            "category",
            "manufacturer",
            "strength",
            "dosage_form",
            "prescription_class",
            "is_narcotic",
            "pack_description",
            "base_unit",
            "sale_unit",
            "conversion_factor",
            "is_loose_dispensing_allowed",
            "gst_rate",
            "storage_condition",
            "description",
            "is_active",
        ]

    def validate_name(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Product name is required.")
        return val

    def validate_sku(self, value):
        val = value.strip().upper()
        if not val:
            raise serializers.ValidationError("SKU code is required.")
        organization = self.context.get("organization")
        if not organization:
            raise serializers.ValidationError("Organization context is missing.")

        qs = Product.objects.filter(organization=organization, sku__iexact=val)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
            raise serializers.ValidationError(f"A product with SKU '{val}' already exists in your organization.")
        return val

    def validate_barcode(self, value):
        val = value.strip() if value else ""
        if not val:
            return ""

        organization = self.context.get("organization")
        if not organization:
            raise serializers.ValidationError("Organization context is missing.")

        qs = Product.objects.filter(organization=organization, barcode=val)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
            raise serializers.ValidationError(f"A product with barcode '{val}' already exists in your organization.")
        return val

    def validate(self, attrs):
        # Clean string fields
        for field in ["brand_name", "generic_name", "manufacturer", "strength", "hsn_code", "pack_description", "description"]:
            if field in attrs and isinstance(attrs[field], str):
                attrs[field] = attrs[field].strip()

        # Non-medicine defaults: if item_type is not medicine, allow generic_name and strength to be blank
        item_type = attrs.get("item_type", getattr(self.instance, "item_type", "medicine"))
        if item_type != "medicine":
            if "dosage_form" not in attrs and not getattr(self.instance, "dosage_form", None):
                attrs["dosage_form"] = "na"
            if "prescription_class" not in attrs and not getattr(self.instance, "prescription_class", None):
                attrs["prescription_class"] = "otc"

        return attrs

    def create(self, validated_data):
        organization = self.context["organization"]
        user = self.context.get("user")
        product = Product.objects.create(
            organization=organization,
            created_by=user,
            updated_by=user,
            **validated_data
        )
        return product

    def update(self, instance, validated_data):
        user = self.context.get("user")
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if user:
            instance.updated_by = user
        instance.save()
        return instance

