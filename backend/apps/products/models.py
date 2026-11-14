import uuid
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.db.models import Q
from apps.organizations.models import Organization


class Product(models.Model):
    """
    Product Master record scoped to an Organization.
    Represents the catalog definition of a pharmaceutical, OTC, healthcare, or retail pharmacy item.
    Does NOT contain batch-specific data (expiry, batch number, batch purchase cost, stock counts),
    which belong to downstream inventory/batch models.
    """
    # Category choices
    CATEGORY_CHOICES = [
        ("prescription_medicines", "Prescription Medicines"),
        ("otc_medicines", "OTC Medicines"),
        ("healthcare_devices", "Medical Supplies & Devices"),
        ("personal_care", "Personal Care & Hygiene"),
        ("baby_care", "Baby & Mother Care"),
        ("supplements_nutrition", "Vitamins & Supplements"),
        ("ayurvedic_herbal", "Ayurvedic & Herbal"),
        ("surgical_supplies", "Surgical & Wound Care"),
        ("diagnostic_kits", "Diagnostic & Testing"),
        ("other", "General / Other"),
    ]

    # Item Type choices: medicine vs non-medicine
    ITEM_TYPE_CHOICES = [
        ("medicine", "Medicine / Pharmaceutical"),
        ("device_equipment", "Medical Device / Equipment"),
        ("consumable", "Consumable / Supply"),
        ("personal_care", "Personal Care / Cosmetics"),
        ("wellness_supplement", "Wellness / Supplement"),
        ("general", "General Retail"),
    ]

    # Dosage Form choices (applicable mainly to medicines)
    DOSAGE_FORM_CHOICES = [
        ("tablet", "Tablet"),
        ("capsule", "Capsule"),
        ("syrup", "Syrup / Liquid Oral"),
        ("suspension", "Suspension"),
        ("injection", "Injection"),
        ("ointment", "Ointment / Cream / Gel"),
        ("drops", "Eye / Ear / Nasal Drops"),
        ("inhaler", "Inhaler / Respules"),
        ("powder", "Powder / Granules"),
        ("lotion", "Lotion / Solution"),
        ("spray", "Spray"),
        ("suppository", "Suppository"),
        ("patch", "Transdermal Patch"),
        ("device", "Device / Sundry"),
        ("na", "Not Applicable"),
    ]

    # Prescription Classification / Dispensing attributes
    PRESCRIPTION_CLASS_CHOICES = [
        ("otc", "Over The Counter (OTC)"),
        ("rx_general", "Prescription Only (Rx)"),
        ("schedule_h", "Schedule H (Prescription Required)"),
        ("schedule_h1", "Schedule H1 (Monitored Antibiotics/Psychotropics)"),
        ("schedule_x", "Schedule X (Strict Narcotic/Psychotropic)"),
        ("narcotic", "NDPS / Controlled Substance"),
    ]

    # Units of Measure
    UNIT_CHOICES = [
        ("tablet", "Tablet"),
        ("capsule", "Capsule"),
        ("strip", "Strip"),
        ("bottle", "Bottle"),
        ("box", "Box"),
        ("vial", "Vial"),
        ("ampoule", "Ampoule"),
        ("tube", "Tube"),
        ("piece", "Piece"),
        ("pack", "Pack"),
        ("sachet", "Sachet"),
        ("can", "Can / Tin"),
        ("jar", "Jar"),
        ("kit", "Kit"),
        ("ml", "ml"),
        ("gm", "gm"),
        ("unit", "Unit"),
    ]

    # Storage conditions
    STORAGE_CHOICES = [
        ("room_temperature", "Store at Room Temperature (15-25°C)"),
        ("cool_dry", "Store in Cool & Dry Place"),
        ("refrigerated", "Refrigerate (2-8°C) - Do Not Freeze"),
        ("frozen", "Keep Frozen (below -10°C)"),
        ("protect_from_light", "Protect from Direct Sunlight"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="products",
        help_text="Owning pharmacy organization (tenant root)."
    )

    # Core Identifiers
    name = models.CharField(max_length=255, db_index=True, help_text="Commercial / product trade name")
    brand_name = models.CharField(max_length=255, blank=True, default="", db_index=True, help_text="Brand or Trade label")
    generic_name = models.CharField(max_length=255, blank=True, default="", db_index=True, help_text="Active Pharmaceutical Ingredient (API) / Generic formulation")
    composition = models.CharField(max_length=500, blank=True, default="", help_text="Salt composition or combined active ingredients")
    
    sku = models.CharField(max_length=100, db_index=True, help_text="Stock Keeping Unit identifier unique within the organization")
    barcode = models.CharField(max_length=100, blank=True, default="", db_index=True, help_text="EAN / UPC / GTIN barcode if available")
    hsn_code = models.CharField(max_length=50, blank=True, default="", help_text="Harmonized System of Nomenclature code for GST/tax compliance")

    # Classification & Attributes
    item_type = models.CharField(max_length=40, choices=ITEM_TYPE_CHOICES, default="medicine")
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default="prescription_medicines", db_index=True)
    manufacturer = models.CharField(max_length=255, blank=True, default="", db_index=True, help_text="Pharmaceutical company or manufacturing entity")

    # Formulation & Dispensing (Optional for non-medicines)
    strength = models.CharField(max_length=100, blank=True, default="", help_text="Active ingredient potency, e.g. '500 mg', '250 mg/5 ml'")
    dosage_form = models.CharField(max_length=40, choices=DOSAGE_FORM_CHOICES, default="tablet")
    prescription_class = models.CharField(max_length=40, choices=PRESCRIPTION_CLASS_CHOICES, default="otc")
    is_narcotic = models.BooleanField(default=False, help_text="Whether item is subject to strict narcotic/psychotropic logs")
    
    # Packaging, Dispensing & Sale Units
    pack_description = models.CharField(max_length=255, blank=True, default="", help_text="e.g. 'Strip of 10 tablets', 'Bottle of 100 ml', 'Box of 1 device'")
    base_unit = models.CharField(max_length=30, choices=UNIT_CHOICES, default="tablet", help_text="Smallest atomic inventory unit (e.g. 1 Tablet, 1 ml, 1 Vial)")
    sale_unit = models.CharField(max_length=30, choices=UNIT_CHOICES, default="strip", help_text="Standard unit sold to customers / dispensed (e.g. 1 Strip, 1 Bottle, 1 Box)")
    conversion_factor = models.PositiveIntegerField(
        default=1,
        help_text="Number of base units contained in one sale unit. E.g. 10 tablets per strip = 10."
    )
    is_loose_dispensing_allowed = models.BooleanField(
        default=True,
        help_text="Whether individual base units can be cut/dispensed loose (e.g. 4 tablets out of a 10-tablet strip)"
    )

    # Tax & Commercial Rules
    gst_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("12.00"),
        help_text="Applicable GST / VAT tax percentage (e.g. 0.00, 5.00, 12.00, 18.00)"
    )

    # Storage & Handling
    storage_condition = models.CharField(max_length=40, choices=STORAGE_CHOICES, default="room_temperature")
    minimum_stock_level = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Optional minimum stock warning threshold in atomic base units"
    )
    reorder_level = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Optional reorder trigger threshold in atomic base units"
    )
    description = models.TextField(blank=True, default="", help_text="Optional pharmacological notes, warnings, or handling instructions")

    # Status
    is_active = models.BooleanField(default=True, db_index=True, help_text="False indicates archived/decommissioned catalog product")

    # Audit Trail
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_products"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_products"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "products"
        ordering = ["name"]
        constraints = [
            # 1. SKU unique per organization
            models.UniqueConstraint(
                fields=["organization", "sku"],
                name="unique_product_sku_per_organization"
            ),
            # 2. Barcode unique per organization (only when barcode is non-empty)
            models.UniqueConstraint(
                fields=["organization", "barcode"],
                condition=Q(barcode__isnull=False) & ~Q(barcode=""),
                name="unique_product_barcode_per_organization"
            ),
        ]

    def __str__(self):
        brand = f" ({self.brand_name})" if self.brand_name else ""
        return f"{self.name}{brand} [{self.sku}]"

    def clean(self):
        super().clean()
        if self.sku:
            self.sku = self.sku.strip().upper()
        if self.barcode:
            self.barcode = self.barcode.strip()
        if self.conversion_factor < 1:
            self.conversion_factor = 1

    def save(self, *args, **kwargs):
        if self.sku:
            self.sku = self.sku.strip().upper()
        if self.barcode:
            self.barcode = self.barcode.strip()
        if self.conversion_factor < 1:
            self.conversion_factor = 1
        super().save(*args, **kwargs)


class ProductImportBatch(models.Model):
    """
    Tracks an organization-scoped Excel medicine catalogue preview and import execution.
    Ensures idempotent retries and auditable import reporting without touching stock ledgers.
    """
    STATUS_CHOICES = [
        ("PREVIEWED", "Previewed"),
        ("COMPLETED", "Completed"),
        ("FAILED", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="product_import_batches",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="product_import_batches",
    )
    file_name = models.CharField(max_length=255)
    file_hash = models.CharField(max_length=64, blank=True, default="")
    idempotency_key = models.CharField(max_length=128, null=True, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PREVIEWED", db_index=True)

    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    invalid_rows = models.PositiveIntegerField(default=0)
    duplicate_rows = models.PositiveIntegerField(default=0)
    ready_rows = models.PositiveIntegerField(default=0)
    imported_count = models.PositiveIntegerField(default=0)
    skipped_duplicate_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)

    preview_payload = models.JSONField(default=dict, blank=True)
    result_summary = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "product_import_batches"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "idempotency_key"],
                condition=Q(idempotency_key__isnull=False) & ~Q(idempotency_key=""),
                name="unique_product_import_idempotency_per_org",
            ),
        ]

    def __str__(self):
        return f"Import {self.file_name} [{self.status}] ({self.organization.name})"

