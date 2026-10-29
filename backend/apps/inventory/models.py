import uuid
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from apps.products.models import Product


class ProductPackagingSnapshot(models.Model):
    """
    Immutable versioned snapshot of a Product's packaging configuration.
    Preserves the exact conversion factor, base unit, and sale unit at the time of intake,
    ensuring historical inventory counts and calculations remain accurate even if
    the catalog Product definition is edited later.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.CASCADE,
        related_name="packaging_snapshots",
        help_text="Product to which this packaging snapshot belongs."
    )
    version = models.PositiveIntegerField(
        default=1,
        help_text="Incremental version number for packaging changes."
    )
    base_unit = models.CharField(
        max_length=30,
        choices=Product.UNIT_CHOICES,
        help_text="Smallest atomic inventory unit (e.g. tablet, capsule, ml)."
    )
    sale_unit = models.CharField(
        max_length=30,
        choices=Product.UNIT_CHOICES,
        help_text="Standard dispensing/sale packaging unit (e.g. strip, bottle, box)."
    )
    conversion_factor = models.PositiveIntegerField(
        help_text="Number of base units in one sale unit (must be >= 1)."
    )
    is_loose_dispensing_allowed = models.BooleanField(
        default=True,
        help_text="Whether loose base units from this packaging can be dispensed."
    )
    pack_description = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Human-readable pack description (e.g. 'Strip of 10 Tablets')."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "inventory_packaging_snapshots"
        ordering = ["product", "-version"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "version"],
                name="unique_product_packaging_version"
            ),
            models.CheckConstraint(
                condition=models.Q(conversion_factor__gte=1),
                name="chk_packaging_conversion_factor_positive"
            ),
        ]

    def __str__(self):
        return f"{self.product.name} (v{self.version}: 1 {self.sale_unit} = {self.conversion_factor} {self.base_unit})"

    def clean(self):
        super().clean()
        if self.conversion_factor is not None and self.conversion_factor < 1:
            raise ValidationError({"conversion_factor": "Conversion factor must be an integer >= 1."})

    def save(self, *args, **kwargs):
        # Enforce immutability: once persisted, disallow updates to packaging attributes
        if self.pk and not kwargs.get("force_insert", False):
            orig = ProductPackagingSnapshot.objects.filter(pk=self.pk).first()
            if orig:
                if (
                    orig.product_id != self.product_id or
                    orig.base_unit != self.base_unit or
                    orig.sale_unit != self.sale_unit or
                    orig.conversion_factor != self.conversion_factor or
                    orig.is_loose_dispensing_allowed != self.is_loose_dispensing_allowed or
                    orig.pack_description != self.pack_description
                ):
                    raise ValidationError("Product packaging snapshots are immutable. Create a new version instead.")
        if self.conversion_factor is None or self.conversion_factor < 1:
            self.conversion_factor = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_or_create_current_snapshot(cls, product):
        """
        Retrieves the latest snapshot matching the product's current packaging attributes,
        or creates a new incremental version if attributes have changed.
        """
        latest = cls.objects.filter(product=product).order_by("-version").first()
        if latest:
            if (
                latest.base_unit == product.base_unit and
                latest.sale_unit == product.sale_unit and
                latest.conversion_factor == product.conversion_factor and
                latest.is_loose_dispensing_allowed == product.is_loose_dispensing_allowed and
                latest.pack_description == product.pack_description
            ):
                return latest, False
            new_version = latest.version + 1
        else:
            new_version = 1

        snapshot = cls.objects.create(
            product=product,
            version=new_version,
            base_unit=product.base_unit,
            sale_unit=product.sale_unit,
            conversion_factor=product.conversion_factor,
            is_loose_dispensing_allowed=product.is_loose_dispensing_allowed,
            pack_description=product.pack_description,
        )
        return snapshot, True


class Batch(models.Model):
    """
    Physical manufacturer lot identity scoped to an Organization and Product.
    Represents the physical lot manufactured by a pharmaceutical company.
    """
    STATUS_CHOICES = [
        ("active", "Active / Saleable"),
        ("quarantined", "Quarantined / Hold"),
        ("recalled", "Manufacturer Recalled"),
        ("expired", "Expired"),
        ("exhausted", "Exhausted (Zero Stock)"),
    ]

    INTAKE_STATUS_CHOICES = [
        ("verified", "Verified"),
        ("quarantine_review", "Pending Quarantine Review"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="batches",
        help_text="Owning pharmacy organization (tenant boundary)."
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="batches",
        help_text="Catalog product reference."
    )
    packaging_snapshot = models.ForeignKey(
        ProductPackagingSnapshot,
        on_delete=models.PROTECT,
        related_name="batches",
        help_text="Packaging configuration version under which this lot was received."
    )
    batch_number = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Manufacturer batch / lot number (e.g. 'CIP-9024')."
    )
    manufacturer_name = models.CharField(
        max_length=255,
        blank=True,
        default="UNKNOWN_UNSPECIFIED",
        db_index=True,
        help_text="Manufacturer name as stated on packaging."
    )
    manufacturing_date = models.DateField(
        null=True,
        blank=True,
        help_text="Manufacturing date if stated on pack."
    )
    expiry_date = models.DateField(
        db_index=True,
        help_text="Expiry date (standardized to last calendar day of expiry month/year)."
    )
    mrp = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Statutory Maximum Retail Price per Sale Unit printed on outer packaging."
    )
    unit_mrp = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Derived MRP per atomic base unit (mrp / conversion_factor)."
    )
    is_recalled = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Global recall flag halting sales across all stores immediately."
    )
    recall_reason = models.TextField(blank=True, default="")
    recalled_at = models.DateTimeField(null=True, blank=True)
    recalled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+"
    )
    intake_status = models.CharField(
        max_length=30,
        choices=INTAKE_STATUS_CHOICES,
        default="verified",
        db_index=True
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="active",
        db_index=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_batches"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_batches"
        ordering = ["expiry_date", "batch_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "product", "batch_number", "expiry_date", "packaging_snapshot"],
                name="unique_org_product_batch_lot"
            ),
            models.CheckConstraint(
                condition=models.Q(mrp__gte=Decimal("0.00")),
                name="chk_batch_mrp_nonnegative"
            ),
            models.CheckConstraint(
                condition=models.Q(unit_mrp__gte=Decimal("0.0000")),
                name="chk_batch_unit_mrp_nonnegative"
            ),
        ]

    def __str__(self):
        return f"{self.product.name} - Lot {self.batch_number} (Exp: {self.expiry_date})"

    def clean(self):
        super().clean()
        if self.batch_number:
            self.batch_number = self.batch_number.strip().upper()
        if not self.manufacturer_name:
            self.manufacturer_name = "UNKNOWN_UNSPECIFIED"

        # Validate organization consistency
        if self.product_id and self.organization_id:
            if self.product.organization_id != self.organization_id:
                raise ValidationError({"product": "Product does not belong to the batch's organization."})

        # Validate snapshot consistency
        if self.packaging_snapshot_id and self.product_id:
            if self.packaging_snapshot.product_id != self.product_id:
                raise ValidationError({"packaging_snapshot": "Packaging snapshot does not belong to the specified product."})

        # Calculate unit_mrp
        if self.mrp is not None and self.packaging_snapshot_id:
            factor = self.packaging_snapshot.conversion_factor or 1
            self.unit_mrp = (self.mrp / Decimal(factor)).quantize(Decimal("0.0001"))

    def get_expiry_status(self, warning_days=90, critical_days=30, today=None):
        """
        Dynamically evaluates expiry status without requiring manual database cron updates.
        Returns tuple: (status_code, days_until_expiry)
        status_code in ['EXPIRED', 'CRITICAL_NEAR_EXPIRY', 'WARNING_NEAR_EXPIRY', 'SAFE']
        """
        if today is None:
            today = timezone.localdate()
        days_until_expiry = (self.expiry_date - today).days
        if days_until_expiry <= 0:
            return "EXPIRED", days_until_expiry
        if days_until_expiry <= critical_days:
            return "CRITICAL_NEAR_EXPIRY", days_until_expiry
        if days_until_expiry <= warning_days:
            return "WARNING_NEAR_EXPIRY", days_until_expiry
        return "SAFE", days_until_expiry

    @property
    def is_expired(self):
        """True if batch expiry date is on or before today's local date."""
        return self.expiry_date <= timezone.localdate()

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class BatchInwardCostLayer(models.Model):
    """
    Financial cost provenance layer for inward inventory tranches.
    Preserves exact purchase invoice costs across tranches of the same batch.
    """
    RECEIPT_TYPE_CHOICES = [
        ("OPENING_STOCK", "Opening Stock Initialization"),
        ("PURCHASE_GRN", "Goods Receipt Note (GRN)"),
        ("TRANSFER_IN", "Store Transfer Inward"),
        ("ADJUSTMENT_ADD", "Inventory Count Adjustment (Increase)"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="inventory_cost_layers"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.PROTECT,
        related_name="inventory_cost_layers"
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        related_name="cost_layers"
    )
    receipt_type = models.CharField(
        max_length=40,
        choices=RECEIPT_TYPE_CHOICES,
        db_index=True
    )
    receipt_reference = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Supplier invoice number, GRN number, or opening entry ID."
    )
    original_quantity = models.BigIntegerField(
        help_text="Original inward quantity received in atomic base units."
    )
    remaining_quantity = models.BigIntegerField(
        help_text="Unexhausted quantity in base units available for future depletion."
    )
    purchase_cost_per_sale_unit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Net purchase invoice cost per sale unit."
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Landed unit cost per atomic base unit."
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "inventory_cost_layers"
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(original_quantity__gt=0),
                name="chk_cost_layer_orig_qty_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(remaining_quantity__gte=0),
                name="chk_cost_layer_rem_qty_nonnegative"
            ),
            models.CheckConstraint(
                condition=models.Q(remaining_quantity__lte=models.F("original_quantity")),
                name="chk_cost_layer_rem_lte_orig"
            ),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gte=Decimal("0.0000")),
                name="chk_cost_layer_unit_cost_nonnegative"
            ),
        ]

    def __str__(self):
        return f"{self.batch.batch_number} @ {self.store.name} [{self.receipt_type}: {self.remaining_quantity}/{self.original_quantity} units]"

    def clean(self):
        super().clean()
        if self.store_id and self.organization_id:
            if self.store.organization_id != self.organization_id:
                raise ValidationError({"store": "Store does not belong to the organization."})
        if self.batch_id and self.organization_id:
            if self.batch.organization_id != self.organization_id:
                raise ValidationError({"batch": "Batch does not belong to the organization."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class StoreBatchStock(models.Model):
    """
    Physical on-hand and local store quarantine balances for a batch inside a store.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="store_stocks"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        related_name="batch_stocks"
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="store_stocks"
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        related_name="store_stocks"
    )
    quantity_on_hand = models.BigIntegerField(
        default=0,
        help_text="Physical count on premises in atomic base units."
    )
    quantity_quarantined = models.BigIntegerField(
        default=0,
        help_text="Physical count held locally from sale (breakage, inspection)."
    )
    low_stock_threshold = models.PositiveIntegerField(
        default=10,
        help_text="Alert threshold in atomic base units."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_store_batch_stocks"
        ordering = ["product", "batch"]
        constraints = [
            models.UniqueConstraint(
                fields=["store", "batch"],
                name="unique_store_batch_inventory"
            ),
            models.CheckConstraint(
                condition=models.Q(quantity_on_hand__gte=0),
                name="chk_stock_on_hand_nonnegative"
            ),
            models.CheckConstraint(
                condition=models.Q(quantity_quarantined__gte=0),
                name="chk_stock_quarantined_nonnegative"
            ),
            models.CheckConstraint(
                condition=models.Q(quantity_on_hand__gte=models.F("quantity_quarantined")),
                name="chk_quarantine_lte_on_hand"
            ),
        ]

    def __str__(self):
        return f"{self.store.name} - {self.batch.product.name} (Lot: {self.batch.batch_number}): {self.quantity_on_hand} on-hand"

    @property
    def available_quantity(self):
        """
        Quantity legally and physically available for sale or transfer.
        Returns 0 if batch is recalled or expired.
        """
        if self.batch.is_recalled:
            return 0
        if self.batch.expiry_date <= timezone.localdate():
            return 0
        return max(0, self.quantity_on_hand - self.quantity_quarantined)

    def clean(self):
        super().clean()
        if self.store_id and self.organization_id:
            if self.store.organization_id != self.organization_id:
                raise ValidationError({"store": "Store does not belong to the organization."})
        if self.batch_id and self.organization_id:
            if self.batch.organization_id != self.organization_id:
                raise ValidationError({"batch": "Batch does not belong to the organization."})
        if self.batch_id and self.product_id:
            if self.batch.product_id != self.product_id:
                raise ValidationError({"product": "Product does not match the batch's product."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class StockMovement(models.Model):
    """
    Append-only inventory movement ledger recording every physical balance or quarantine alteration.
    Protected against direct UPDATE and DELETE.
    """
    MOVEMENT_TYPES = [
        ("OPENING_STOCK", "Opening Stock Initialization"),
        ("PURCHASE_RECEIPT", "Purchase Goods Receipt (GRN)"),
        ("SALE", "Customer Dispensing / POS Sale"),
        ("SALE_RETURN", "Customer Sale Return"),
        ("TRANSFER_DISPATCH", "Store Transfer Outward Dispatch"),
        ("TRANSFER_IN", "Store Transfer Inward Receipt"),
        ("TRANSFER_RETURN", "Store Transfer Return Receipt"),
        ("TRANSIT_RECOVERY", "In-Transit Shortage Recovery Receipt"),
        ("QUARANTINE_HOLD", "Moved to Quarantine (Availability Hold)"),
        ("QUARANTINE_RELEASE", "Released from Quarantine to Active"),
        ("DAMAGE_WRITEOFF", "Damaged / Broken Stock Write-off"),
        ("EXPIRY_WRITEOFF", "Expired Stock Disposal Write-off"),
        ("TRANSIT_LOSS", "In-Transit Loss / Shortage Write-off"),
        ("ADJUSTMENT_ADD", "Inventory Count Adjustment (Increase)"),
        ("ADJUSTMENT_SUB", "Inventory Count Adjustment (Decrease)"),
        ("SUPPLIER_RETURN", "Return to Vendor / Supplier"),
    ]

    DIRECTION_CHOICES = [
        ("IN", "Physical Inward (+)"),
        ("OUT", "Physical Outward (-)"),
        ("HOLD", "Neutral / Availability Status Change"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="stock_movements"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        related_name="stock_movements"
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        related_name="stock_movements"
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="stock_movements"
    )
    movement_type = models.CharField(
        max_length=40,
        choices=MOVEMENT_TYPES,
        db_index=True
    )
    direction = models.CharField(
        max_length=10,
        choices=DIRECTION_CHOICES
    )
    quantity = models.BigIntegerField(
        help_text="Strictly positive quantity altered in atomic base units."
    )
    balance_before = models.BigIntegerField(
        help_text="On-hand physical balance immediately prior to movement."
    )
    balance_after = models.BigIntegerField(
        help_text="On-hand physical balance immediately after movement."
    )
    quarantine_before = models.BigIntegerField(default=0)
    quarantine_after = models.BigIntegerField(default=0)
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0.0000")
    )
    unit_mrp = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0.0000")
    )
    total_cost_value = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )
    reference_type = models.CharField(max_length=50, blank=True, default="")
    reference_id = models.CharField(max_length=100, db_index=True, blank=True, default="")
    reverses_movement = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reversals"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_movements"
    )
    reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "inventory_stock_movements"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name="chk_movement_quantity_strictly_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(balance_before__gte=0),
                name="chk_movement_balance_before_nonnegative"
            ),
            models.CheckConstraint(
                condition=models.Q(balance_after__gte=0),
                name="chk_movement_balance_after_nonnegative"
            ),
        ]

    def __str__(self):
        return f"[{self.created_at:%Y-%m-%d %H:%M}] {self.movement_type} ({self.direction}): {self.quantity} units of {self.batch.batch_number} at {self.store.name}"

    def clean(self):
        super().clean()
        if self.quantity is not None and self.quantity <= 0:
            raise ValidationError({"quantity": "Quantity must be strictly positive."})
        if self.store_id and self.organization_id:
            if self.store.organization_id != self.organization_id:
                raise ValidationError({"store": "Store does not belong to the organization."})
        if self.batch_id and self.organization_id:
            if self.batch.organization_id != self.organization_id:
                raise ValidationError({"batch": "Batch does not belong to the organization."})
        if self.batch_id and self.product_id:
            if self.batch.product_id != self.product_id:
                raise ValidationError({"product": "Product does not match the batch's product."})

    def save(self, *args, **kwargs):
        self.clean()
        # Enforce append-only ledger: once persisted, disallow modification
        if self.pk and not kwargs.get("force_insert", False):
            if StockMovement.objects.filter(pk=self.pk).exists():
                raise ValidationError("StockMovement rows are strictly append-only. Modification is prohibited.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("StockMovement rows are strictly append-only. Deletion is prohibited.")


class InventoryOperation(models.Model):
    """
    Dedicated idempotency claim and coordination record.
    Tracks tenant-scoped mutation operations, payload hashes, execution statuses, and response payloads.
    """
    STATUS_CHOICES = [
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    idempotency_key = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="inventory_operations"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        related_name="inventory_operations"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="inventory_operations"
    )
    operation_type = models.CharField(max_length=50, db_index=True)
    payload_hash = models.CharField(max_length=64, help_text="SHA-256 hex digest of canonical JSON payload")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="in_progress", db_index=True)
    response_code = models.IntegerField(null=True, blank=True)
    response_data = models.JSONField(null=True, blank=True)
    error_message = models.TextField(blank=True, default="")
    claimed_at = models.DateTimeField(auto_now_add=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "inventory_operations"
        ordering = ["-claimed_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "idempotency_key"],
                name="unique_org_idempotency_key"
            )
        ]

    def __str__(self):
        return f"Op {self.operation_type} [{self.idempotency_key}] ({self.status}) for {self.store.name}"


class Supplier(models.Model):
    """
    Licensed pharmaceutical distributor, wholesaler, or manufacturer.
    Scoped strictly to an Organization (tenant boundary).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="suppliers",
        help_text="Tenant organization owning this supplier relationship."
    )
    name = models.CharField(max_length=255, db_index=True)
    supplier_code = models.CharField(max_length=50, blank=True, default="", db_index=True)
    contact_person = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=30, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    postal_code = models.CharField(max_length=20, blank=True, default="")
    gstin = models.CharField(
        max_length=15,
        blank=True,
        default="",
        help_text="15-character Goods and Services Tax Identification Number."
    )
    drug_license_number = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Wholesale Drug License Number (e.g. Form 20B/21B)."
    )
    payment_terms_days = models.PositiveIntegerField(
        default=30,
        help_text="Standard credit payment window in days."
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Soft-deactivation toggle. Deactivated suppliers cannot supply new inward goods."
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_suppliers"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_suppliers"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"],
                name="unique_org_supplier_name"
            ),
            models.UniqueConstraint(
                fields=["organization", "supplier_code"],
                condition=~models.Q(supplier_code=""),
                name="unique_org_supplier_code"
            ),
            models.UniqueConstraint(
                fields=["organization", "gstin"],
                condition=~models.Q(gstin=""),
                name="unique_org_supplier_gstin"
            ),
        ]

    def __str__(self):
        code_str = f" [{self.supplier_code}]" if self.supplier_code else ""
        return f"{self.name}{code_str} ({self.organization.name})"

    def clean(self):
        super().clean()
        if self.name:
            self.name = self.name.strip()
        if self.supplier_code:
            self.supplier_code = self.supplier_code.strip().upper()
        if self.gstin:
            self.gstin = self.gstin.strip().upper()
            if len(self.gstin) != 15:
                raise ValidationError({"gstin": "GSTIN must be exactly 15 alphanumeric characters."})


class GoodsReceipt(models.Model):
    """
    Header representing a Purchase Inward / Goods Receipt Note (GRN) received at a specific store branch.
    Follows a controlled DRAFT -> SUBMITTED -> POSTED lifecycle.
    """
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted / Pending Review"),
        ("POSTED", "Posted to Inventory"),
        ("CANCELLED", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="goods_receipts"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        related_name="goods_receipts"
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="goods_receipts"
    )
    grn_number = models.CharField(
        max_length=50,
        db_index=True,
        help_text="System-generated unique receipt number (e.g. GRN-20261026-0001)."
    )
    supplier_invoice_number = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Vendor-printed invoice or delivery challan reference."
    )
    supplier_invoice_date = models.DateField(
        help_text="Date printed on the vendor invoice."
    )
    receipt_date = models.DateField(
        default=timezone.localdate,
        help_text="Physical goods arrival and inspection date at store premises."
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="DRAFT",
        db_index=True
    )
    total_taxable_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )
    total_tax_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )
    total_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )
    notes = models.TextField(blank=True, default="")
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="received_goods_receipts"
    )
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_goods_receipts"
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_goods_receipts"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "grn_number"],
                name="unique_org_grn_number"
            ),
            models.UniqueConstraint(
                fields=["organization", "supplier", "supplier_invoice_number"],
                condition=models.Q(status__in=["SUBMITTED", "POSTED"]),
                name="unique_org_supplier_invoice_active"
            ),
        ]

    def __str__(self):
        return f"{self.grn_number} [{self.status}] from {self.supplier.name} at {self.store.name}"

    def clean(self):
        super().clean()
        if self.supplier_id and self.organization_id:
            if self.supplier.organization_id != self.organization_id:
                raise ValidationError({"supplier": "Supplier does not belong to the receipt's organization."})
        if self.store_id and self.organization_id:
            if self.store.organization_id != self.organization_id:
                raise ValidationError({"store": "Store does not belong to the receipt's organization."})
        if self.supplier_invoice_number:
            self.supplier_invoice_number = self.supplier_invoice_number.strip()


class GoodsReceiptItem(models.Model):
    """
    Line item for a received batch/product inside a GoodsReceipt.
    Captures quantities in intact sale packs and loose base units, packaging conversion,
    purchase rates, MRP, and quarantine status.
    """
    INTAKE_STATUS_CHOICES = [
        ("VERIFIED", "Verified Active Stock"),
        ("QUARANTINE_REVIEW", "Quarantined for Inspection"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    goods_receipt = models.ForeignKey(
        GoodsReceipt,
        on_delete=models.CASCADE,
        related_name="items"
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="goods_receipt_items"
    )
    packaging_snapshot = models.ForeignKey(
        ProductPackagingSnapshot,
        on_delete=models.PROTECT,
        related_name="goods_receipt_items"
    )
    batch_number = models.CharField(max_length=100)
    expiry_date = models.DateField()
    manufacturing_date = models.DateField(null=True, blank=True)
    quantity_sale_units = models.PositiveIntegerField(default=0)
    quantity_loose_base_units = models.PositiveIntegerField(default=0)
    total_base_units = models.BigIntegerField(
        help_text="Calculated atomic base units: (quantity_sale_units * conversion_factor) + quantity_loose_base_units."
    )
    purchase_cost_per_sale_unit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Net invoice cost per sale unit."
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="Landed unit cost per atomic base unit."
    )
    mrp = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Maximum Retail Price per sale unit."
    )
    unit_mrp = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text="MRP per atomic base unit."
    )
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Applicable GST percentage (e.g. 5.00, 12.00, 18.00)."
    )
    tax_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00")
    )
    total_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        help_text="Total item cost including taxes."
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="goods_receipt_items",
        help_text="Linked after posting."
    )
    cost_layer = models.ForeignKey(
        BatchInwardCostLayer,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="goods_receipt_items",
        help_text="Linked after posting."
    )
    stock_movement = models.ForeignKey(
        StockMovement,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="goods_receipt_items",
        help_text="Linked after posting."
    )
    intake_status = models.CharField(
        max_length=30,
        choices=INTAKE_STATUS_CHOICES,
        default="VERIFIED",
        help_text="If set to QUARANTINE_REVIEW, stock is held in quarantine upon receipt."
    )
    quarantine_reason = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "inventory_goods_receipt_items"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_sale_units__gt=0) | models.Q(quantity_loose_base_units__gt=0),
                name="chk_grn_item_quantity_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(purchase_cost_per_sale_unit__gt=Decimal("0.00")),
                name="chk_grn_item_cost_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(mrp__gte=Decimal("0.00")),
                name="chk_grn_item_mrp_nonnegative"
            ),
        ]

    def __str__(self):
        return f"{self.product.name} (Lot: {self.batch_number}) - {self.total_base_units} units"

    def clean(self):
        super().clean()
        if self.batch_number:
            self.batch_number = self.batch_number.strip().upper()
        if self.product_id and self.goods_receipt_id:
            if self.product.organization_id != self.goods_receipt.organization_id:
                raise ValidationError({"product": "Product does not belong to the receipt's organization."})
        if self.packaging_snapshot_id and self.product_id:
            if self.packaging_snapshot.product_id != self.product_id:
                raise ValidationError({"packaging_snapshot": "Packaging snapshot does not belong to the product."})


class StockTransfer(models.Model):
    """
    Header representing an inter-store stock transfer request between two branches
    of the same pharmacy organization.
    Follows a strictly controlled lifecycle:
    DRAFT -> SUBMITTED -> APPROVED -> DISPATCHED -> PARTIALLY_RECEIVED / COMPLETED (or DISCREPANCY_HOLD).
    """
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted / Pending Approval"),
        ("APPROVED", "Approved for Dispatch"),
        ("DISPATCHED", "In Transit / Dispatched"),
        ("PARTIALLY_RECEIVED", "Partially Received"),
        ("DISCREPANCY_HOLD", "Discrepancy Hold / Under Investigation"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="stock_transfers"
    )
    source_store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        related_name="outgoing_transfers",
        help_text="Originating store dispatching inventory."
    )
    destination_store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        related_name="incoming_transfers",
        help_text="Destination store receiving inventory."
    )
    transfer_number = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Unique transfer reference (e.g. TRF-YYYYMMDD-0001)."
    )
    status = models.CharField(
        max_length=25,
        choices=STATUS_CHOICES,
        default="DRAFT",
        db_index=True
    )
    notes = models.TextField(blank=True, default="")
    cancellation_reason = models.TextField(blank=True, default="")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requested_transfers"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_transfers"
    )
    dispatched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="dispatched_transfers"
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="received_transfers"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_stock_transfers"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "transfer_number"],
                name="unique_org_transfer_number"
            ),
        ]

    def __str__(self):
        return f"{self.transfer_number} [{self.status}]: {self.source_store.name} -> {self.destination_store.name}"

    def clean(self):
        super().clean()
        if self.source_store_id and self.destination_store_id:
            if self.source_store_id == self.destination_store_id:
                raise ValidationError("Source store and destination store must be different.")
        if self.source_store_id and self.organization_id:
            if self.source_store.organization_id != self.organization_id:
                raise ValidationError({"source_store": "Source store does not belong to the transfer's organization."})
        if self.destination_store_id and self.organization_id:
            if self.destination_store.organization_id != self.organization_id:
                raise ValidationError({"destination_store": "Destination store does not belong to the transfer's organization."})


class StockTransferItem(models.Model):
    """
    Line item for an inter-store transfer representing a specific product batch and quantity.
    Tracks requested, dispatched, received, and discrepancy quantities in atomic base units.
    """
    STATUS_CHOICES = [
        ("PENDING", "Pending Dispatch"),
        ("DISPATCHED", "In Transit"),
        ("RECEIVED", "Fully Received"),
        ("PARTIAL", "Partially Received"),
        ("DISCREPANCY", "Discrepancy Reported"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transfer = models.ForeignKey(
        StockTransfer,
        on_delete=models.CASCADE,
        related_name="items"
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="transfer_items"
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        related_name="transfer_items"
    )
    packaging_snapshot = models.ForeignKey(
        ProductPackagingSnapshot,
        on_delete=models.PROTECT,
        related_name="transfer_items"
    )
    quantity_requested = models.BigIntegerField(
        help_text="Requested transfer quantity in atomic base units."
    )
    quantity_dispatched = models.BigIntegerField(
        default=0,
        help_text="Physically dispatched quantity in atomic base units."
    )
    quantity_received = models.BigIntegerField(
        default=0,
        help_text="Good quantity verified and received at destination in atomic base units."
    )
    quantity_damaged = models.BigIntegerField(
        default=0,
        help_text="Damaged or broken units identified upon destination receipt."
    )
    quantity_missing = models.BigIntegerField(
        default=0,
        help_text="Shortage quantity missing from dispatch parcel."
    )
    quantity_excess = models.BigIntegerField(
        default=0,
        help_text="Unsolicited excess quantity delivered over dispatch figure."
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0.0000"),
        help_text="Cost basis per atomic base unit transferred."
    )
    unit_mrp = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0.0000")
    )
    dispatch_movement = models.ForeignKey(
        StockMovement,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="transfer_dispatch_items"
    )
    receipt_movement = models.ForeignKey(
        StockMovement,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="transfer_receipt_items"
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="PENDING"
    )

    class Meta:
        db_table = "inventory_stock_transfer_items"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_requested__gt=0),
                name="chk_transfer_qty_requested_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(quantity_dispatched__gte=0),
                name="chk_transfer_qty_dispatched_nonneg"
            ),
            models.CheckConstraint(
                condition=models.Q(quantity_received__gte=0),
                name="chk_transfer_qty_received_nonneg"
            ),
        ]

    def __str__(self):
        return f"{self.product.name} (Lot {self.batch.batch_number}): Req {self.quantity_requested}, Disp {self.quantity_dispatched}, Rec {self.quantity_received}"

    @property
    def in_transit_quantity(self):
        """Quantities dispatched that have not yet reached final destination or discrepancy disposition."""
        return max(0, self.quantity_dispatched - self.quantity_received - self.quantity_missing - self.quantity_damaged)

    def clean(self):
        super().clean()
        if self.product_id and self.transfer_id:
            if self.product.organization_id != self.transfer.organization_id:
                raise ValidationError({"product": "Product does not belong to the transfer's organization."})
        if self.batch_id and self.product_id:
            if self.batch.product_id != self.product_id:
                raise ValidationError({"batch": "Batch does not belong to the line's product."})


class TransferDiscrepancy(models.Model):
    """
    Formal discrepancy record for in-transit shortage, breakage, excess, or mismatch.
    Enforces investigation hold before financial liability assignment.
    """
    DISCREPANCY_TYPES = [
        ("SHORTAGE", "Missing / In-Transit Shortage"),
        ("DAMAGE", "Damaged in Transit / Broken"),
        ("EXCESS", "Excess Unaccounted Goods"),
        ("BATCH_MISMATCH", "Batch or Packaging Mismatch"),
    ]

    STATUS_CHOICES = [
        ("PENDING_INVESTIGATION", "Pending Investigation"),
        ("INVESTIGATING", "Under Investigation"),
        ("RESOLVED", "Resolved / Closed"),
    ]

    RESOLUTION_CHOICES = [
        ("", "Pending Decision"),
        ("RECOVERED", "Stock Located & Recovered"),
        ("RETURNED_TO_SOURCE", "Returned to Source Branch"),
        ("LOSS_CONFIRMED", "Transit Loss Confirmed (Pending Liability Determination)"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transfer = models.ForeignKey(
        StockTransfer,
        on_delete=models.CASCADE,
        related_name="discrepancies"
    )
    transfer_item = models.ForeignKey(
        StockTransferItem,
        on_delete=models.CASCADE,
        related_name="discrepancies"
    )
    discrepancy_type = models.CharField(
        max_length=30,
        choices=DISCREPANCY_TYPES
    )
    expected_quantity = models.BigIntegerField()
    actual_quantity = models.BigIntegerField()
    discrepancy_quantity = models.BigIntegerField()
    evidence_notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="PENDING_INVESTIGATION",
        db_index=True
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reported_discrepancies"
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reviewed_discrepancies"
    )
    resolution_decision = models.CharField(
        max_length=50,
        choices=RESOLUTION_CHOICES,
        blank=True,
        default=""
    )
    resolution_notes = models.TextField(blank=True, default="")
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "inventory_transfer_discrepancies"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.discrepancy_type} ({self.discrepancy_quantity} units) on {self.transfer.transfer_number} [{self.status}]"


# =============================================================================
# Milestone 2C.3: Stock Adjustments & Physical Stock Count Models
# =============================================================================

class AdjustmentApprovalPolicy(models.Model):
    """
    Configurable approval policy thresholds for inventory stock adjustments.
    Enforces separation of duties and owner-only escalation for write-offs and high-value adjustments.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="adjustment_policies"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="adjustment_policies",
        help_text="Optional branch-specific override. If null, applies to whole organization."
    )
    max_manager_adjustment_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum monetary valuation (INR) a Store Manager can approve without Owner escalation."
    )
    max_manager_adjustment_quantity = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="Maximum units a Store Manager can approve without Owner escalation."
    )
    require_owner_for_writeoff = models.BooleanField(
        default=True,
        help_text="If True, damage, expiry, and shortage write-offs strictly require Owner approval."
    )
    is_configured = models.BooleanField(
        default=False,
        help_text="Set to True once explicitly reviewed and configured by Organization Owner."
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_adjustment_approval_policies"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "store"],
                name="unique_organization_store_adjustment_policy"
            )
        ]

    def __str__(self):
        target = self.store.name if self.store else f"Org: {self.organization.name}"
        return f"Adjustment Policy [{target}] (Configured: {self.is_configured})"


class PhysicalStockCount(models.Model):
    """
    Physical Stock Count session header.
    Coordinates snapshot capture, physical count recording, intervening movement reconciliation,
    and variance review across a store or specific batch range.
    """
    STATUS_CHOICES = [
        ("PLANNED", "Planned"),
        ("IN_PROGRESS", "Count in Progress"),
        ("SUBMITTED", "Submitted for Review"),
        ("RECONCILED", "Reconciled with Movements"),
        ("COMPLETED", "Adjustments Posted / Completed"),
        ("RECOUNT_REQUIRED", "Recount Required"),
        ("CANCELLED", "Cancelled"),
    ]

    COUNT_TYPES = [
        ("FULL_STORE", "Full Store Count"),
        ("CYCLE_COUNT", "Cycle / Selective Count"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="stock_counts"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        related_name="stock_counts"
    )
    count_number = models.CharField(
        max_length=60,
        unique=True,
        db_index=True,
        help_text="Human-readable count identifier, e.g. CNT-20261026-0001."
    )
    count_type = models.CharField(
        max_length=30,
        choices=COUNT_TYPES,
        default="CYCLE_COUNT"
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="PLANNED",
        db_index=True
    )
    notes = models.TextField(blank=True, default="")
    snapshot_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Exact point-in-time timestamp when initial system inventory snapshot was locked."
    )
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="initiated_counts"
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="submitted_counts"
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reviewed_counts"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_physical_stock_counts"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.count_number} ({self.store.name}) [{self.status}]"


class PhysicalStockCountItem(models.Model):
    """
    Individual product batch counted in a PhysicalStockCount session.
    Records snapshot balance, physical count, intervening stock movements, and reconciled variance.
    """
    STATUS_CHOICES = [
        ("PENDING_COUNT", "Pending Physical Count"),
        ("COUNTED", "Count Recorded"),
        ("RECONCILED", "Reconciled with Movements"),
        ("APPROVED", "Variance Approved"),
        ("REJECTED", "Variance Rejected"),
        ("ADJUSTED", "Adjusted & Posted"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stock_count = models.ForeignKey(
        PhysicalStockCount,
        on_delete=models.CASCADE,
        related_name="items"
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="count_items"
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        related_name="count_items"
    )
    packaging_snapshot = models.ForeignKey(
        ProductPackagingSnapshot,
        on_delete=models.PROTECT,
        related_name="count_items"
    )
    snapshot_system_quantity = models.BigIntegerField(
        help_text="System physical on-hand quantity at stock_count.snapshot_at."
    )
    counted_quantity = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="Verified physical stock on premises in atomic base units."
    )
    intervening_movement_quantity = models.BigIntegerField(
        default=0,
        help_text="Net movements (inflows minus outflows) occurred between snapshot_at and count reconciliation."
    )
    reconciled_system_quantity = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="Reconciled benchmark: snapshot_system_quantity + intervening_movement_quantity."
    )
    variance_quantity = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="Net variance: counted_quantity - reconciled_system_quantity."
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="PENDING_COUNT",
        db_index=True
    )
    counted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="recorded_counts"
    )
    counted_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_physical_stock_count_items"
        ordering = ["product__name", "batch__batch_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["stock_count", "batch"],
                name="unique_stock_count_batch"
            )
        ]

    def __str__(self):
        return f"{self.stock_count.count_number} - {self.product.name} (Lot: {self.batch.batch_number}): {self.variance_quantity} var"


class StockAdjustment(models.Model):
    """
    Formal inventory stock adjustment record.
    Supports single-lot adjustments (manual or generated from stock counts).
    Maintains rigorous approval state machine, valuation calculation, and append-only ledger linkage.
    """
    REASON_CHOICES = [
        ("DAMAGE", "Damaged / Broken Stock Write-off"),
        ("EXPIRY_WRITEOFF", "Expired Stock Disposal Write-off"),
        ("PHYSICAL_SHORTAGE", "Physical Shortage / In-Store Missing"),
        ("VERIFIED_SURPLUS", "Verified Physical Surplus"),
        ("CORRECTION", "Data Entry / Counting Correction"),
        ("OTHER", "Other Authorized Operational Reason"),
    ]

    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted for Approval"),
        ("APPROVED", "Approved (Awaiting Posting)"),
        ("REJECTED", "Rejected by Reviewer"),
        ("POSTED", "Posted to Ledger"),
        ("CANCELLED", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="stock_adjustments"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.CASCADE,
        related_name="stock_adjustments"
    )
    adjustment_number = models.CharField(
        max_length=60,
        unique=True,
        db_index=True,
        help_text="Human-readable identifier, e.g. ADJ-20261026-0001."
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="adjustments"
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        related_name="adjustments"
    )
    packaging_snapshot = models.ForeignKey(
        ProductPackagingSnapshot,
        on_delete=models.PROTECT,
        related_name="adjustments"
    )
    system_quantity_at_request = models.BigIntegerField(
        help_text="Current physical on-hand quantity at the time of request initiation."
    )
    adjustment_quantity = models.BigIntegerField(
        help_text="Signed delta in atomic base units: positive (+) for surplus, negative (-) for reduction."
    )
    resulting_quantity = models.BigIntegerField(
        help_text="Projected physical on-hand quantity after adjustment: system_quantity_at_request + adjustment_quantity."
    )
    reason_code = models.CharField(
        max_length=30,
        choices=REASON_CHOICES,
        db_index=True
    )
    explanation = models.TextField(
        help_text="Detailed justification or investigation evidence."
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="SUBMITTED",
        db_index=True
    )
    unit_cost_basis = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0.0000"),
        help_text="Unit acquisition cost basis evaluated from FIFO layers."
    )
    calculated_valuation = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Server-side evaluated total monetary value impact (abs(qty) * unit_cost_basis)."
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requested_adjustments"
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reviewed_adjustments"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True, default="")
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="posted_adjustments"
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    stock_movement = models.ForeignKey(
        StockMovement,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="adjustments"
    )
    count_item = models.ForeignKey(
        PhysicalStockCountItem,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="adjustments",
        help_text="Reference to physical stock count item if spawned by a count session."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_stock_adjustments"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(adjustment_quantity=0),
                name="chk_adj_quantity_nonzero"
            ),
            models.CheckConstraint(
                condition=models.Q(resulting_quantity__gte=0),
                name="chk_adj_resulting_qty_nonnegative"
            ),
        ]

    def __str__(self):
        return f"{self.adjustment_number} ({self.store.name} - {self.product.name}): {self.adjustment_quantity:+d} [{self.status}]"


# =============================================================================
# Milestone 2C.4: Quarantine, Expiry & Batch Recall Controls
# =============================================================================

class StoreExpiryPolicy(models.Model):
    """
    Store-level configurable near-expiry warning and critical threshold days.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="expiry_policies"
    )
    store = models.OneToOneField(
        "organizations.Store",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="expiry_policy"
    )
    warning_threshold_days = models.PositiveIntegerField(
        default=90,
        help_text="Near-expiry warning window in days (default 90 days)."
    )
    critical_threshold_days = models.PositiveIntegerField(
        default=30,
        help_text="Critical near-expiry window in days (default 30 days)."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_store_expiry_policies"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(critical_threshold_days__lte=models.F("warning_threshold_days")),
                name="chk_critical_lte_warning_days"
            ),
        ]

    def __str__(self):
        scope = self.store.name if self.store else f"Org: {self.organization.name} (Default)"
        return f"Expiry Policy [{scope}]: Warning {self.warning_threshold_days}d, Critical {self.critical_threshold_days}d"


class StockQuarantineRecord(models.Model):
    """
    Audit-tracked quarantine record for batch stock at a store branch.
    Tracks reason, evidence, quantity held, and authorized release / disposition.
    """
    REASON_CHOICES = [
        ("DAMAGED", "Damaged / Broken Packaging"),
        ("SUSPECTED_COUNTERFEIT", "Suspected Counterfeit / Authenticity Concern"),
        ("TEMPERATURE_EXCURSION", "Cold-Chain / Temperature Excursion"),
        ("AMBIGUOUS_IDENTITY", "Ambiguous Batch Identity / Label Defect"),
        ("SUPPLIER_QUALITY", "Supplier Quality Alert / Recall Notice"),
        ("RECALL", "Manufacturer or Regulatory Recall"),
        ("OTHER", "Other Authorized Safety Hold"),
    ]

    STATUS_CHOICES = [
        ("ACTIVE", "Active Quarantine Hold"),
        ("RELEASED", "Released to Active Stock"),
        ("WRITTEN_OFF", "Written Off / Destroyed"),
        ("RETURNED_TO_SUPPLIER", "Returned to Supplier"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="quarantine_records"
    )
    store = models.ForeignKey(
        "organizations.Store",
        on_delete=models.PROTECT,
        related_name="quarantine_records"
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        related_name="quarantine_records"
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="quarantine_records"
    )
    quarantine_number = models.CharField(
        max_length=60,
        unique=True,
        db_index=True,
        help_text="Sequential human-readable identifier: QRN-YYYYMMDD-XXXX"
    )
    quantity_quarantined = models.BigIntegerField(
        help_text="Quantity held under this quarantine record in atomic base units."
    )
    reason_code = models.CharField(
        max_length=40,
        choices=REASON_CHOICES,
        db_index=True
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Detailed inspection notes, temperature readings, or packaging defect description."
    )
    evidence_metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Audit evidence references: images, lot photos, cold chain log numbers."
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="ACTIVE",
        db_index=True
    )
    quarantined_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="initiated_quarantines"
    )
    quarantined_at = models.DateTimeField(auto_now_add=True, db_index=True)

    released_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="released_quarantines"
    )
    released_at = models.DateTimeField(null=True, blank=True)
    release_reason = models.TextField(
        blank=True,
        default="",
        help_text="Documented justification and clearance certificate notes for release."
    )

    disposition_notes = models.TextField(blank=True, default="")
    movement = models.ForeignKey(
        StockMovement,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="quarantine_records"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_quarantine_records"
        ordering = ["-quarantined_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_quarantined__gt=0),
                name="chk_quarantine_qty_strictly_positive"
            ),
        ]

    def __str__(self):
        return f"{self.quarantine_number} [{self.reason_code}]: {self.quantity_quarantined} units of {self.batch.batch_number} at {self.store.name} ({self.status})"


class BatchRecall(models.Model):
    """
    Formal organization-wide or multi-store recall record.
    Immediately freezes all sales, dispensing, and transfers for the affected batch lot.
    """
    SOURCE_CHOICES = [
        ("MANUFACTURER", "Manufacturer Notice"),
        ("REGULATOR", "Drug Regulatory Agency (CDSCO / FDA)"),
        ("SUPPLIER", "Distributor / Wholesaler Alert"),
        ("INTERNAL_QUALITY", "Internal Quality Investigation"),
    ]

    SEVERITY_CHOICES = [
        ("CLASS_1_CRITICAL", "Class I (Critical - Risk of serious injury or death)"),
        ("CLASS_2_MAJOR", "Class II (Major - Temporary health hazard)"),
        ("CLASS_3_MINOR", "Class III (Minor - Technical or labeling violation)"),
    ]

    STATUS_CHOICES = [
        ("INITIATED", "Recall Active / Unquarantined Lots Detected"),
        ("QUARANTINED_ALL", "All Affected Stocks Quarantined"),
        ("RELEASED", "Recall Revoked / Cleared by Authority"),
        ("COMPLETED_DISPOSED", "All Affected Stock Disposed or Returned"),
    ]

    DISPOSITION_CHOICES = [
        ("PENDING", "Pending Action"),
        ("SUPPLIER_RETURN", "Returned to Manufacturer / Supplier"),
        ("DESTRUCTION_WRITEOFF", "Controlled Destruction Write-off"),
        ("RELEASED_AFTER_CLEARANCE", "Released Following Official Clearance"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="batch_recalls"
    )
    recall_number = models.CharField(
        max_length=60,
        unique=True,
        db_index=True,
        help_text="Sequential human-readable identifier: RCL-YYYYMMDD-XXXX"
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        related_name="recall_events"
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="batch_recalls"
    )
    source = models.CharField(
        max_length=40,
        choices=SOURCE_CHOICES,
        db_index=True
    )
    severity = models.CharField(
        max_length=30,
        choices=SEVERITY_CHOICES,
        default="CLASS_1_CRITICAL",
        db_index=True
    )
    reason = models.TextField(
        help_text="Detailed recall reason and hazard analysis."
    )
    evidence_references = models.JSONField(
        default=dict,
        blank=True,
        help_text="Regulatory order numbers, circular URLs, lot codes."
    )

    affected_stores_count = models.PositiveIntegerField(default=0)
    affected_quantity_on_hand = models.BigIntegerField(default=0)
    affected_quantity_in_transit = models.BigIntegerField(default=0)

    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="INITIATED",
        db_index=True
    )
    disposition_type = models.CharField(
        max_length=40,
        choices=DISPOSITION_CHOICES,
        default="PENDING"
    )
    resolution_notes = models.TextField(blank=True, default="")

    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="initiated_recalls"
    )
    initiated_at = models.DateTimeField(auto_now_add=True, db_index=True)

    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="closed_recalls"
    )
    closed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_batch_recalls"
        ordering = ["-initiated_at"]

    def __str__(self):
        return f"{self.recall_number} [{self.severity}]: Batch {self.batch.batch_number} - {self.product.name} ({self.status})"


