from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers

from apps.products.models import Product
from apps.inventory.models import ProductPackagingSnapshot, StoreBatchStock, BatchInwardCostLayer
from apps.inventory.permissions import can_user_view_cost_data


class OpeningStockInputSerializer(serializers.Serializer):
    """
    Input serializer for Opening Stock intake.
    Validates mandatory cost provenance, integer quantities, batch identity, and packaging snapshots.
    """
    idempotency_key = serializers.UUIDField(required=True)
    product_id = serializers.UUIDField(required=True)
    packaging_snapshot_id = serializers.UUIDField(required=False, allow_null=True)
    batch_number = serializers.CharField(required=True, max_length=100)
    manufacturer_name = serializers.CharField(required=False, allow_blank=True, default="UNKNOWN_UNSPECIFIED")
    manufacturing_date = serializers.DateField(required=False, allow_null=True)
    expiry_date = serializers.DateField(required=True)
    mrp = serializers.DecimalField(required=True, max_digits=12, decimal_places=2, min_value=Decimal("0.00"))
    purchase_cost_per_sale_unit = serializers.DecimalField(
        required=True,
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        help_text="Mandatory net invoice purchase cost per sale unit to establish cost provenance."
    )
    quantity_sale_units = serializers.IntegerField(required=False, default=0, min_value=0)
    quantity_loose_base_units = serializers.IntegerField(required=False, default=0, min_value=0)
    low_stock_threshold = serializers.IntegerField(required=False, default=10, min_value=0)
    receipt_reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate_batch_number(self, value):
        val = value.strip().upper()
        if not val:
            raise serializers.ValidationError("Batch number cannot be empty.")
        return val

    def validate_expiry_date(self, value):
        if value <= timezone.localdate():
            raise serializers.ValidationError("Opening stock cannot be established for an expired batch.")
        return value

    def validate(self, attrs):
        # 1. Quantity check
        sale_units = attrs.get("quantity_sale_units", 0) or 0
        loose_units = attrs.get("quantity_loose_base_units", 0) or 0
        if sale_units == 0 and loose_units == 0:
            raise serializers.ValidationError(
                {"quantity_sale_units": "Intake quantity must be greater than zero. Provide sale units or loose units."}
            )

        # 2. Product validation
        store = self.context.get("store")
        if not store:
            raise serializers.ValidationError("Store context is required.")

        try:
            product = Product.objects.get(id=attrs["product_id"], organization=store.organization)
        except Product.DoesNotExist:
            raise serializers.ValidationError(
                {"product_id": "Product not found or does not belong to the store's organization."}
            )
        attrs["product"] = product

        # 3. Packaging snapshot validation
        snapshot_id = attrs.get("packaging_snapshot_id")
        if snapshot_id:
            try:
                snapshot = ProductPackagingSnapshot.objects.get(id=snapshot_id, product=product)
            except ProductPackagingSnapshot.DoesNotExist:
                raise serializers.ValidationError(
                    {"packaging_snapshot_id": "Specified packaging snapshot not found for this product."}
                )
            attrs["packaging_snapshot"] = snapshot
        else:
            snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(product)
            attrs["packaging_snapshot"] = snapshot

        return attrs


class StoreStockItemSerializer(serializers.ModelSerializer):
    """
    Serializer for store stock listing rows.
    Masks financial cost and valuation metrics for non-manager roles (Pharmacists, Cashiers, Staff).
    """
    id = serializers.CharField()
    store_id = serializers.CharField(source="store.id")
    store_name = serializers.CharField(source="store.name")
    product_id = serializers.CharField(source="product.id")
    product_name = serializers.CharField(source="product.name")
    sku = serializers.CharField(source="product.sku")
    barcode = serializers.CharField(source="product.barcode")
    generic_name = serializers.CharField(source="product.generic_name")
    category = serializers.CharField(source="product.category")
    category_display = serializers.CharField(source="product.get_category_display")
    dosage_form = serializers.CharField(source="product.dosage_form")
    dosage_form_display = serializers.CharField(source="product.get_dosage_form_display")
    prescription_class = serializers.CharField(source="product.prescription_class")
    is_narcotic = serializers.BooleanField(source="product.is_narcotic")

    batch_id = serializers.CharField(source="batch.id")
    batch_number = serializers.CharField(source="batch.batch_number")
    manufacturer_name = serializers.CharField(source="batch.manufacturer_name")
    expiry_date = serializers.DateField(source="batch.expiry_date")
    is_expired = serializers.SerializerMethodField()
    is_recalled = serializers.BooleanField(source="batch.is_recalled")

    packaging = serializers.SerializerMethodField()
    quantity_on_hand = serializers.IntegerField()
    quantity_quarantined = serializers.IntegerField()
    available_quantity = serializers.IntegerField()
    formatted_stock = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()

    mrp = serializers.DecimalField(source="batch.mrp", max_digits=12, decimal_places=2)
    unit_mrp = serializers.DecimalField(source="batch.unit_mrp", max_digits=12, decimal_places=4)
    total_valuation_retail = serializers.SerializerMethodField()

    # Sensitive cost fields (dynamically masked)
    unit_cost = serializers.SerializerMethodField()
    total_valuation_cost = serializers.SerializerMethodField()

    class Meta:
        model = StoreBatchStock
        fields = [
            "id",
            "store_id",
            "store_name",
            "product_id",
            "product_name",
            "sku",
            "barcode",
            "generic_name",
            "category",
            "category_display",
            "dosage_form",
            "dosage_form_display",
            "prescription_class",
            "is_narcotic",
            "batch_id",
            "batch_number",
            "manufacturer_name",
            "expiry_date",
            "is_expired",
            "is_recalled",
            "packaging",
            "quantity_on_hand",
            "quantity_quarantined",
            "available_quantity",
            "formatted_stock",
            "is_low_stock",
            "mrp",
            "unit_mrp",
            "total_valuation_retail",
            "unit_cost",
            "total_valuation_cost",
        ]

    def get_is_expired(self, obj):
        return obj.batch.expiry_date <= timezone.localdate()

    def get_packaging(self, obj):
        snap = obj.batch.packaging_snapshot
        return {
            "snapshot_id": str(snap.id),
            "version": snap.version,
            "base_unit": snap.base_unit,
            "sale_unit": snap.sale_unit,
            "conversion_factor": snap.conversion_factor,
            "is_loose_dispensing_allowed": snap.is_loose_dispensing_allowed,
            "pack_description": snap.pack_description,
        }

    def get_formatted_stock(self, obj):
        factor = obj.batch.packaging_snapshot.conversion_factor or 1
        sale_unit = obj.batch.packaging_snapshot.sale_unit
        base_unit = obj.batch.packaging_snapshot.base_unit
        packs = obj.quantity_on_hand // factor
        loose = obj.quantity_on_hand % factor
        if packs > 0 and loose > 0:
            return f"{packs} {sale_unit}s, {loose} {base_unit}s"
        elif packs > 0:
            return f"{packs} {sale_unit}s"
        else:
            return f"{loose} {base_unit}s"

    def get_is_low_stock(self, obj):
        return obj.quantity_on_hand <= obj.low_stock_threshold

    def get_total_valuation_retail(self, obj):
        return str((Decimal(obj.quantity_on_hand) * obj.batch.unit_mrp).quantize(Decimal("0.01")))

    def _can_view_cost(self, obj):
        request = self.context.get("request")
        if not request or not request.user:
            return False
        return can_user_view_cost_data(request.user, obj.store)

    def get_unit_cost(self, obj):
        if not self._can_view_cost(obj):
            return None
        # Retrieve latest inward cost layer unit_cost
        layer = BatchInwardCostLayer.objects.filter(
            store=obj.store,
            batch=obj.batch
        ).order_by("-created_at").first()
        return str(layer.unit_cost) if layer else None

    def get_total_valuation_cost(self, obj):
        if not self._can_view_cost(obj):
            return None
        layer = BatchInwardCostLayer.objects.filter(
            store=obj.store,
            batch=obj.batch
        ).order_by("-created_at").first()
        if layer:
            return str((Decimal(obj.quantity_on_hand) * layer.unit_cost).quantize(Decimal("0.01")))
        return None

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Completely omit unit_cost and total_valuation_cost keys for unauthorized roles
        if not self._can_view_cost(instance):
            ret.pop("unit_cost", None)
            ret.pop("total_valuation_cost", None)
        return ret

