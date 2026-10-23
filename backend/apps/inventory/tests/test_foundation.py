import uuid
from datetime import timedelta
from decimal import Decimal
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection
from django.contrib.auth import get_user_model

from apps.organizations.models import Organization, Store
from apps.products.models import Product
from apps.inventory.models import (
    ProductPackagingSnapshot,
    Batch,
    BatchInwardCostLayer,
    StoreBatchStock,
    StockMovement,
    InventoryOperation,
)

User = get_user_model()


class InventoryFoundationTests(TransactionTestCase):
    """
    Focused automated tests for Milestone 2A: Inventory Foundation.
    Verifies database constraints, triggers, model immutability, and isolation.
    """

    def setUp(self):
        # 1. Setup primary organization and user
        self.owner = User.objects.create_user(
            email="owner_inv@diracpharma.test",
            password="StrongPassword123!",
            full_name="Inventory Owner"
        )
        self.org = Organization.objects.create(
            name="DiracPharma Central Org",
            owner=self.owner
        )
        self.store = Store.objects.create(
            name="Main Pharmacy Branch",
            organization=self.org,
            code="STR-01"
        )

        # 2. Setup secondary organization for tenant isolation tests
        self.other_owner = User.objects.create_user(
            email="other_inv@diracpharma.test",
            password="StrongPassword123!",
            full_name="Other Owner"
        )
        self.other_org = Organization.objects.create(
            name="External Pharmacy Corp",
            owner=self.other_owner
        )
        self.other_store = Store.objects.create(
            name="External Branch",
            organization=self.other_org,
            code="STR-EXT"
        )

        # 3. Setup a catalog product
        self.product = Product.objects.create(
            organization=self.org,
            name="Paracetamol 500mg",
            brand_name="Calpol",
            generic_name="Paracetamol",
            sku="MED-PCM-500",
            category="prescription_medicines",
            item_type="medicine",
            dosage_form="tablet",
            prescription_class="otc",
            base_unit="tablet",
            sale_unit="strip",
            conversion_factor=10,
            is_loose_dispensing_allowed=True,
            pack_description="Strip of 10 Tablets",
            gst_rate=Decimal("12.00"),
            created_by=self.owner
        )

        # 4. Packaging snapshot
        self.snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(self.product)

    def test_packaging_snapshot_creation_and_immutability(self):
        """Packaging snapshot preserves version and rejects in-place attribute mutations."""
        self.assertEqual(self.snapshot.version, 1)
        self.assertEqual(self.snapshot.conversion_factor, 10)
        self.assertEqual(self.snapshot.base_unit, "tablet")
        self.assertEqual(self.snapshot.sale_unit, "strip")

        # Attempt to mutate snapshot conversion factor directly
        self.snapshot.conversion_factor = 15
        with self.assertRaises(ValidationError):
            self.snapshot.save()

    def test_packaging_version_evolution(self):
        """Changing product packaging creates an incremental version rather than mutating historical snapshot."""
        # Update product packaging attributes
        self.product.conversion_factor = 15
        self.product.pack_description = "Strip of 15 Tablets"
        self.product.save()

        # Get or create snapshot
        new_snapshot, created = ProductPackagingSnapshot.get_or_create_current_snapshot(self.product)
        self.assertTrue(created)
        self.assertEqual(new_snapshot.version, 2)
        self.assertEqual(new_snapshot.conversion_factor, 15)

        # Verify old snapshot remains untouched
        old_snapshot = ProductPackagingSnapshot.objects.get(product=self.product, version=1)
        self.assertEqual(old_snapshot.conversion_factor, 10)

    def test_batch_identity_and_uppercase_normalization(self):
        """Batch numbers are stripped and normalized to uppercase, and unit_mrp is derived."""
        batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="  cip-9042a  ",
            expiry_date=timezone.localdate() + timedelta(days=365),
            mrp=Decimal("120.00"),
            created_by=self.owner
        )
        self.assertEqual(batch.batch_number, "CIP-9042A")
        # 120.00 / 10 = 12.0000
        self.assertEqual(batch.unit_mrp, Decimal("12.0000"))
        self.assertEqual(batch.manufacturer_name, "UNKNOWN_UNSPECIFIED")

    def test_cross_organization_reference_rejection(self):
        """Batch cannot reference a product belonging to another organization."""
        other_product = Product.objects.create(
            organization=self.other_org,
            name="External Product",
            sku="EXT-001",
            category="otc_medicines",
            base_unit="piece",
            sale_unit="piece",
            conversion_factor=1,
            created_by=self.other_owner
        )
        other_snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(other_product)

        # Batch in Org 1 attempting to link Product in Org 2
        batch = Batch(
            organization=self.org,
            product=other_product,
            packaging_snapshot=other_snapshot,
            batch_number="MISMATCH-01",
            expiry_date=timezone.localdate() + timedelta(days=180),
            mrp=Decimal("50.00")
        )
        with self.assertRaises(ValidationError):
            batch.clean()

    def test_duplicate_batch_lot_constraint(self):
        """Same lot number, product, expiry, and packaging snapshot within organization is rejected."""
        expiry = timezone.localdate() + timedelta(days=300)
        Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="LOT-DUP-1",
            expiry_date=expiry,
            mrp=Decimal("100.00"),
            created_by=self.owner
        )

        with self.assertRaises(IntegrityError):
            Batch.objects.create(
                organization=self.org,
                product=self.product,
                packaging_snapshot=self.snapshot,
                batch_number="LOT-DUP-1",
                expiry_date=expiry,
                mrp=Decimal("100.00"),
                created_by=self.owner
            )

    def test_same_batch_number_in_different_org_allowed(self):
        """Identical batch number in a different organization does not collide."""
        expiry = timezone.localdate() + timedelta(days=300)
        b1 = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="LOT-SHARED-1",
            expiry_date=expiry,
            mrp=Decimal("100.00"),
            created_by=self.owner
        )

        other_product = Product.objects.create(
            organization=self.other_org,
            name="Other Org Paracetamol",
            sku="OTH-PCM-01",
            base_unit="tablet",
            sale_unit="strip",
            conversion_factor=10,
            created_by=self.other_owner
        )
        other_snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(other_product)

        b2 = Batch.objects.create(
            organization=self.other_org,
            product=other_product,
            packaging_snapshot=other_snapshot,
            batch_number="LOT-SHARED-1",
            expiry_date=expiry,
            mrp=Decimal("100.00"),
            created_by=self.other_owner
        )
        self.assertNotEqual(b1.pk, b2.pk)
        self.assertEqual(b1.batch_number, b2.batch_number)

    def test_store_batch_stock_availability_and_quarantine(self):
        """Available quantity accounts for quarantined units, global recall, and expiry."""
        batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="LOT-AVAIL-1",
            expiry_date=timezone.localdate() + timedelta(days=90),
            mrp=Decimal("150.00"),
            created_by=self.owner
        )
        stock = StoreBatchStock.objects.create(
            organization=self.org,
            store=self.store,
            product=self.product,
            batch=batch,
            quantity_on_hand=100,
            quantity_quarantined=20
        )
        # 100 on-hand - 20 quarantined = 80 available
        self.assertEqual(stock.available_quantity, 80)

        # When batch is globally recalled, available quantity drops immediately to 0
        batch.is_recalled = True
        batch.save()
        stock.refresh_from_db()
        self.assertEqual(stock.available_quantity, 0)

        # Restore recall and test expired stock
        batch.is_recalled = False
        batch.expiry_date = timezone.localdate() - timedelta(days=1)
        batch.save()
        stock.refresh_from_db()
        self.assertEqual(stock.available_quantity, 0)

    def test_nonnegative_quantity_constraints(self):
        """Database check constraints prevent negative quantities on hand or quarantined."""
        batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="LOT-NEG-1",
            expiry_date=timezone.localdate() + timedelta(days=90),
            mrp=Decimal("150.00"),
            created_by=self.owner
        )

        # Negative on-hand
        with self.assertRaises(IntegrityError):
            StoreBatchStock.objects.create(
                organization=self.org,
                store=self.store,
                product=self.product,
                batch=batch,
                quantity_on_hand=-5,
                quantity_quarantined=0
            )

    def test_quarantine_cannot_exceed_on_hand(self):
        """Check constraint ensures quantity_quarantined <= quantity_on_hand."""
        batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="LOT-EXCEED-1",
            expiry_date=timezone.localdate() + timedelta(days=90),
            mrp=Decimal("150.00"),
            created_by=self.owner
        )

        with self.assertRaises(IntegrityError):
            StoreBatchStock.objects.create(
                organization=self.org,
                store=self.store,
                product=self.product,
                batch=batch,
                quantity_on_hand=50,
                quantity_quarantined=60  # 60 > 50 violates chk_quarantine_lte_on_hand
            )

    def test_unique_store_batch_inventory_constraint(self):
        """Only one StoreBatchStock row is permitted per store and batch."""
        batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="LOT-UNQ-1",
            expiry_date=timezone.localdate() + timedelta(days=90),
            mrp=Decimal("150.00"),
            created_by=self.owner
        )
        StoreBatchStock.objects.create(
            organization=self.org,
            store=self.store,
            product=self.product,
            batch=batch,
            quantity_on_hand=50
        )

        with self.assertRaises(IntegrityError):
            StoreBatchStock.objects.create(
                organization=self.org,
                store=self.store,
                product=self.product,
                batch=batch,
                quantity_on_hand=20
            )

    def test_cost_layer_provenance_and_constraints(self):
        """Cost layers track original and remaining base-unit quantities and unit cost."""
        batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="LOT-COST-1",
            expiry_date=timezone.localdate() + timedelta(days=120),
            mrp=Decimal("200.00"),
            created_by=self.owner
        )
        layer = BatchInwardCostLayer.objects.create(
            organization=self.org,
            store=self.store,
            batch=batch,
            receipt_type="OPENING_STOCK",
            receipt_reference="OP-001",
            original_quantity=100,
            remaining_quantity=100,
            purchase_cost_per_sale_unit=Decimal("140.00"),
            unit_cost=Decimal("14.0000")
        )
        self.assertEqual(layer.remaining_quantity, 100)
        self.assertEqual(layer.unit_cost, Decimal("14.0000"))

        # Check constraint: remaining_quantity cannot exceed original_quantity
        with self.assertRaises(IntegrityError):
            BatchInwardCostLayer.objects.create(
                organization=self.org,
                store=self.store,
                batch=batch,
                receipt_type="OPENING_STOCK",
                receipt_reference="OP-ERR",
                original_quantity=50,
                remaining_quantity=60,  # 60 > 50
                purchase_cost_per_sale_unit=Decimal("140.00"),
                unit_cost=Decimal("14.0000")
            )

    def test_stock_movement_model_immutability(self):
        """StockMovement instances reject Python-level updates and deletions."""
        batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="LOT-MOV-1",
            expiry_date=timezone.localdate() + timedelta(days=120),
            mrp=Decimal("200.00"),
            created_by=self.owner
        )
        movement = StockMovement.objects.create(
            organization=self.org,
            store=self.store,
            product=self.product,
            batch=batch,
            movement_type="OPENING_STOCK",
            direction="IN",
            quantity=50,
            balance_before=0,
            balance_after=50,
            unit_cost=Decimal("14.0000"),
            unit_mrp=Decimal("20.0000"),
            total_cost_value=Decimal("700.00"),
            reference_type="OPENING_STOCK",
            reference_id="OP-TEST-01",
            actor=self.owner,
            reason="Initial intake"
        )

        # Attempt to modify
        movement.quantity = 60
        with self.assertRaises(ValidationError):
            movement.save()

        # Attempt to delete
        with self.assertRaises(ValidationError):
            movement.delete()

    def test_stock_movement_database_trigger_protection(self):
        """PostgreSQL database trigger blocks direct SQL UPDATE and DELETE on StockMovement."""
        batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="LOT-TRG-1",
            expiry_date=timezone.localdate() + timedelta(days=120),
            mrp=Decimal("200.00"),
            created_by=self.owner
        )
        movement = StockMovement.objects.create(
            organization=self.org,
            store=self.store,
            product=self.product,
            batch=batch,
            movement_type="OPENING_STOCK",
            direction="IN",
            quantity=25,
            balance_before=0,
            balance_after=25,
            actor=self.owner,
            reference_id="OP-TRG-01"
        )

        # Execute direct SQL UPDATE bypassing Django ORM save()
        with connection.cursor() as cursor:
            with self.assertRaises(Exception) as ctx:
                cursor.execute(
                    "UPDATE inventory_stock_movements SET quantity = 999 WHERE id = %s",
                    [str(movement.id)]
                )
            self.assertIn("strictly append-only", str(ctx.exception).lower())

        # Execute direct SQL DELETE bypassing Django ORM delete()
        with connection.cursor() as cursor:
            with self.assertRaises(Exception) as ctx:
                cursor.execute(
                    "DELETE FROM inventory_stock_movements WHERE id = %s",
                    [str(movement.id)]
                )
            self.assertIn("strictly append-only", str(ctx.exception).lower())

    def test_inventory_operation_idempotency_structure(self):
        """InventoryOperation enforces unique (organization, idempotency_key) and tracks payload hash."""
        op_key = uuid.uuid4()
        op = InventoryOperation.objects.create(
            idempotency_key=op_key,
            organization=self.org,
            store=self.store,
            actor=self.owner,
            operation_type="OPENING_STOCK",
            payload_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            status="in_progress"
        )
        self.assertEqual(op.status, "in_progress")

        # Duplicate key in same organization rejected
        with self.assertRaises(IntegrityError):
            InventoryOperation.objects.create(
                idempotency_key=op_key,
                organization=self.org,
                store=self.store,
                actor=self.owner,
                operation_type="OPENING_STOCK",
                payload_hash="different_hash",
                status="in_progress"
            )

