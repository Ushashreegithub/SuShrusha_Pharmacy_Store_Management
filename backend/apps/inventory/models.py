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
