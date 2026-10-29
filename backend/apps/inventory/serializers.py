from decimal import Decimal, ROUND_HALF_UP
from django.utils import timezone
from rest_framework import serializers

from apps.products.models import Product
from apps.inventory.models import (
    ProductPackagingSnapshot,
    Batch,
    StoreBatchStock,
    BatchInwardCostLayer,
    Supplier,
    GoodsReceipt,
    GoodsReceiptItem,
    StockTransfer,
    StockTransferItem,
    TransferDiscrepancy,
    AdjustmentApprovalPolicy,
    PhysicalStockCount,
    PhysicalStockCountItem,
    StockAdjustment,
    StoreExpiryPolicy,
    StockQuarantineRecord,
    BatchRecall,
    StockMovement,
)
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

        if not product.is_active:
            raise serializers.ValidationError(
                {"product_id": "Cannot intake stock for an inactive product."}
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

        # 4. Loose unit dispensing policy validation
        if loose_units > 0:
            if not snapshot.is_loose_dispensing_allowed:
                raise serializers.ValidationError(
                    {"quantity_loose_base_units": "Loose dispensing is not permitted for this product's packaging."}
                )
            if snapshot.conversion_factor > 1 and loose_units >= snapshot.conversion_factor:
                raise serializers.ValidationError(
                    {"quantity_loose_base_units": f"Loose units must be strictly less than the conversion factor ({snapshot.conversion_factor}). Convert full packs to sale units."}
                )

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
        # Prefer pre-annotated Subquery to prevent N+1 query loop
        if hasattr(obj, "latest_unit_cost") and obj.latest_unit_cost is not None:
            return str(Decimal(str(obj.latest_unit_cost)).quantize(Decimal("0.0001")))
        # Fallback to direct query if not pre-annotated
        layer = BatchInwardCostLayer.objects.filter(
            store=obj.store,
            batch=obj.batch
        ).order_by("-created_at").first()
        return str(layer.unit_cost) if layer else None

    def get_total_valuation_cost(self, obj):
        if not self._can_view_cost(obj):
            return None
        unit_cost = None
        if hasattr(obj, "latest_unit_cost") and obj.latest_unit_cost is not None:
            unit_cost = Decimal(str(obj.latest_unit_cost))
        else:
            layer = BatchInwardCostLayer.objects.filter(
                store=obj.store,
                batch=obj.batch
            ).order_by("-created_at").first()
            if layer:
                unit_cost = layer.unit_cost
        if unit_cost is not None:
            return str((Decimal(obj.quantity_on_hand) * unit_cost).quantize(Decimal("0.01")))
        return None

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Completely omit unit_cost and total_valuation_cost keys for unauthorized roles
        if not self._can_view_cost(instance):
            ret.pop("unit_cost", None)
            ret.pop("total_valuation_cost", None)
        return ret


class SupplierSerializer(serializers.ModelSerializer):
    """
    Serializer for pharmaceutical suppliers / distributors.
    Enforces organization isolation, GSTIN validation, and uppercase codes.
    """
    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "supplier_code",
            "contact_person",
            "phone",
            "email",
            "address",
            "city",
            "state",
            "postal_code",
            "gstin",
            "drug_license_number",
            "payment_terms_days",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Supplier name cannot be empty.")
        org = self.context.get("organization")
        if org:
            qs = Supplier.objects.filter(organization=org, name__iexact=val)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError("A supplier with this name already exists in the organization.")
        return val

    def validate_gstin(self, value):
        val = value.strip().upper() if value else ""
        if val and len(val) != 15:
            raise serializers.ValidationError("GSTIN must be exactly 15 alphanumeric characters.")
        return val

    def validate_supplier_code(self, value):
        return value.strip().upper() if value else ""


class GoodsReceiptItemInputSerializer(serializers.Serializer):
    """Line item input for Purchase Inward Goods Receipt."""
    product_id = serializers.UUIDField(required=True)
    packaging_snapshot_id = serializers.UUIDField(required=False, allow_null=True)
    batch_number = serializers.CharField(required=True, max_length=100)
    expiry_date = serializers.DateField(required=True)
    manufacturing_date = serializers.DateField(required=False, allow_null=True)
    quantity_sale_units = serializers.IntegerField(required=False, default=0, min_value=0)
    quantity_loose_base_units = serializers.IntegerField(required=False, default=0, min_value=0)
    purchase_cost_per_sale_unit = serializers.DecimalField(
        required=True, max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    mrp = serializers.DecimalField(
        required=True, max_digits=12, decimal_places=2, min_value=Decimal("0.00")
    )
    tax_rate = serializers.DecimalField(
        required=False, default=Decimal("0.00"), max_digits=5, decimal_places=2, min_value=Decimal("0.00")
    )
    intake_status = serializers.ChoiceField(
        choices=GoodsReceiptItem.INTAKE_STATUS_CHOICES, default="VERIFIED"
    )
    quarantine_reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_batch_number(self, value):
        val = value.strip().upper()
        if not val:
            raise serializers.ValidationError("Batch number cannot be empty.")
        return val

    def validate_expiry_date(self, value):
        if value <= timezone.localdate():
            raise serializers.ValidationError("Cannot intake stock for an expired batch.")
        return value

    def validate(self, attrs):
        sale_units = attrs.get("quantity_sale_units", 0) or 0
        loose_units = attrs.get("quantity_loose_base_units", 0) or 0
        if sale_units == 0 and loose_units == 0:
            raise serializers.ValidationError(
                {"quantity_sale_units": "Intake quantity must be greater than zero. Provide sale units or loose units."}
            )

        store = self.context.get("store")
        if not store:
            raise serializers.ValidationError("Store context is required.")

        try:
            product = Product.objects.get(id=attrs["product_id"], organization=store.organization)
        except Product.DoesNotExist:
            raise serializers.ValidationError({"product_id": "Product not found in this organization."})

        if not product.is_active:
            raise serializers.ValidationError({"product_id": f"Product '{product.name}' is inactive."})

        attrs["product"] = product

        snapshot_id = attrs.get("packaging_snapshot_id")
        if snapshot_id:
            try:
                snapshot = ProductPackagingSnapshot.objects.get(id=snapshot_id, product=product)
            except ProductPackagingSnapshot.DoesNotExist:
                raise serializers.ValidationError({"packaging_snapshot_id": "Specified packaging snapshot not found."})
            attrs["packaging_snapshot"] = snapshot
        else:
            snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(product)
            attrs["packaging_snapshot"] = snapshot

        if loose_units > 0:
            if not snapshot.is_loose_dispensing_allowed:
                raise serializers.ValidationError(
                    {"quantity_loose_base_units": f"Loose dispensing is prohibited for {product.name}."}
                )
            if snapshot.conversion_factor > 1 and loose_units >= snapshot.conversion_factor:
                raise serializers.ValidationError(
                    {"quantity_loose_base_units": f"Loose units must be strictly less than conversion factor ({snapshot.conversion_factor})."}
                )

        return attrs


class GoodsReceiptInputSerializer(serializers.Serializer):
    """Input serializer for creating or updating a draft Goods Receipt."""
    supplier_id = serializers.UUIDField(required=True)
    supplier_invoice_number = serializers.CharField(required=True, max_length=100)
    supplier_invoice_date = serializers.DateField(required=True)
    receipt_date = serializers.DateField(required=False, default=timezone.localdate)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    items = GoodsReceiptItemInputSerializer(many=True, required=True)

    def validate_supplier_invoice_number(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Supplier invoice number cannot be empty.")
        return val

    def validate(self, attrs):
        store = self.context.get("store")
        if not store:
            raise serializers.ValidationError("Store context is required.")

        try:
            supplier = Supplier.objects.get(id=attrs["supplier_id"], organization=store.organization)
        except Supplier.DoesNotExist:
            raise serializers.ValidationError({"supplier_id": "Supplier not found in this organization."})

        if not supplier.is_active:
            raise serializers.ValidationError({"supplier_id": f"Supplier '{supplier.name}' is deactivated."})

        attrs["supplier"] = supplier

        items = attrs.get("items", [])
        if not items:
            raise serializers.ValidationError({"items": "At least one item line is required for goods receipt."})

        # Check duplicate invoice number from this supplier in SUBMITTED/POSTED receipts
        inv_num = attrs["supplier_invoice_number"]
        duplicate_qs = GoodsReceipt.objects.filter(
            organization=store.organization,
            supplier=supplier,
            supplier_invoice_number__iexact=inv_num,
            status__in=["SUBMITTED", "POSTED"]
        )
        if duplicate_qs.exists():
            raise serializers.ValidationError(
                {"supplier_invoice_number": f"A receipt for invoice '{inv_num}' from supplier '{supplier.name}' has already been processed or submitted."}
            )

        return attrs


class GoodsReceiptItemSerializer(serializers.ModelSerializer):
    """Output serializer for GoodsReceiptItem with server-side cost masking."""
    id = serializers.CharField()
    product_id = serializers.CharField(source="product.id")
    product_name = serializers.CharField(source="product.name")
    sku = serializers.CharField(source="product.sku")
    barcode = serializers.CharField(source="product.barcode")
    batch_id = serializers.CharField(source="batch.id", allow_null=True)
    packaging_version = serializers.IntegerField(source="packaging_snapshot.version")
    base_unit = serializers.CharField(source="packaging_snapshot.base_unit")
    sale_unit = serializers.CharField(source="packaging_snapshot.sale_unit")
    conversion_factor = serializers.IntegerField(source="packaging_snapshot.conversion_factor")

    class Meta:
        model = GoodsReceiptItem
        fields = [
            "id",
            "product_id",
            "product_name",
            "sku",
            "barcode",
            "packaging_version",
            "base_unit",
            "sale_unit",
            "conversion_factor",
            "batch_id",
            "batch_number",
            "expiry_date",
            "manufacturing_date",
            "quantity_sale_units",
            "quantity_loose_base_units",
            "total_base_units",
            "mrp",
            "unit_mrp",
            "intake_status",
            "quarantine_reason",
            # Sensitive cost fields (masked for staff)
            "purchase_cost_per_sale_unit",
            "unit_cost",
            "tax_rate",
            "tax_amount",
            "total_cost",
        ]

    def _can_view_cost(self, obj):
        request = self.context.get("request")
        if not request or not request.user:
            return False
        return can_user_view_cost_data(request.user, obj.goods_receipt.store)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not self._can_view_cost(instance):
            ret.pop("purchase_cost_per_sale_unit", None)
            ret.pop("unit_cost", None)
            ret.pop("tax_rate", None)
            ret.pop("tax_amount", None)
            ret.pop("total_cost", None)
        return ret


class GoodsReceiptSerializer(serializers.ModelSerializer):
    """Output serializer for GoodsReceipt header and item lines."""
    id = serializers.CharField()
    store_id = serializers.CharField(source="store.id")
    store_name = serializers.CharField(source="store.name")
    supplier_id = serializers.CharField(source="supplier.id")
    supplier_name = serializers.CharField(source="supplier.name")
    received_by_name = serializers.CharField(source="received_by.full_name", allow_null=True)
    posted_by_name = serializers.CharField(source="posted_by.full_name", allow_null=True)
    items = GoodsReceiptItemSerializer(many=True, read_only=True)
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = GoodsReceipt
        fields = [
            "id",
            "grn_number",
            "store_id",
            "store_name",
            "supplier_id",
            "supplier_name",
            "supplier_invoice_number",
            "supplier_invoice_date",
            "receipt_date",
            "status",
            "notes",
            "received_by_name",
            "posted_by_name",
            "posted_at",
            "created_at",
            "updated_at",
            "items_count",
            "items",
            # Sensitive financial aggregates
            "total_taxable_amount",
            "total_tax_amount",
            "total_amount",
        ]

    def get_items_count(self, obj):
        return obj.items.count()

    def _can_view_cost(self, obj):
        request = self.context.get("request")
        if not request or not request.user:
            return False
        return can_user_view_cost_data(request.user, obj.store)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not self._can_view_cost(instance):
            ret.pop("total_taxable_amount", None)
            ret.pop("total_tax_amount", None)
            ret.pop("total_amount", None)
        return ret


# =============================================================================
# Milestone 2C.2: Stock Transfer Serializers
# =============================================================================

class StockTransferItemInputSerializer(serializers.Serializer):
    """Line input for creating an inter-store transfer request."""
    product_id = serializers.UUIDField(required=True)
    batch_id = serializers.UUIDField(required=True)
    quantity_requested = serializers.IntegerField(required=False, min_value=1)
    quantity_sale_units = serializers.IntegerField(required=False, default=0, min_value=0)
    quantity_loose_base_units = serializers.IntegerField(required=False, default=0, min_value=0)

    def validate(self, attrs):
        qty_req = attrs.get("quantity_requested")
        sale_units = attrs.get("quantity_sale_units", 0) or 0
        loose_units = attrs.get("quantity_loose_base_units", 0) or 0

        if not qty_req and sale_units == 0 and loose_units == 0:
            raise serializers.ValidationError("Transfer quantity must be greater than zero. Provide quantity_requested or sale/loose units.")

        # Resolve org or source_store from context or parent data
        org = self.context.get("organization")
        source_store = self.context.get("source_store")

        if not source_store:
            parent = getattr(self, "parent", None)
            if parent and hasattr(parent, "initial_data") and isinstance(parent.initial_data, dict):
                src_id = parent.initial_data.get("source_store_id")
                if src_id:
                    from apps.organizations.models import Store
                    source_store = Store.objects.filter(id=src_id).first()

        if not org and source_store:
            org = source_store.organization

        if not org:
            raise serializers.ValidationError("Organization context is required.")

        try:
            product = Product.objects.get(id=attrs["product_id"], organization=org)
        except Product.DoesNotExist:
            raise serializers.ValidationError({"product_id": "Product not found in this organization."})

        if not product.is_active:
            raise serializers.ValidationError({"product_id": f"Product '{product.name}' is inactive."})

        try:
            batch = Batch.objects.select_related("packaging_snapshot").get(
                id=attrs["batch_id"], organization=org, product=product
            )
        except Batch.DoesNotExist:
            raise serializers.ValidationError({"batch_id": "Batch not found for this product."})

        if batch.expiry_date <= timezone.localdate():
            raise serializers.ValidationError({"batch_id": f"Batch '{batch.batch_number}' is expired and cannot be transferred."})

        if batch.is_recalled:
            raise serializers.ValidationError({"batch_id": f"Batch '{batch.batch_number}' is recalled."})

        if batch.intake_status == "quarantine_review":
            raise serializers.ValidationError({"batch_id": f"Batch '{batch.batch_number}' is in quarantine review."})

        snapshot = batch.packaging_snapshot
        if qty_req:
            total_base = qty_req
        else:
            if loose_units > 0:
                if not snapshot.is_loose_dispensing_allowed:
                    raise serializers.ValidationError({"quantity_loose_base_units": f"Loose units are prohibited for {product.name}."})
                if snapshot.conversion_factor > 1 and loose_units >= snapshot.conversion_factor:
                    raise serializers.ValidationError({"quantity_loose_base_units": f"Loose units must be strictly less than conversion factor ({snapshot.conversion_factor})."})
            total_base = (sale_units * snapshot.conversion_factor) + loose_units

        # Validate available quantity at source store if source_store is resolved
        if source_store:
            source_stock = StoreBatchStock.objects.filter(store=source_store, batch=batch).first()
            available = source_stock.available_quantity if source_stock else 0
            if available < total_base:
                raise serializers.ValidationError(
                    {"batch_id": f"Insufficient available stock for batch {batch.batch_number}. Requested: {total_base}, Available: {available} base units."}
                )

        attrs["product"] = product
        attrs["batch"] = batch
        attrs["packaging_snapshot"] = snapshot
        attrs["quantity_requested"] = total_base
        attrs["total_base_units"] = total_base
        return attrs


class StockTransferInputSerializer(serializers.Serializer):
    """Header input for creating an inter-store transfer request."""
    source_store_id = serializers.UUIDField(required=True)
    destination_store_id = serializers.UUIDField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    items = StockTransferItemInputSerializer(many=True, required=True)

    def validate(self, attrs):
        org = self.context.get("organization")
        if not org:
            raise serializers.ValidationError("Organization context is required.")

        source_id = attrs["source_store_id"]
        dest_id = attrs["destination_store_id"]

        if source_id == dest_id:
            raise serializers.ValidationError("Source store and destination store must be different branches.")

        from apps.organizations.models import Store
        try:
            source_store = Store.objects.get(id=source_id, organization=org)
        except Store.DoesNotExist:
            raise serializers.ValidationError({"source_store_id": "Source store not found in this organization."})

        try:
            dest_store = Store.objects.get(id=dest_id, organization=org)
        except Store.DoesNotExist:
            raise serializers.ValidationError({"destination_store_id": "Destination store not found in this organization."})

        attrs["source_store"] = source_store
        attrs["destination_store"] = dest_store

        items = attrs.get("items", [])
        if not items:
            raise serializers.ValidationError({"items": "At least one item line is required for transfer."})

        return attrs


class TransferDiscrepancySerializer(serializers.ModelSerializer):
    """Output serializer for in-transit transfer discrepancy records."""
    id = serializers.CharField()
    reported_by_name = serializers.CharField(source="reported_by.full_name", allow_null=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", allow_null=True)

    class Meta:
        model = TransferDiscrepancy
        fields = [
            "id",
            "discrepancy_type",
            "expected_quantity",
            "actual_quantity",
            "discrepancy_quantity",
            "evidence_notes",
            "status",
            "reported_by_name",
            "reviewed_by_name",
            "resolution_decision",
            "resolution_notes",
            "resolved_at",
            "created_at",
        ]


class StockTransferItemSerializer(serializers.ModelSerializer):
    """Output serializer for transfer line items with cost masking."""
    id = serializers.CharField()
    product_id = serializers.CharField(source="product.id")
    product_name = serializers.CharField(source="product.name")
    sku = serializers.CharField(source="product.sku")
    barcode = serializers.CharField(source="product.barcode")
    batch_id = serializers.CharField(source="batch.id")
    batch_number = serializers.CharField(source="batch.batch_number")
    expiry_date = serializers.DateField(source="batch.expiry_date")
    base_unit = serializers.CharField(source="packaging_snapshot.base_unit")
    sale_unit = serializers.CharField(source="packaging_snapshot.sale_unit")
    conversion_factor = serializers.IntegerField(source="packaging_snapshot.conversion_factor")
    in_transit_quantity = serializers.IntegerField(read_only=True)
    discrepancies = TransferDiscrepancySerializer(many=True, read_only=True)

    class Meta:
        model = StockTransferItem
        fields = [
            "id",
            "product_id",
            "product_name",
            "sku",
            "barcode",
            "batch_id",
            "batch_number",
            "expiry_date",
            "base_unit",
            "sale_unit",
            "conversion_factor",
            "quantity_requested",
            "quantity_dispatched",
            "quantity_received",
            "quantity_damaged",
            "quantity_missing",
            "quantity_excess",
            "in_transit_quantity",
            "status",
            "unit_mrp",
            "unit_cost",
            "discrepancies",
        ]

    def _can_view_cost(self, obj):
        request = self.context.get("request")
        if not request or not request.user:
            return False
        return can_user_view_cost_data(request.user, obj.transfer.source_store)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not self._can_view_cost(instance):
            ret.pop("unit_cost", None)
        return ret


class StockTransferSerializer(serializers.ModelSerializer):
    """Output serializer for StockTransfer header, items, and audit timestamps."""
    id = serializers.CharField()
    source_store_id = serializers.CharField(source="source_store.id")
    source_store_name = serializers.CharField(source="source_store.name")
    destination_store_id = serializers.CharField(source="destination_store.id")
    destination_store_name = serializers.CharField(source="destination_store.name")
    requested_by_name = serializers.CharField(source="requested_by.full_name", allow_null=True)
    approved_by_name = serializers.CharField(source="approved_by.full_name", allow_null=True)
    dispatched_by_name = serializers.CharField(source="dispatched_by.full_name", allow_null=True)
    received_by_name = serializers.CharField(source="received_by.full_name", allow_null=True)
    items = StockTransferItemSerializer(many=True, read_only=True)
    discrepancies = TransferDiscrepancySerializer(many=True, read_only=True)
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = StockTransfer
        fields = [
            "id",
            "transfer_number",
            "status",
            "source_store_id",
            "source_store_name",
            "destination_store_id",
            "destination_store_name",
            "notes",
            "cancellation_reason",
            "requested_by_name",
            "approved_by_name",
            "dispatched_by_name",
            "received_by_name",
            "approved_at",
            "dispatched_at",
            "received_at",
            "created_at",
            "updated_at",
            "items_count",
            "items",
            "discrepancies",
        ]

    def get_items_count(self, obj):
        return obj.items.count()


class StockTransferReceiptLineSerializer(serializers.Serializer):
    """Receipt line input for receiving an in-transit transfer."""
    item_id = serializers.UUIDField(required=True)
    quantity_received = serializers.IntegerField(required=False, default=0, min_value=0)
    quantity_damaged = serializers.IntegerField(required=False, default=0, min_value=0)
    quantity_missing = serializers.IntegerField(required=False, default=0, min_value=0)
    quantity_excess = serializers.IntegerField(required=False, default=0, min_value=0)
    evidence_notes = serializers.CharField(required=False, allow_blank=True, default="")


class StockTransferReceiptInputSerializer(serializers.Serializer):
    """Input serializer for destination receipt action."""
    receipt_lines = StockTransferReceiptLineSerializer(many=True, required=True)

    def validate_receipt_lines(self, value):
        if not value:
            raise serializers.ValidationError("At least one receipt line must be specified.")
        return value


class TransferDiscrepancyResolutionInputSerializer(serializers.Serializer):
    """Input serializer for resolving an in-transit discrepancy."""
    resolution_decision = serializers.ChoiceField(
        choices=[
            ("RECOVERED", "Stock Located & Recovered"),
            ("RETURNED_TO_SOURCE", "Returned to Source Branch"),
            ("LOSS_CONFIRMED", "Transit Loss Confirmed (Pending Liability Determination)"),
        ],
        required=True
    )
    resolution_notes = serializers.CharField(required=True, min_length=5)


# =============================================================================
# Milestone 2C.3: Stock Adjustment & Physical Stock Count Serializers
# =============================================================================

class StockAdjustmentInputSerializer(serializers.Serializer):
    """Input serializer for initiating a StockAdjustment request."""
    store_id = serializers.UUIDField(required=True)
    product_id = serializers.UUIDField(required=True)
    batch_id = serializers.UUIDField(required=True)
    adjustment_quantity = serializers.IntegerField(required=True)
    reason_code = serializers.ChoiceField(choices=StockAdjustment.REASON_CHOICES, required=True)
    explanation = serializers.CharField(required=True, min_length=5)

    def validate_adjustment_quantity(self, value):
        if value == 0:
            raise serializers.ValidationError("Adjustment quantity cannot be zero. Specify a positive (+) surplus or negative (-) reduction.")
        return value

    def validate(self, attrs):
        from apps.organizations.models import Store
        org = self.context.get("organization")
        store_id = attrs["store_id"]

        try:
            store = Store.objects.get(id=store_id, organization=org)
        except Store.DoesNotExist:
            raise serializers.ValidationError({"store_id": "Store not found in caller organization."})

        if not store.organization.is_active:
            raise serializers.ValidationError("Organization is deactivated.")

        try:
            product = Product.objects.get(id=attrs["product_id"], organization=org)
        except Product.DoesNotExist:
            raise serializers.ValidationError({"product_id": "Product not found in caller organization."})

        try:
            batch = Batch.objects.select_related("packaging_snapshot").get(
                id=attrs["batch_id"], organization=org, product=product
            )
        except Batch.DoesNotExist:
            raise serializers.ValidationError({"batch_id": "Batch not found for this product."})

        # Fetch current system on-hand
        stock = StoreBatchStock.objects.filter(store=store, batch=batch).first()
        current_on_hand = stock.quantity_on_hand if stock else 0

        adj_qty = attrs["adjustment_quantity"]
        resulting = current_on_hand + adj_qty

        if resulting < 0:
            raise serializers.ValidationError({
                "adjustment_quantity": f"Adjustment of {adj_qty:+d} would result in negative physical stock ({resulting}) at {store.name}."
            })

        attrs["store"] = store
        attrs["product"] = product
        attrs["batch"] = batch
        attrs["packaging_snapshot"] = batch.packaging_snapshot
        attrs["current_on_hand"] = current_on_hand
        attrs["resulting_quantity"] = resulting
        return attrs


class StockAdjustmentReviewInputSerializer(serializers.Serializer):
    """Input serializer for review/approval of a StockAdjustment."""
    decision = serializers.ChoiceField(choices=["APPROVE", "REJECT"], required=True)
    review_notes = serializers.CharField(required=True, min_length=3)


class StockAdjustmentSerializer(serializers.ModelSerializer):
    """Output serializer for StockAdjustment with server-side cost masking."""
    id = serializers.CharField()
    store_id = serializers.CharField(source="store.id")
    store_name = serializers.CharField(source="store.name")
    product_id = serializers.CharField(source="product.id")
    product_name = serializers.CharField(source="product.name")
    sku = serializers.CharField(source="product.sku")
    barcode = serializers.CharField(source="product.barcode")
    batch_id = serializers.CharField(source="batch.id")
    batch_number = serializers.CharField(source="batch.batch_number")
    expiry_date = serializers.DateField(source="batch.expiry_date")
    base_unit = serializers.CharField(source="packaging_snapshot.base_unit")
    requested_by_name = serializers.CharField(source="requested_by.full_name", allow_null=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", allow_null=True)
    posted_by_name = serializers.CharField(source="posted_by.full_name", allow_null=True)
    movement_id = serializers.CharField(source="stock_movement.id", allow_null=True)

    class Meta:
        model = StockAdjustment
        fields = [
            "id",
            "adjustment_number",
            "store_id",
            "store_name",
            "product_id",
            "product_name",
            "sku",
            "barcode",
            "batch_id",
            "batch_number",
            "expiry_date",
            "base_unit",
            "system_quantity_at_request",
            "adjustment_quantity",
            "resulting_quantity",
            "reason_code",
            "explanation",
            "status",
            "unit_cost_basis",
            "calculated_valuation",
            "requested_by_name",
            "reviewed_by_name",
            "reviewed_at",
            "review_notes",
            "posted_by_name",
            "posted_at",
            "movement_id",
            "created_at",
            "updated_at",
        ]

    def _can_view_cost(self, obj):
        request = self.context.get("request")
        if not request or not request.user:
            return False
        return can_user_view_cost_data(request.user, obj.store)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not self._can_view_cost(instance):
            ret.pop("unit_cost_basis", None)
            ret.pop("calculated_valuation", None)
        return ret


class PhysicalStockCountInputSerializer(serializers.Serializer):
    """Input serializer for starting a Physical Stock Count session."""
    store_id = serializers.UUIDField(required=True)
    count_type = serializers.ChoiceField(choices=PhysicalStockCount.COUNT_TYPES, default="CYCLE_COUNT")
    batch_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        from apps.organizations.models import Store
        org = self.context.get("organization")
        try:
            store = Store.objects.get(id=attrs["store_id"], organization=org)
        except Store.DoesNotExist:
            raise serializers.ValidationError({"store_id": "Store not found in caller organization."})

        attrs["store"] = store
        return attrs


class PhysicalStockCountItemEntrySerializer(serializers.Serializer):
    """Entry line for recording count on an individual batch."""
    item_id = serializers.UUIDField(required=True)
    counted_quantity = serializers.IntegerField(required=True, min_value=0)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class PhysicalStockCountRecordInputSerializer(serializers.Serializer):
    """Input serializer for recording counted tallies across multiple items."""
    items = PhysicalStockCountItemEntrySerializer(many=True, required=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item count must be submitted.")
        return value


class PhysicalStockCountItemSerializer(serializers.ModelSerializer):
    """Output serializer for count line items."""
    id = serializers.CharField()
    product_id = serializers.CharField(source="product.id")
    product_name = serializers.CharField(source="product.name")
    sku = serializers.CharField(source="product.sku")
    barcode = serializers.CharField(source="product.barcode")
    batch_id = serializers.CharField(source="batch.id")
    batch_number = serializers.CharField(source="batch.batch_number")
    expiry_date = serializers.DateField(source="batch.expiry_date")
    base_unit = serializers.CharField(source="packaging_snapshot.base_unit")
    counted_by_name = serializers.CharField(source="counted_by.full_name", allow_null=True)

    class Meta:
        model = PhysicalStockCountItem
        fields = [
            "id",
            "product_id",
            "product_name",
            "sku",
            "barcode",
            "batch_id",
            "batch_number",
            "expiry_date",
            "base_unit",
            "snapshot_system_quantity",
            "counted_quantity",
            "intervening_movement_quantity",
            "reconciled_system_quantity",
            "variance_quantity",
            "status",
            "notes",
            "counted_by_name",
            "counted_at",
            "updated_at",
        ]


class PhysicalStockCountSerializer(serializers.ModelSerializer):
    """Output serializer for physical stock count session."""
    id = serializers.CharField()
    store_id = serializers.CharField(source="store.id")
    store_name = serializers.CharField(source="store.name")
    initiated_by_name = serializers.CharField(source="initiated_by.full_name", allow_null=True)
    submitted_by_name = serializers.CharField(source="submitted_by.full_name", allow_null=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", allow_null=True)
    items = PhysicalStockCountItemSerializer(many=True, read_only=True)
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = PhysicalStockCount
        fields = [
            "id",
            "count_number",
            "store_id",
            "store_name",
            "count_type",
            "status",
            "notes",
            "snapshot_at",
            "initiated_by_name",
            "submitted_by_name",
            "submitted_at",
            "reviewed_by_name",
            "reviewed_at",
            "review_notes",
            "created_at",
            "updated_at",
            "items_count",
            "items",
        ]

    def get_items_count(self, obj):
        return obj.items.count()


class AdjustmentApprovalPolicySerializer(serializers.ModelSerializer):
    """Serializer for configurable adjustment approval policies."""
    id = serializers.CharField()
    store_name = serializers.CharField(source="store.name", allow_null=True)

    class Meta:
        model = AdjustmentApprovalPolicy
        fields = [
            "id",
            "store_id",
            "store_name",
            "max_manager_adjustment_value",
            "max_manager_adjustment_quantity",
            "require_owner_for_writeoff",
            "is_configured",
            "updated_at",
        ]


# =============================================================================
# Milestone 2C.4: Quarantine, Expiry & Batch Recall Serializers
# =============================================================================

class StoreExpiryPolicySerializer(serializers.ModelSerializer):
    """Output serializer for store near-expiry policies."""
    id = serializers.CharField()
    store_id = serializers.CharField(source="store.id", allow_null=True)
    store_name = serializers.CharField(source="store.name", allow_null=True)

    class Meta:
        model = StoreExpiryPolicy
        fields = [
            "id",
            "store_id",
            "store_name",
            "warning_threshold_days",
            "critical_threshold_days",
            "created_at",
            "updated_at",
        ]


class StoreExpiryPolicyInputSerializer(serializers.Serializer):
    """Input serializer for configuring near-expiry alert threshold days."""
    store_id = serializers.UUIDField(required=False, allow_null=True)
    warning_threshold_days = serializers.IntegerField(required=True, min_value=1, max_value=365)
    critical_threshold_days = serializers.IntegerField(required=True, min_value=1, max_value=365)

    def validate(self, attrs):
        if attrs["critical_threshold_days"] > attrs["warning_threshold_days"]:
            raise serializers.ValidationError({
                "critical_threshold_days": "Critical threshold days must be less than or equal to warning threshold days."
            })
        return attrs


class BatchExpiryMonitoringSerializer(serializers.Serializer):
    """Output serializer for unified batch safety & expiry status monitoring."""
    batch_id = serializers.CharField()
    batch_number = serializers.CharField()
    product_id = serializers.CharField()
    product_name = serializers.CharField()
    sku = serializers.CharField()
    store_id = serializers.CharField()
    store_name = serializers.CharField()
    expiry_date = serializers.DateField()
    days_until_expiry = serializers.IntegerField()
    expiry_status = serializers.CharField()  # 'EXPIRED', 'CRITICAL_NEAR_EXPIRY', 'WARNING_NEAR_EXPIRY', 'SAFE'
    is_recalled = serializers.BooleanField()
    quantity_on_hand = serializers.IntegerField()
    quantity_quarantined = serializers.IntegerField()
    available_quantity = serializers.IntegerField()
    mrp = serializers.DecimalField(max_digits=12, decimal_places=2)
    base_unit = serializers.CharField()


class StockQuarantineRecordSerializer(serializers.ModelSerializer):
    """Output serializer for quarantine records."""
    id = serializers.CharField()
    store_id = serializers.CharField(source="store.id")
    store_name = serializers.CharField(source="store.name")
    batch_id = serializers.CharField(source="batch.id")
    batch_number = serializers.CharField(source="batch.batch_number")
    product_id = serializers.CharField(source="product.id")
    product_name = serializers.CharField(source="product.name")
    sku = serializers.CharField(source="product.sku")
    base_unit = serializers.CharField(source="batch.packaging_snapshot.base_unit")
    quarantined_by_name = serializers.CharField(source="quarantined_by.full_name", allow_null=True)
    released_by_name = serializers.CharField(source="released_by.full_name", allow_null=True)

    class Meta:
        model = StockQuarantineRecord
        fields = [
            "id",
            "quarantine_number",
            "store_id",
            "store_name",
            "batch_id",
            "batch_number",
            "product_id",
            "product_name",
            "sku",
            "base_unit",
            "quantity_quarantined",
            "reason_code",
            "notes",
            "evidence_metadata",
            "status",
            "quarantined_by_name",
            "quarantined_at",
            "released_by_name",
            "released_at",
            "release_reason",
            "disposition_notes",
            "created_at",
            "updated_at",
        ]


class StockQuarantineInputSerializer(serializers.Serializer):
    """Input serializer for quarantining stock."""
    store_id = serializers.UUIDField(required=True)
    batch_id = serializers.UUIDField(required=True)
    quantity = serializers.IntegerField(required=True, min_value=1)
    reason_code = serializers.ChoiceField(choices=StockQuarantineRecord.REASON_CHOICES, required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    evidence_metadata = serializers.DictField(required=False, default=dict)


class StockQuarantineReleaseInputSerializer(serializers.Serializer):
    """Input serializer for releasing quarantined stock."""
    release_quantity = serializers.IntegerField(required=True, min_value=1)
    release_reason = serializers.CharField(required=True, allow_blank=False)


class StockQuarantineDisposeInputSerializer(serializers.Serializer):
    """Input serializer for disposing quarantined stock."""
    disposition_type = serializers.ChoiceField(
        choices=["WRITTEN_OFF", "RETURNED_TO_SUPPLIER"],
        required=True
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class BatchRecallSerializer(serializers.ModelSerializer):
    """Output serializer for Batch Recall notices."""
    id = serializers.CharField()
    batch_id = serializers.CharField(source="batch.id")
    batch_number = serializers.CharField(source="batch.batch_number")
    expiry_date = serializers.DateField(source="batch.expiry_date")
    product_id = serializers.CharField(source="product.id")
    product_name = serializers.CharField(source="product.name")
    product_sku = serializers.CharField(source="product.sku")
    base_unit = serializers.CharField(source="batch.packaging_snapshot.base_unit")
    initiated_by_name = serializers.CharField(source="initiated_by.full_name", allow_null=True)
    closed_by_name = serializers.CharField(source="closed_by.full_name", allow_null=True)

    class Meta:
        model = BatchRecall
        fields = [
            "id",
            "recall_number",
            "batch_id",
            "batch_number",
            "expiry_date",
            "product_id",
            "product_name",
            "product_sku",
            "base_unit",
            "source",
            "severity",
            "reason",
            "evidence_references",
            "affected_stores_count",
            "affected_quantity_on_hand",
            "affected_quantity_in_transit",
            "status",
            "disposition_type",
            "resolution_notes",
            "initiated_by_name",
            "initiated_at",
            "closed_by_name",
            "closed_at",
            "created_at",
            "updated_at",
        ]


class BatchRecallInputSerializer(serializers.Serializer):
    """Input serializer for initiating a batch recall."""
    batch_id = serializers.UUIDField(required=True)
    source = serializers.ChoiceField(choices=BatchRecall.SOURCE_CHOICES, required=True)
    severity = serializers.ChoiceField(choices=BatchRecall.SEVERITY_CHOICES, default="CLASS_1_CRITICAL")
    reason = serializers.CharField(required=True, allow_blank=False)
    evidence_references = serializers.DictField(required=False, default=dict)
    auto_quarantine_stock = serializers.BooleanField(required=False, default=True)


class BatchRecallReleaseInputSerializer(serializers.Serializer):
    """Input serializer for lifting / releasing a batch recall."""
    resolution_notes = serializers.CharField(required=True, allow_blank=False)


class BatchRecallDisposeInputSerializer(serializers.Serializer):
    """Input serializer for disposing all recalled batch stocks across stores."""
    disposition_type = serializers.ChoiceField(
        choices=["SUPPLIER_RETURN", "DESTRUCTION_WRITEOFF"],
        required=True
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class StockMovementSerializer(serializers.ModelSerializer):
    """Output serializer for append-only StockMovement ledger entries with server-side cost masking."""
    id = serializers.CharField()
    store_id = serializers.CharField(source="store.id")
    store_name = serializers.CharField(source="store.name")
    product_id = serializers.CharField(source="product.id")
    product_name = serializers.CharField(source="product.name")
    product_sku = serializers.CharField(source="product.sku")
    barcode = serializers.CharField(source="product.barcode")
    batch_id = serializers.CharField(source="batch.id")
    batch_number = serializers.CharField(source="batch.batch_number")
    expiry_date = serializers.DateField(source="batch.expiry_date")
    actor_name = serializers.CharField(source="actor.full_name", allow_null=True)
    movement_type_display = serializers.CharField(source="get_movement_type_display")

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "created_at",
            "store_id",
            "store_name",
            "product_id",
            "product_name",
            "product_sku",
            "barcode",
            "batch_id",
            "batch_number",
            "expiry_date",
            "movement_type",
            "movement_type_display",
            "direction",
            "quantity",
            "balance_before",
            "balance_after",
            "quarantine_before",
            "quarantine_after",
            "reference_type",
            "reference_id",
            "reason",
            "actor_name",
            "unit_mrp",
            "unit_cost",
            "total_cost_value",
        ]

    def _can_view_cost(self, obj):
        request = self.context.get("request")
        if not request or not request.user:
            return False
        return can_user_view_cost_data(request.user, obj.store)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not self._can_view_cost(instance):
            ret.pop("unit_cost", None)
            ret.pop("total_cost_value", None)
        return ret





