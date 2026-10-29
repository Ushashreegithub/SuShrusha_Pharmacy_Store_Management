from decimal import Decimal
from rest_framework import serializers
from apps.products.models import Product
from apps.inventory.models import Batch
from apps.billing.models import (
    Customer,
    SaleDraft,
    SaleDraftItem,
    DiscountApprovalRequest,
    CheckoutAttempt,
    Invoice,
    InvoiceItem,
    InvoiceItemBatchAllocation,
    Payment,
)
from apps.billing.services import BillingCalculator, BillingAllocationService


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone_number",
            "email",
            "address",
            "doctor_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        val = value.strip()
        if not val or len(val) < 2:
            raise serializers.ValidationError("Customer name must be at least 2 characters long.")
        return val

    def validate_phone_number(self, value):
        val = value.strip()
        if not val or len(val) < 7:
            raise serializers.ValidationError("Please provide a valid contact phone number (at least 7 digits).")
        return val


class POSProductSearchSerializer(serializers.ModelSerializer):
    """
    Optimized serializer for cashier POS medicine search.
    Includes live available stock, latest lot MRP, and dispensing rules.
    Provides dual-compatibility for both frontend camel/snake case expectations.
    """
    is_prescription_required = serializers.SerializerMethodField()
    available_base_units = serializers.SerializerMethodField()
    available_packs = serializers.SerializerMethodField()
    available_stock_base_units = serializers.SerializerMethodField()
    available_stock_sale_units = serializers.SerializerMethodField()
    mrp = serializers.SerializerMethodField()
    unit_mrp = serializers.SerializerMethodField()
    display_mrp = serializers.SerializerMethodField()
    display_unit_mrp = serializers.SerializerMethodField()
    nearest_expiry = serializers.SerializerMethodField()
    next_expiry = serializers.SerializerMethodField()
    batches = serializers.SerializerMethodField()

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
            "category",
            "item_type",
            "dosage_form",
            "strength",
            "prescription_class",
            "is_prescription_required",
            "pack_description",
            "base_unit",
            "sale_unit",
            "conversion_factor",
            "is_loose_dispensing_allowed",
            "gst_rate",
            "available_base_units",
            "available_packs",
            "available_stock_base_units",
            "available_stock_sale_units",
            "mrp",
            "unit_mrp",
            "display_mrp",
            "display_unit_mrp",
            "nearest_expiry",
            "next_expiry",
            "batches",
        ]

    def get_is_prescription_required(self, obj):
        return obj.prescription_class != "otc"

    def _get_fefo_data(self, obj):
        if not hasattr(self, "_fefo_cache"):
            self._fefo_cache = {}
        store = self.context.get("store")
        if not store:
            return {}
        key = (store.id, obj.id)
        if key not in self._fefo_cache:
            preview = BillingAllocationService.get_eligible_batches_preview(
                store=store,
                product_id=obj.id,
                quantity_base_units=1
            )
            self._fefo_cache[key] = preview
        return self._fefo_cache[key]

    def get_available_base_units(self, obj):
        fefo = self._get_fefo_data(obj)
        return fefo.get("total_available_base_units", 0) if isinstance(fefo, dict) else 0

    def get_available_stock_base_units(self, obj):
        return self.get_available_base_units(obj)

    def get_available_packs(self, obj):
        base = self.get_available_base_units(obj)
        conv = max(1, obj.conversion_factor)
        return base // conv

    def get_available_stock_sale_units(self, obj):
        return self.get_available_packs(obj)

    def get_mrp(self, obj):
        fefo = self._get_fefo_data(obj)
        batches = fefo.get("allocated_batches", []) if isinstance(fefo, dict) else []
        if batches:
            return batches[0]["mrp"]
        # Fallback to any existing batch for this product
        any_batch = Batch.objects.filter(product=obj).order_by("-expiry_date").first()
        if any_batch:
            return any_batch.mrp
        return Decimal("0.00")

    def get_display_mrp(self, obj):
        return f"{self.get_mrp(obj):.2f}"

    def get_unit_mrp(self, obj):
        m = self.get_mrp(obj)
        conv = max(1, obj.conversion_factor)
        return (m / Decimal(conv)).quantize(Decimal("0.01"))

    def get_display_unit_mrp(self, obj):
        return f"{self.get_unit_mrp(obj):.2f}"

    def get_nearest_expiry(self, obj):
        fefo = self._get_fefo_data(obj)
        batches = fefo.get("allocated_batches", []) if isinstance(fefo, dict) else []
        if batches:
            return batches[0]["expiry_date"]
        return None

    def get_next_expiry(self, obj):
        return self.get_nearest_expiry(obj)

    def get_batches(self, obj):
        fefo = self._get_fefo_data(obj)
        batches = fefo.get("allocated_batches", []) if isinstance(fefo, dict) else []
        conv = max(1, obj.conversion_factor)
        return [
            {
                "batch_id": str(b.get("batch_id")),
                "batch_number": b.get("batch_number", ""),
                "expiry_date": str(b.get("expiry_date", "")),
                "mrp": f"{Decimal(str(b.get('mrp', 0))):.2f}",
                "unit_mrp": f"{Decimal(str(b.get('unit_mrp', (Decimal(str(b.get('mrp', 0))) / Decimal(conv))))):.2f}",
                "available_base_units": b.get("allocated_base_units", 0),
                "available_sale_units": b.get("allocated_base_units", 0) // conv,
            }
            for b in batches
        ]


class SaleDraftItemSerializer(serializers.ModelSerializer):
    product_id = serializers.UUIDField(source="product.id", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    barcode = serializers.CharField(source="product.barcode", read_only=True)
    brand_name = serializers.CharField(source="product.brand_name", read_only=True)
    generic_name = serializers.CharField(source="product.generic_name", read_only=True)
    strength = serializers.CharField(source="product.strength", read_only=True)
    dosage_form = serializers.CharField(source="product.dosage_form", read_only=True)
    base_unit = serializers.CharField(source="product.base_unit", read_only=True)
    sale_unit = serializers.CharField(source="product.sale_unit", read_only=True)
    unit_name = serializers.SerializerMethodField()
    prescription_class = serializers.CharField(source="product.prescription_class", read_only=True)
    is_prescription_required = serializers.SerializerMethodField()
    is_loose_dispensing_allowed = serializers.BooleanField(source="product.is_loose_dispensing_allowed", read_only=True)
    unit_mrp = serializers.SerializerMethodField()
    line_gross = serializers.SerializerMethodField()
    line_net = serializers.SerializerMethodField()
    discount_percentage = serializers.SerializerMethodField()
    discount_amount = serializers.SerializerMethodField()
    taxable_amount = serializers.SerializerMethodField()
    cgst_amount = serializers.SerializerMethodField()
    sgst_amount = serializers.SerializerMethodField()
    equivalent_base_units = serializers.IntegerField(source="total_base_units", read_only=True)
    line_calculations = serializers.SerializerMethodField()

    class Meta:
        model = SaleDraftItem
        fields = [
            "id",
            "product",
            "product_id",
            "product_name",
            "product_sku",
            "barcode",
            "brand_name",
            "generic_name",
            "strength",
            "dosage_form",
            "base_unit",
            "sale_unit",
            "unit_name",
            "prescription_class",
            "is_prescription_required",
            "is_loose_dispensing_allowed",
            "unit_type",
            "quantity",
            "conversion_factor",
            "total_base_units",
            "equivalent_base_units",
            "unit_price",
            "mrp",
            "unit_mrp",
            "line_gross",
            "line_net",
            "discount_percentage",
            "discount_amount",
            "tax_rate",
            "taxable_amount",
            "cgst_amount",
            "sgst_amount",
            "line_calculations",
            "created_at",
        ]
        read_only_fields = ["id", "conversion_factor", "total_base_units", "created_at"]

    def get_unit_name(self, obj):
        return obj.product.base_unit if obj.unit_type in ["BASE_UNIT", "LOOSE_UNIT"] else obj.product.sale_unit

    def get_is_prescription_required(self, obj):
        return obj.product.prescription_class != "otc"

    def _get_calc(self, obj):
        if not hasattr(self, "_calc_cache"):
            self._calc_cache = {}
        if obj.id not in self._calc_cache:
            self._calc_cache[obj.id] = BillingCalculator.calculate_line_item(
                quantity=obj.quantity,
                unit_type=obj.unit_type,
                conversion_factor=obj.conversion_factor,
                mrp=obj.mrp,
                tax_rate=obj.tax_rate,
                override_unit_price=obj.unit_price,
            )
        return self._calc_cache[obj.id]

    def get_line_calculations(self, obj):
        return self._get_calc(obj)

    def get_unit_mrp(self, obj):
        return f"{obj.unit_price:.2f}"

    def get_line_gross(self, obj):
        return f"{self._get_calc(obj)['gross_amount']:.2f}"

    def get_line_net(self, obj):
        return f"{self._get_calc(obj)['net_total']:.2f}"

    def get_discount_percentage(self, obj):
        return f"{self._get_calc(obj)['discount_percent']:.2f}"

    def get_discount_amount(self, obj):
        return f"{self._get_calc(obj)['discount_amount']:.2f}"

    def get_taxable_amount(self, obj):
        return f"{self._get_calc(obj)['taxable_value']:.2f}"

    def get_cgst_amount(self, obj):
        return f"{self._get_calc(obj)['cgst_amount']:.2f}"

    def get_sgst_amount(self, obj):
        return f"{self._get_calc(obj)['sgst_amount']:.2f}"


class SaleDraftSerializer(serializers.ModelSerializer):
    items = SaleDraftItemSerializer(many=True, read_only=True)
    customer = CustomerSerializer(read_only=True)
    customer_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    customer_phone = serializers.CharField(source="customer.phone_number", read_only=True, default=None)
    cashier_name = serializers.CharField(source="cashier.full_name", read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    pharmacist_name = serializers.CharField(source="pharmacist_user.full_name", read_only=True)
    discount_approved_by_name = serializers.CharField(source="discount_approved_by.full_name", read_only=True)
    totals = serializers.SerializerMethodField()

    # Flattened financial properties for direct UI access
    gross_total = serializers.SerializerMethodField()
    final_payable_amount = serializers.SerializerMethodField()
    item_discount_total = serializers.SerializerMethodField()
    bill_discount_percentage = serializers.SerializerMethodField()
    bill_discount_amount = serializers.SerializerMethodField()
    total_discount = serializers.SerializerMethodField()
    taxable_subtotal = serializers.SerializerMethodField()
    cgst_total = serializers.SerializerMethodField()
    sgst_total = serializers.SerializerMethodField()
    round_off_amount = serializers.SerializerMethodField()
    has_prescription_items = serializers.SerializerMethodField()
    is_prescription_verified = serializers.SerializerMethodField()

    class Meta:
        model = SaleDraft
        fields = [
            "id",
            "draft_number",
            "status",
            "store",
            "store_name",
            "cashier",
            "cashier_name",
            "customer",
            "customer_id",
            "customer_name",
            "customer_phone",
            "prescription_number",
            "doctor_name",
            "pharmacist_user",
            "pharmacist_name",
            "pharmacist_verified_at",
            "discount_type",
            "discount_value",
            "discount_reason",
            "discount_status",
            "discount_approved_by",
            "discount_approved_by_name",
            "discount_approved_at",
            "cart_revision",
            "notes",
            "items",
            "totals",
            "gross_total",
            "final_payable_amount",
            "item_discount_total",
            "bill_discount_percentage",
            "bill_discount_amount",
            "total_discount",
            "taxable_subtotal",
            "cgst_total",
            "sgst_total",
            "round_off_amount",
            "has_prescription_items",
            "is_prescription_verified",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "draft_number",
            "status",
            "store",
            "cashier",
            "cart_revision",
            "created_at",
            "updated_at",
        ]

    def _get_calc_totals(self, obj):
        if not hasattr(self, "_calc_cache"):
            self._calc_cache = {}
        if obj.id not in self._calc_cache:
            self._calc_cache[obj.id] = BillingCalculator.calculate_draft_totals(obj)
        return self._calc_cache[obj.id]

    def get_totals(self, obj):
        return self._get_calc_totals(obj)

    def get_gross_total(self, obj):
        return f"{Decimal(str(self._get_calc_totals(obj).get('gross_total', 0))):.2f}"

    def get_final_payable_amount(self, obj):
        return f"{Decimal(str(self._get_calc_totals(obj).get('final_payable', 0))):.2f}"

    def get_item_discount_total(self, obj):
        return f"{Decimal(str(self._get_calc_totals(obj).get('item_discount_total', 0))):.2f}"

    def get_bill_discount_percentage(self, obj):
        val = self._get_calc_totals(obj).get("discount_value", 0) if obj.discount_type == "PERCENTAGE" else 0
        return f"{Decimal(str(val)):.2f}"

    def get_bill_discount_amount(self, obj):
        return f"{Decimal(str(self._get_calc_totals(obj).get('bill_discount_total', 0))):.2f}"

    def get_total_discount(self, obj):
        return f"{Decimal(str(self._get_calc_totals(obj).get('total_discount', 0))):.2f}"

    def get_taxable_subtotal(self, obj):
        return f"{Decimal(str(self._get_calc_totals(obj).get('taxable_amount', 0))):.2f}"

    def get_cgst_total(self, obj):
        return f"{Decimal(str(self._get_calc_totals(obj).get('cgst_amount', 0))):.2f}"

    def get_sgst_total(self, obj):
        return f"{Decimal(str(self._get_calc_totals(obj).get('sgst_amount', 0))):.2f}"

    def get_round_off_amount(self, obj):
        return f"{Decimal(str(self._get_calc_totals(obj).get('rounding_adjustment', 0))):.2f}"

    def get_has_prescription_items(self, obj):
        return bool(self._get_calc_totals(obj).get("requires_prescription", False))

    def get_is_prescription_verified(self, obj):
        return bool(self._get_calc_totals(obj).get("prescription_verified", False))


class DiscountApprovalRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source="requested_by.full_name", read_only=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", read_only=True)
    draft_number = serializers.CharField(source="draft.draft_number", read_only=True)

    class Meta:
        model = DiscountApprovalRequest
        fields = [
            "id",
            "draft",
            "draft_number",
            "requested_by",
            "requested_by_name",
            "cart_revision",
            "discount_type",
            "discount_value",
            "reason",
            "status",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "rejection_reason",
            "created_at",
        ]
        read_only_fields = ["id", "draft", "requested_by", "cart_revision", "status", "created_at"]


class PaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True)
    verified_by_name = serializers.CharField(source="verified_by.full_name", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "checkout_attempt",
            "invoice",
            "payment_method",
            "amount",
            "status",
            "reference_number",
            "cash_tendered",
            "change_due",
            "recorded_by_name",
            "recorded_at",
            "verified_by_name",
            "verified_at",
            "verification_notes",
        ]
        read_only_fields = ["id", "recorded_at", "verified_by_name", "verified_at"]


class CheckoutAttemptSerializer(serializers.ModelSerializer):
    cashier_name = serializers.CharField(source="cashier.full_name", read_only=True)
    customer_name = serializers.CharField(read_only=True)
    customer_phone = serializers.CharField(read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    total_confirmed_payments = serializers.SerializerMethodField()
    remaining_balance = serializers.SerializerMethodField()
    invoice_id = serializers.UUIDField(source="invoice.id", read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)

    class Meta:
        model = CheckoutAttempt
        fields = [
            "id",
            "store",
            "store_name",
            "draft",
            "cart_revision",
            "cashier",
            "cashier_name",
            "customer",
            "customer_name",
            "customer_phone",
            "customer_address",
            "status",
            "payable_amount",
            "total_confirmed_payments",
            "remaining_balance",
            "idempotency_key",
            "financial_snapshot",
            "batch_allocations_snapshot",
            "payments",
            "invoice",
            "invoice_id",
            "invoice_number",
            "failure_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_total_confirmed_payments(self, obj):
        return sum(p.amount for p in obj.payments.filter(status="CONFIRMED"))

    def get_remaining_balance(self, obj):
        confirmed = self.get_total_confirmed_payments(obj)
        return max(Decimal("0.00"), obj.payable_amount - confirmed)


class InvoiceItemBatchAllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItemBatchAllocation
        fields = [
            "id",
            "batch_number",
            "expiry_date",
            "quantity_base_units",
            "unit_cost",
            "total_cost",
        ]


class InvoiceItemSerializer(serializers.ModelSerializer):
    batch_allocations = InvoiceItemBatchAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = InvoiceItem
        fields = [
            "id",
            "product_name",
            "brand_name",
            "generic_name",
            "strength",
            "dosage_form",
            "sku",
            "barcode",
            "hsn_code",
            "base_unit",
            "sale_unit",
            "conversion_factor",
            "pack_description",
            "prescription_class",
            "is_prescription_required",
            "unit_type",
            "quantity",
            "total_base_units",
            "mrp",
            "unit_price",
            "discount_percent",
            "discount_amount",
            "tax_rate",
            "taxable_value",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "line_total",
            "batch_allocations",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    cashier_name = serializers.CharField(source="cashier.full_name", read_only=True)
    pharmacist_name = serializers.CharField(source="pharmacist_user.full_name", read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)
    store_address = serializers.CharField(source="store.address", read_only=True)
    store_phone = serializers.CharField(source="store.phone", read_only=True)
    store_email = serializers.CharField(source="store.email", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "invoice_number",
            "status",
            "payment_status",
            "store_name",
            "store_code",
            "store_address",
            "store_phone",
            "store_email",
            "organization_name",
            "organization_logo_url",
            "cashier_name",
            "customer_name",
            "customer_phone",
            "customer_address",
            "gross_total",
            "discount_total",
            "taxable_amount",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "total_tax",
            "rounding_adjustment",
            "net_total",
            "paid_amount",
            "change_returned",
            "prescription_number",
            "doctor_name",
            "pharmacist_name",
            "pharmacist_authorized_at",
            "discount_reason",
            "invoice_date",
            "items",
            "payments",
            "created_at",
        ]

    def get_organization_logo_url(self, obj):
        if obj.organization and obj.organization.logo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.organization.logo.url)
            return obj.organization.logo.url
        return None

