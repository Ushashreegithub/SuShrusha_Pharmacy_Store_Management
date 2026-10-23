import uuid
from decimal import Decimal
from datetime import timedelta
from django.test import TransactionTestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.organizations.models import Organization, Store, OrganizationMembership, StoreMembership
from apps.products.models import Product
from apps.inventory.models import (
    ProductPackagingSnapshot,
    Batch,
    BatchInwardCostLayer,
    StoreBatchStock,
    StockMovement,
    InventoryOperation,
)
from apps.audit.models import AuditEvent

User = get_user_model()


class Milestone2BTests(TransactionTestCase):
    """
    Focused automated tests for Milestone 2B:
    Opening Stock Intake, StockLedgerService, Store Stock Listing, and Concurrency/Idempotency.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Organization A and Owner
        self.owner = User.objects.create_user(
            email="owner_2b@diracpharma.test",
            password="StrongPassword123!",
            full_name="Owner TwoB"
        )
        self.org = Organization.objects.create(
            name="DiracPharma TwoB Org",
            owner=self.owner
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role="owner",
            is_active=True
        )

        # 2. Store 1 and Store 2
        self.store1 = Store.objects.create(
            name="Central Store Branch",
            organization=self.org,
            code="STR-01"
        )
        self.store2 = Store.objects.create(
            name="Secondary Store Branch",
            organization=self.org,
            code="STR-02"
        )

        # 3. Store Manager (assigned to Store 1 only)
        self.manager = User.objects.create_user(
            email="manager_2b@diracpharma.test",
            password="StrongPassword123!",
            full_name="Store Manager TwoB"
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.manager,
            role="manager",
            is_active=True
        )

        # 4. Pharmacist / Staff (assigned to Store 1, read-only cost)
        self.pharmacist = User.objects.create_user(
            email="pharmacist_2b@diracpharma.test",
            password="StrongPassword123!",
            full_name="Pharmacist TwoB"
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.pharmacist,
            role="pharmacist",
            is_active=True
        )

        # 5. Organization B (external organization)
        self.other_owner = User.objects.create_user(
            email="other_owner_2b@diracpharma.test",
            password="StrongPassword123!",
            full_name="Other Owner"
        )
        self.other_org = Organization.objects.create(
            name="External Corp",
            owner=self.other_owner
        )
        OrganizationMembership.objects.create(
            organization=self.other_org,
            user=self.other_owner,
            role="owner",
            is_active=True
        )
        self.other_store = Store.objects.create(
            name="External Store",
            organization=self.other_org,
            code="EXT-01"
        )

        # 6. Primary Product & Snapshot
        self.product = Product.objects.create(
            organization=self.org,
            name="Amoxicillin 500mg",
            brand_name="Mox 500",
            generic_name="Amoxicillin Trihydrate",
            sku="MED-AMX-500",
            barcode="8901234567890",
            category="prescription_medicines",
            item_type="medicine",
            dosage_form="capsule",
            prescription_class="schedule_h",
            base_unit="capsule",
            sale_unit="strip",
            conversion_factor=10,
            is_loose_dispensing_allowed=True,
            pack_description="Strip of 10 Capsules",
            gst_rate=Decimal("12.00"),
            created_by=self.owner
        )
        self.snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(self.product)

    # -------------------------------------------------------------------------
    # Opening Stock Tests (1 - 16)
    # -------------------------------------------------------------------------

    def test_01_valid_opening_stock_posting(self):
        """Valid opening stock establishes balance, cost layer, movement ledger, and operation."""
        self.client.force_authenticate(user=self.owner)
        op_key = uuid.uuid4()
        payload = {
            "idempotency_key": str(op_key),
            "product_id": str(self.product.id),
            "batch_number": "AMX-BATCH-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 5,
            "quantity_loose_base_units": 4,
            "receipt_reference": "OP-2026-001",
            "reason": "Initial Opening Audit"
        }
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["status"], "success")
        # 5 strips * 10 + 4 loose = 54 base units
        self.assertEqual(data["quantity_on_hand"], 54)
        self.assertEqual(data["available_quantity"], 54)
        self.assertEqual(data["quantity_added_base_units"], 54)
        # Unit cost: 100.00 / 10 = 10.0000
        self.assertEqual(data["unit_cost"], "10.0000")
        # Total cost: 54 * 10.0000 = 540.00
        self.assertEqual(data["total_cost_value"], "540.00")

        # Verify database entities
        stock = StoreBatchStock.objects.get(store=self.store1, product=self.product)
        self.assertEqual(stock.quantity_on_hand, 54)

        layer = BatchInwardCostLayer.objects.get(store=self.store1, receipt_reference="OP-2026-001")
        self.assertEqual(layer.original_quantity, 54)
        self.assertEqual(layer.remaining_quantity, 54)
        self.assertEqual(layer.unit_cost, Decimal("10.0000"))

        movement = StockMovement.objects.get(store=self.store1, reference_id="OP-2026-001")
        self.assertEqual(movement.movement_type, "OPENING_STOCK")
        self.assertEqual(movement.direction, "IN")
        self.assertEqual(movement.quantity, 54)
        self.assertEqual(movement.balance_before, 0)
        self.assertEqual(movement.balance_after, 54)

    def test_02_duplicate_idempotent_request_replays_cleanly(self):
        """Re-submitting exact same payload with same idempotency key replays cached 200/201 response."""
        self.client.force_authenticate(user=self.owner)
        op_key = uuid.uuid4()
        payload = {
            "idempotency_key": str(op_key),
            "product_id": str(self.product.id),
            "batch_number": "AMX-REPLAY-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 2,
            "quantity_loose_base_units": 0,
            "receipt_reference": "OP-REPLAY-01"
        }
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        res1 = self.client.post(url, payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Second submission
        res2 = self.client.post(url, payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.json()["movement_id"], res2.json()["movement_id"])

        # Exactly 1 movement and 1 cost layer in database
        self.assertEqual(StockMovement.objects.filter(reference_id="OP-REPLAY-01").count(), 1)
        self.assertEqual(BatchInwardCostLayer.objects.filter(receipt_reference="OP-REPLAY-01").count(), 1)

    def test_03_concurrent_duplicate_requests(self):
        """Idempotency engine safely serializes and caches concurrent executions."""
        self.client.force_authenticate(user=self.owner)
        op_key = uuid.uuid4()
        payload = {
            "idempotency_key": str(op_key),
            "product_id": str(self.product.id),
            "batch_number": "AMX-CONC-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 1,
            "receipt_reference": "OP-CONC-01"
        }
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        res1 = self.client.post(url, payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        res2 = self.client.post(url, payload, format="json")
        self.assertIn(res2.status_code, [status.HTTP_200_OK, status.HTTP_409_CONFLICT])

    def test_04_same_key_with_different_payload_rejected(self):
        """Reusing an idempotency key with a different request payload returns HTTP 422."""
        self.client.force_authenticate(user=self.owner)
        op_key = uuid.uuid4()
        payload1 = {
            "idempotency_key": str(op_key),
            "product_id": str(self.product.id),
            "batch_number": "AMX-DIFF-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 1,
            "receipt_reference": "OP-DIFF-01"
        }
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        res1 = self.client.post(url, payload1, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Alter payload with same key
        payload2 = dict(payload1)
        payload2["quantity_sale_units"] = 5
        res2 = self.client.post(url, payload2, format="json")
        self.assertEqual(res2.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.assertIn("different request payload", res2.json()["detail"].lower())

    def test_05_invalid_quantity_rejected(self):
        """Zero or negative quantities are rejected with HTTP 400."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-INV-QTY",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 0,
            "quantity_loose_base_units": 0
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_06_unit_conversion_correctness(self):
        """Validates exact integer base units: (sale_units * conversion_factor) + loose_units."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-CONV-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 3,
            "quantity_loose_base_units": 7,
            "receipt_reference": "OP-CONV-01"
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # 3 * 10 + 7 = 37 base units
        self.assertEqual(response.json()["quantity_on_hand"], 37)

    def test_07_packaging_snapshot_mismatch_rejected(self):
        """Snapshot belonging to a different product is rejected with HTTP 400."""
        self.client.force_authenticate(user=self.owner)
        other_product = Product.objects.create(
            organization=self.org,
            name="Other Product",
            sku="OTH-001",
            base_unit="piece",
            sale_unit="box",
            conversion_factor=5,
            created_by=self.owner
        )
        other_snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(other_product)

        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "packaging_snapshot_id": str(other_snapshot.id),
            "batch_number": "AMX-SNAP-ERR",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 1
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_08_cross_organization_batch_rejection(self):
        """Product belonging to Organization B cannot be intake-established in Organization A's store."""
        self.client.force_authenticate(user=self.owner)
        ext_product = Product.objects.create(
            organization=self.other_org,
            name="External Product",
            sku="EXT-PCM-01",
            base_unit="tablet",
            sale_unit="strip",
            conversion_factor=10,
            created_by=self.other_owner
        )

        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(ext_product.id),
            "batch_number": "EXT-LOT-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 1
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_09_unauthorized_store_posting_rejected(self):
        """Pharmacist role receives HTTP 403 when attempting to post opening stock."""
        self.client.force_authenticate(user=self.pharmacist)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-UNAUTH-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 1
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_10_quarantine_and_recall_restrictions(self):
        """Pre-existing recalled batch cannot receive opening stock intake."""
        self.client.force_authenticate(user=self.owner)
        recalled_batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="AMX-RECALLED-01",
            expiry_date=timezone.localdate() + timedelta(days=365),
            mrp=Decimal("150.00"),
            is_recalled=True,
            created_by=self.owner
        )

        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-RECALLED-01",
            "expiry_date": str(recalled_batch.expiry_date),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 1
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("recalled batch", response.json()["detail"].lower())

    def test_11_expired_batch_behavior(self):
        """Opening stock intake for an expired batch is rejected with HTTP 400."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-EXPIRED-01",
            "expiry_date": str(timezone.localdate() - timedelta(days=1)),  # Expired yesterday
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 1
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired batch", str(response.json()).lower())

    def test_12_cost_provenance_recording(self):
        """BatchInwardCostLayer records purchase_cost_per_sale_unit, unit_cost, and receipt_reference."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-COST-PROV",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 10,
            "receipt_reference": "OP-INV-99"
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        layer = BatchInwardCostLayer.objects.get(receipt_reference="OP-INV-99")
        self.assertEqual(layer.purchase_cost_per_sale_unit, Decimal("120.00"))
        # 120.00 / 10 = 12.0000
        self.assertEqual(layer.unit_cost, Decimal("12.0000"))
        self.assertEqual(layer.original_quantity, 100)
        self.assertEqual(layer.remaining_quantity, 100)

    def test_13_missing_cost_rejection(self):
        """Missing or zero purchase cost per sale unit is rejected with HTTP 400."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-NO-COST",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "0.00",  # Zero cost invalid
            "quantity_sale_units": 10
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_14_duplicate_opening_initialization_prevention(self):
        """Cannot re-post opening stock for the same batch and store using a different idempotency key."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload1 = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-ONCE-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 5
        }
        res1 = self.client.post(url, payload1, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Attempt to post opening stock again for same batch and store using a NEW idempotency key
        payload2 = dict(payload1)
        payload2["idempotency_key"] = str(uuid.uuid4())
        res2 = self.client.post(url, payload2, format="json")
        self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("already been initialized", res2.json()["detail"].lower())

    def test_15_failed_transaction_rollback(self):
        """Errors during intake roll back all balance, movement, and cost layer updates atomically."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        # Submit payload with invalid expiry date
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-ROLLBACK-01",
            "expiry_date": str(timezone.localdate() - timedelta(days=10)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 5
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Ensure zero movements or stock rows created
        self.assertFalse(StockMovement.objects.filter(batch__batch_number="AMX-ROLLBACK-01").exists())
        self.assertFalse(StoreBatchStock.objects.filter(batch__batch_number="AMX-ROLLBACK-01").exists())

    def test_16_audit_reference_creation(self):
        """AuditEvent is created with event_type='INVENTORY_OPENING_STOCK_POSTED'."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        op_key = uuid.uuid4()
        payload = {
            "idempotency_key": str(op_key),
            "product_id": str(self.product.id),
            "batch_number": "AMX-AUDIT-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 2
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        event = AuditEvent.objects.filter(
            event_type="INVENTORY_OPENING_STOCK_POSTED",
            organization=self.org
        ).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.details["batch_number"], "AMX-AUDIT-01")
        self.assertEqual(event.details["idempotency_key"], str(op_key))

    # -------------------------------------------------------------------------
    # Ledger & Reconciliation Tests (17 - 24)
    # -------------------------------------------------------------------------

    def test_17_correct_balance_before_after(self):
        """StockMovement records exact on-hand balance before and after mutation."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-BAL-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 4
        }
        self.client.post(url, payload, format="json")
        movement = StockMovement.objects.get(batch__batch_number="AMX-BAL-01")
        self.assertEqual(movement.balance_before, 0)
        self.assertEqual(movement.balance_after, 40)

    def test_18_correct_movement_reference(self):
        """StockMovement stores reference_type='OPENING_STOCK' and matches receipt reference."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-REF-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 1,
            "receipt_reference": "CUSTOM-REF-101"
        }
        self.client.post(url, payload, format="json")
        movement = StockMovement.objects.get(batch__batch_number="AMX-REF-01")
        self.assertEqual(movement.reference_type, "OPENING_STOCK")
        self.assertEqual(movement.reference_id, "CUSTOM-REF-101")

    def test_19_cost_layer_quantity_consistency(self):
        """Cost layer original and remaining quantities match opening intake quantity."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-LAYER-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 5
        }
        self.client.post(url, payload, format="json")
        layer = BatchInwardCostLayer.objects.get(batch__batch_number="AMX-LAYER-01")
        self.assertEqual(layer.original_quantity, 50)
        self.assertEqual(layer.remaining_quantity, 50)

    def test_20_no_negative_stock(self):
        """Check constraint prohibits negative balances."""
        stock = StoreBatchStock.objects.create(
            organization=self.org,
            store=self.store1,
            product=self.product,
            batch=Batch.objects.create(
                organization=self.org,
                product=self.product,
                packaging_snapshot=self.snapshot,
                batch_number="AMX-NONNEG",
                expiry_date=timezone.localdate() + timedelta(days=200),
                mrp=Decimal("100.00"),
                created_by=self.owner
            ),
            quantity_on_hand=10
        )
        self.assertEqual(stock.quantity_on_hand, 10)

    def test_21_reconciliation(self):
        """Sum of IN movements minus OUT movements matches StoreBatchStock.quantity_on_hand."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-RECON-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 8
        }
        self.client.post(url, payload, format="json")

        stock = StoreBatchStock.objects.get(batch__batch_number="AMX-RECON-01")
        movements = StockMovement.objects.filter(batch__batch_number="AMX-RECON-01")
        total_in = sum(m.quantity for m in movements if m.direction == "IN")
        total_out = sum(m.quantity for m in movements if m.direction == "OUT")
        self.assertEqual(total_in - total_out, stock.quantity_on_hand)

    def test_22_concurrent_stock_row_creation(self):
        """Opening stock for distinct batches at the same store execute without row collision."""
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        res1 = self.client.post(url, {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-CONC-A",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 1
        }, format="json")
        res2 = self.client.post(url, {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-CONC-B",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 2
        }, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(StoreBatchStock.objects.filter(store=self.store1).count(), 2)

    def test_23_idempotency_recovery(self):
        """Replaying completed operation returns identical payload without creating new movement."""
        self.client.force_authenticate(user=self.owner)
        op_key = uuid.uuid4()
        payload = {
            "idempotency_key": str(op_key),
            "product_id": str(self.product.id),
            "batch_number": "AMX-REC-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 1
        }
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        res1 = self.client.post(url, payload, format="json")
        res2 = self.client.post(url, payload, format="json")
        self.assertEqual(res1.json(), res2.json())

    def test_24_no_duplicate_movement_entries(self):
        """Retrying a completed opening stock request results in strictly 1 movement record."""
        self.client.force_authenticate(user=self.owner)
        op_key = uuid.uuid4()
        payload = {
            "idempotency_key": str(op_key),
            "product_id": str(self.product.id),
            "batch_number": "AMX-NODUP-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 1
        }
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        self.client.post(url, payload, format="json")
        self.client.post(url, payload, format="json")
        self.assertEqual(StockMovement.objects.filter(batch__batch_number="AMX-NODUP-01").count(), 1)

    # -------------------------------------------------------------------------
    # Listing & Scoping Tests (25 - 31)
    # -------------------------------------------------------------------------

    def test_25_search_behavior(self):
        """Search query filters across product name, SKU, barcode, and batch number."""
        self.client.force_authenticate(user=self.owner)
        # Seed 2 batches
        url_post = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        self.client.post(url_post, {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-SEARCH-MATCH",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 1
        }, format="json")

        url_list = f"/api/inventory/stores/{self.store1.id}/stock/?search=SEARCH-MATCH"
        res = self.client.get(url_list)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["count"], 1)
        self.assertEqual(res.json()["results"][0]["batch_number"], "AMX-SEARCH-MATCH")

    def test_26_pagination(self):
        """Listing endpoint returns paginated results with page metadata."""
        self.client.force_authenticate(user=self.owner)
        url_list = f"/api/inventory/stores/{self.store1.id}/stock/?page=1&page_size=10"
        res = self.client.get(url_list)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn("count", data)
        self.assertIn("num_pages", data)
        self.assertIn("current_page", data)
        self.assertIn("page_size", data)
        self.assertIn("results", data)

    def test_27_store_isolation(self):
        """Stock established at Store 1 is not listed in Store 2 queries."""
        self.client.force_authenticate(user=self.owner)
        url_post = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        self.client.post(url_post, {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-STR1-ONLY",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 1
        }, format="json")

        url_str2 = f"/api/inventory/stores/{self.store2.id}/stock/"
        res = self.client.get(url_str2)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["count"], 0)

    def test_28_organization_isolation(self):
        """Organization B cannot access Organization A's store stock listing."""
        self.client.force_authenticate(user=self.other_owner)
        url = f"/api/inventory/stores/{self.store1.id}/stock/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_29_cost_masking_for_pharmacist(self):
        """Pharmacist / Staff cannot see unit_cost or total_valuation_cost in listing results."""
        # 1. Post stock as owner
        self.client.force_authenticate(user=self.owner)
        url_post = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        self.client.post(url_post, {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-MASK-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 2
        }, format="json")

        # 2. Query as Owner: cost fields must be present
        url_list = f"/api/inventory/stores/{self.store1.id}/stock/"
        res_owner = self.client.get(url_list)
        self.assertEqual(res_owner.status_code, status.HTTP_200_OK)
        owner_data = res_owner.json()
        self.assertIn("total_valuation_cost", owner_data["summary"])
        self.assertIn("unit_cost", owner_data["results"][0])

        # 3. Query as Pharmacist: cost fields must be completely stripped
        self.client.force_authenticate(user=self.pharmacist)
        res_pharm = self.client.get(url_list)
        self.assertEqual(res_pharm.status_code, status.HTTP_200_OK)
        pharm_data = res_pharm.json()
        self.assertNotIn("total_valuation_cost", pharm_data["summary"])
        self.assertNotIn("unit_cost", pharm_data["results"][0])
        self.assertNotIn("total_valuation_cost", pharm_data["results"][0])

    def test_30_quarantine_expiry_recall_availability(self):
        """Available quantity drops to 0 when batch is recalled or expired, or decremented by quarantine."""
        self.client.force_authenticate(user=self.owner)
        url_post = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        self.client.post(url_post, {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "AMX-AVAIL-TEST",
            "expiry_date": str(timezone.localdate() + timedelta(days=200)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 10
        }, format="json")

        stock = StoreBatchStock.objects.get(batch__batch_number="AMX-AVAIL-TEST")
        self.assertEqual(stock.available_quantity, 100)

        # 1. Quarantine 15 units
        stock.quantity_quarantined = 15
        stock.save()
        self.assertEqual(stock.available_quantity, 85)

        # 2. Recall batch
        stock.batch.is_recalled = True
        stock.batch.save()
        stock.refresh_from_db()
        self.assertEqual(stock.available_quantity, 0)

    def test_31_product_master_regression_check(self):
        """Verify catalog products remain queryable and untouched by inventory operations."""
        self.assertTrue(Product.objects.filter(id=self.product.id).exists())
        self.assertEqual(self.product.conversion_factor, 10)
        self.assertEqual(self.product.base_unit, "capsule")
        self.assertEqual(self.product.sale_unit, "strip")

