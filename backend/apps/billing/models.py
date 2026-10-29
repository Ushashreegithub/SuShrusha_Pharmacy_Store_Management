import uuid
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils import timezone


class Customer(models.Model):
    """
    Retail pharmacy customer scoped to an Organization.
    Stores minimal contact details for statutory billing, prescription linking, and invoice issuance.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="customers",
        help_text="Owning pharmacy organization (tenant root)."
    )
    name = models.CharField(max_length=255, db_index=True)
    phone_number = models.CharField(max_length=30, db_index=True)
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    doctor_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Primary consulting doctor or clinic name if provided."
    )
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_customers"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "phone_number"], name="idx_cust_org_phone"),
            models.Index(fields=["organization", "name"], name="idx_cust_org_name"),
        ]

    def __str__(self):
        return f"{self.name} ({self.phone_number})"


class SaleDraft(models.Model):
    """
    Working POS cart/draft session for a cashier at a store counter.
    Supports holding and resuming bills without mutating inventory or posting financial records.
    """
    STATUS_CHOICES = [
        ("DRAFT", "Active Draft"),
        ("HELD", "Parked / Held Bill"),
        ("CHECKOUT", "Checkout In Progress"),
        ("CONVERTED", "Converted to Invoice"),
        ("CANCELLED", "Cancelled / Discarded"),
    ]

    DISCOUNT_TYPE_CHOICES = [
        ("NONE", "No Discount"),
        ("PERCENTAGE", "Percentage (%)"),
        ("FIXED", "Fixed Amount (₹)"),
    ]

    DISCOUNT_STATUS_CHOICES = [
        ("NONE", "None"),
        ("REQUESTED", "Approval Requested"),
        ("APPROVED", "Manager Approved"),
        ("REJECTED", "Manager Rejected"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="sale_drafts"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        related_name="sale_drafts"
    )
    draft_number = models.CharField(max_length=50, db_index=True)
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cashier_drafts"
    )
    customer = models.ForeignKey(
        Customer,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="drafts"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="DRAFT", db_index=True)

    # Prescription & Doctor Details
    prescription_number = models.CharField(max_length=100, blank=True, default="")
    doctor_name = models.CharField(max_length=255, blank=True, default="")
    pharmacist_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="authorized_drafts"
    )
    pharmacist_verified_at = models.DateTimeField(null=True, blank=True)

    # Manual Discount & Manager Approval
    discount_type = models.CharField(max_length=20, choices=DISCOUNT_TYPE_CHOICES, default="NONE")
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    discount_reason = models.TextField(blank=True, default="")
    discount_status = models.CharField(max_length=20, choices=DISCOUNT_STATUS_CHOICES, default="NONE")
    discount_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_draft_discounts"
    )
    discount_approved_at = models.DateTimeField(null=True, blank=True)

    # Revision counter: Invalidate approvals if cart items/quantities mutate
    cart_revision = models.PositiveIntegerField(default=1)

    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_sale_drafts"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.draft_number} ({self.get_status_display()}) - {self.store.name}"


class SaleDraftItem(models.Model):
    """
    Line item inside an active or held cashier draft.
    """
    UNIT_TYPE_CHOICES = [
        ("SALE_UNIT", "Sale Unit / Pack"),
        ("BASE_UNIT", "Base Unit / Loose"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    draft = models.ForeignKey(
        SaleDraft,
        on_delete=models.CASCADE,
        related_name="items"
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="+"
    )
    unit_type = models.CharField(max_length=20, choices=UNIT_TYPE_CHOICES, default="SALE_UNIT")
    quantity = models.PositiveIntegerField(default=1)
    conversion_factor = models.PositiveIntegerField(default=1)
    total_base_units = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Price per chosen unit_type."
    )
    mrp = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Outer packaging MRP."
    )
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("12.00"))
    selected_batch = models.ForeignKey(
        "inventory.Batch",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "billing_sale_draft_items"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.product.name} x {self.quantity} ({self.unit_type})"


class DiscountApprovalRequest(models.Model):
    """
    Audit-logged discount authorization workflow.
    Cashiers request a manual discount; an assigned Store Manager or Owner reviews it.
    """
    STATUS_CHOICES = [
        ("PENDING", "Pending Manager Review"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("EXPIRED", "Expired / Invalidated"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    draft = models.ForeignKey(
        SaleDraft,
        on_delete=models.CASCADE,
        related_name="discount_requests"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="my_discount_requests"
    )
    cart_revision = models.PositiveIntegerField()
    discount_type = models.CharField(
        max_length=20,
        choices=SaleDraft.DISCOUNT_TYPE_CHOICES
    )
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING", db_index=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_discount_requests"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "billing_discount_approval_requests"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Discount Request {self.id}: {self.discount_value} ({self.status})"


class CheckoutAttempt(models.Model):
    """
    Durable checkout session tracking payment collection, external manual verification,
    and two-phase transactional finalization.
    Prevents duplicate submissions, cart modification during payment, and untracked external claims.
    """
    STATUS_CHOICES = [
        ("PENDING_PAYMENT", "Pending Payment Collection"),
        ("PAYMENT_PENDING_VERIFICATION", "Payment Pending Verification"),
        ("READY_TO_FINALIZE", "Ready to Finalize Invoice"),
        ("FINALIZING", "Finalizing & Posting Stock"),
        ("COMPLETED", "Completed & Invoiced"),
        ("FAILED", "Failed"),
        ("CANCELLED", "Cancelled"),
        ("EXPIRED", "Expired / Timed Out"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="checkout_attempts"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        related_name="checkout_attempts"
    )
    draft = models.ForeignKey(
        SaleDraft,
        on_delete=models.PROTECT,
        related_name="checkout_attempts"
    )
    cart_revision = models.PositiveIntegerField(
        help_text="Immutable cart revision frozen at checkout initiation."
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="checkout_attempts"
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="checkout_attempts"
    )

    # Snapshots
    customer_name = models.CharField(max_length=255)
    customer_phone = models.CharField(max_length=30)
    customer_address = models.TextField(blank=True, default="")

    status = models.CharField(max_length=35, choices=STATUS_CHOICES, default="PENDING_PAYMENT", db_index=True)
    payable_amount = models.DecimalField(max_digits=12, decimal_places=2)
    idempotency_key = models.CharField(max_length=128, db_index=True)
    financial_snapshot = models.JSONField(default=dict, help_text="Authoritative pricing, tax, and discount calculation snapshot.")
    batch_allocations_snapshot = models.JSONField(default=list, help_text="Pre-evaluated FEFO allocation breakdown.")

    invoice = models.OneToOneField(
        "Invoice",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="checkout_attempt"
    )
    failure_reason = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_checkout_attempts"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "store", "-created_at"], name="idx_chk_org_store_created"),
            models.Index(fields=["draft", "status"], name="idx_chk_draft_status"),
        ]

    def __str__(self):
        return f"CheckoutAttempt {self.id} [{self.get_status_display()}] - ₹{self.payable_amount}"


class Invoice(models.Model):
    """
    Immutable financial record of a completed retail pharmacy sale.
    Preserves historical product master attributes, customer snapshot, and exact tax breakdown.
    """
    STATUS_CHOICES = [
        ("ISSUED", "Issued / Paid"),
        ("CANCELLED", "Cancelled"),
    ]

    PAYMENT_STATUS_CHOICES = [
        ("PENDING", "Pending Payment"),
        ("PARTIALLY_PAID", "Partially Paid"),
        ("PAID", "Fully Paid"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="invoices"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.PROTECT,
        related_name="invoices"
    )
    invoice_number = models.CharField(max_length=60, unique=True, db_index=True)
    draft = models.ForeignKey(
        SaleDraft,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="invoices"
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="issued_invoices"
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="invoices"
    )

    # Customer Snapshot (Preserved even if customer profile changes later)
    customer_name = models.CharField(max_length=255)
    customer_phone = models.CharField(max_length=30)
    customer_address = models.TextField(blank=True, default="")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ISSUED", db_index=True)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default="PAID", db_index=True)

    # Financial Totals (Decimal safe)
    gross_total = models.DecimalField(max_digits=12, decimal_places=2, help_text="Total value before discounts.")
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2, help_text="Net base price subject to GST.")
    cgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    sgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    igst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total_tax = models.DecimalField(max_digits=12, decimal_places=2)
    rounding_adjustment = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0.00"))
    net_total = models.DecimalField(max_digits=12, decimal_places=2, help_text="Final payable amount.")
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    change_returned = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    # Medical & Prescription Snapshot
    prescription_number = models.CharField(max_length=100, blank=True, default="")
    doctor_name = models.CharField(max_length=255, blank=True, default="")
    pharmacist_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+"
    )
    pharmacist_authorized_at = models.DateTimeField(null=True, blank=True)

    # Approved Discount Snapshot
    discount_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+"
    )
    discount_reason = models.TextField(blank=True, default="")

    idempotency_key = models.CharField(max_length=128, db_index=True)
    invoice_date = models.DateTimeField(default=timezone.now, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_invoices"
        ordering = ["-invoice_date"]
        indexes = [
            models.Index(fields=["organization", "store", "-invoice_date"], name="idx_inv_org_store_date"),
        ]

    def __str__(self):
        return f"{self.invoice_number} (₹{self.net_total}) - {self.customer_name}"


class InvoiceItem(models.Model):
    """
    Immutable line item snapshot of a completed invoice.
    Stores historical catalog and packaging attributes so future edits never alter old invoices.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="items"
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="+"
    )

    # Product Master Snapshot
    product_name = models.CharField(max_length=255)
    brand_name = models.CharField(max_length=255, blank=True, default="")
    generic_name = models.CharField(max_length=255, blank=True, default="")
    strength = models.CharField(max_length=100, blank=True, default="")
    dosage_form = models.CharField(max_length=40, blank=True, default="")
    sku = models.CharField(max_length=100)
    barcode = models.CharField(max_length=100, blank=True, default="")
    hsn_code = models.CharField(max_length=50, blank=True, default="")
    base_unit = models.CharField(max_length=30)
    sale_unit = models.CharField(max_length=30)
    conversion_factor = models.PositiveIntegerField(default=1)
    pack_description = models.CharField(max_length=255, blank=True, default="")
    prescription_class = models.CharField(max_length=40, default="otc")
    is_prescription_required = models.BooleanField(default=False)

    # Quantity & Dispensing Mode
    unit_type = models.CharField(max_length=20, choices=SaleDraftItem.UNIT_TYPE_CHOICES)
    quantity = models.PositiveIntegerField()
    total_base_units = models.PositiveIntegerField()

    # Financial breakdown
    mrp = models.DecimalField(max_digits=12, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2)
    taxable_value = models.DecimalField(max_digits=12, decimal_places=2)
    cgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    sgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    igst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    line_total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "billing_invoice_items"
        ordering = ["id"]

    def __str__(self):
        return f"{self.product_name} ({self.quantity} {self.unit_type})"


class InvoiceItemBatchAllocation(models.Model):
    """
    Exact physical batch allocation and inventory movement linkage for an invoice item line.
    Connects the sale line item directly to StockMovement and BatchInwardCostLayer.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_item = models.ForeignKey(
        InvoiceItem,
        on_delete=models.CASCADE,
        related_name="batch_allocations"
    )
    batch = models.ForeignKey(
        "inventory.Batch",
        on_delete=models.PROTECT,
        related_name="sale_allocations"
    )
    batch_number = models.CharField(max_length=100)
    expiry_date = models.DateField()
    quantity_base_units = models.PositiveIntegerField()
    stock_movement = models.ForeignKey(
        "inventory.StockMovement",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+"
    )
    cost_layer = models.ForeignKey(
        "inventory.BatchInwardCostLayer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+"
    )
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("0.0000"))
    total_cost = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        db_table = "billing_invoice_item_batch_allocations"
        ordering = ["id"]

    def __str__(self):
        return f"{self.batch_number}: {self.quantity_base_units} units @ {self.unit_cost}"


class Payment(models.Model):
    """
    Payment receipt recording cash, UPI, card, or split payment transactions.
    Supports two-phase checkout collection, manager verification for UPI/card, and invoice linking.
    """
    METHOD_CHOICES = [
        ("CASH", "Cash"),
        ("UPI", "UPI / QR Code"),
        ("CARD", "Debit / Credit Card"),
    ]

    STATUS_CHOICES = [
        ("PENDING", "Pending Collection"),
        ("REQUIRES_VERIFICATION", "Requires Manager Verification"),
        ("CONFIRMED", "Confirmed / Collected"),
        ("FAILED", "Failed"),
        ("CANCELLED", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    checkout_attempt = models.ForeignKey(
        CheckoutAttempt,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="payments"
    )
    invoice = models.ForeignKey(
        Invoice,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="payments"
    )
    payment_method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="CONFIRMED")
    reference_number = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="UPI transaction reference / UTR or Card auth code."
    )
    cash_tendered = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    change_due = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+"
    )
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)

    # Manual verification fields for external payments (UPI / Card)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+"
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "billing_payments"
        ordering = ["recorded_at"]

    def __str__(self):
        return f"{self.get_payment_method_display()}: ₹{self.amount} ({self.status})"
