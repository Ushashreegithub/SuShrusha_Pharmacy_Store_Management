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
    StockTransfer,
    StockTransferItem,
    StoreExpiryPolicy,
    StockQuarantineRecord,
    BatchRecall,
)
from apps.inventory.services import StockLedgerService

User = get_user_model()


class Phase2C4Tests(TransactionTestCase):
    """
    Automated integration tests for Milestone 2C.4:
    Batch Safety, Expiry control, FEFO batch selection, Store-level Expiry Policies,
    Quarantine Management (hold, release, disposition), and Multi-Store Batch Recall Controls.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Organization & Owner
        self.owner = User.objects.create_user(
            email="owner_2c4@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Owner TwoC4"
        )
        self.org = Organization.objects.create(
            name="PharmaPro 2C4 Safety Org",
            owner=self.owner,
            is_active=True
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role="owner",
            is_active=True
        )

        # 2. Stores: Store 1 (Main) & Store 2 (Branch)
        self.store1 = Store.objects.create(
            name="Alpha Central Store",
            organization=self.org,
            code="STR-2C4-01",
            status="active"
        )
        self.store2 = Store.objects.create(
            name="Beta Suburb Store",
            organization=self.org,
            code="STR-2C4-02",
            status="active"
        )

        # 3. Store Manager (assigned to Store 1)
        self.manager = User.objects.create_user(
            email="manager_2c4@PharmaPro.test",
            password="StrongPassword123!",
            full_name="Manager Alpha"
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.manager,
            role="manager",
            is_active=True
        )

        # 4. Pharmacist (Store 1)
        self.pharmacist = User.objects.create_user(
            email="pharmacist_2c4@PharmaPro.test",
            password="StrongPassword123!",
            full_name="Pharmacist Alpha"
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.pharmacist,
            role="pharmacist",
            is_active=True
        )

        # 5. Cashier (Store 1)
        self.cashier = User.objects.create_user(
            email="cashier_2c4@PharmaPro.test",
            password="StrongPassword123!",
            full_name="Cashier Alpha"
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.cashier,
            role="cashier",
            is_active=True
        )

        # 6. Cross-Organization User
        self.cross_owner = User.objects.create_user(
            email="cross_2c4@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Competitor Owner"
        )
        self.cross_org = Organization.objects.create(
            name="Competitor Pharma",
            owner=self.cross_owner,
            is_active=True
        )
        OrganizationMembership.objects.create(
            organization=self.cross_org,
            user=self.cross_owner,
            role="owner",
            is_active=True
        )

        # 7. Catalog Product & Packaging Snapshot
        self.product = Product.objects.create(
            organization=self.org,
            name="Amoxicillin 500mg Capsules",
            sku="AMOX-500-2C4",
            barcode="8901234567890",
            category="Antibiotics",
            base_unit="capsule",
            sale_unit="strip",
            conversion_factor=10,
            is_loose_dispensing_allowed=True,
            is_active=True
        )
        self.snapshot = ProductPackagingSnapshot.objects.create(
            product=self.product,
            version=1,
            base_unit="capsule",
            sale_unit="strip",
            conversion_factor=10,
            is_loose_dispensing_allowed=True,
            pack_description="Strip of 10 Capsules"
        )

    def _create_batch_and_stock(self, store, batch_number, expiry_date, on_hand=100, quarantined=0, is_recalled=False):
        """Helper to create a batch and store stock balance."""
        b = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number=batch_number,
            expiry_date=expiry_date,
            mrp=Decimal("50.00"),
            unit_mrp=Decimal("5.00"),
            is_recalled=is_recalled,
            status="recalled" if is_recalled else "active",
            created_by=self.owner
        )
        s = StoreBatchStock.objects.create(
            organization=self.org,
            store=store,
            product=self.product,
            batch=b,
            quantity_on_hand=on_hand,
            quantity_quarantined=quarantined
        )
        if on_hand > 0:
            BatchInwardCostLayer.objects.create(
                organization=self.org,
                store=store,
                batch=b,
                receipt_type="OPENING_STOCK",
                receipt_reference="INIT",
                original_quantity=on_hand,
                remaining_quantity=on_hand,
                purchase_cost_per_sale_unit=Decimal("30.00"),
                unit_cost=Decimal("3.00")
            )
        return b, s

    def test_expiry_status_boundaries(self):
        """Test dynamic calculation of batch expiry status across warning and critical thresholds."""
        today = timezone.localdate()

        # Batch 1: Expired today
        b_exp, _ = self._create_batch_and_stock(self.store1, "LOT-EXP-01", today)
        status_code, days = b_exp.get_expiry_status(warning_days=90, critical_days=30, today=today)
        self.assertEqual(status_code, "EXPIRED")
        self.assertEqual(days, 0)
        self.assertTrue(b_exp.is_expired)

        # Batch 2: Critical near-expiry (15 days remaining)
        b_crit, _ = self._create_batch_and_stock(self.store1, "LOT-CRIT-01", today + timedelta(days=15))
        status_code, days = b_crit.get_expiry_status(warning_days=90, critical_days=30, today=today)
        self.assertEqual(status_code, "CRITICAL_NEAR_EXPIRY")
        self.assertEqual(days, 15)
        self.assertFalse(b_crit.is_expired)

        # Batch 3: Warning near-expiry (60 days remaining)
        b_warn, _ = self._create_batch_and_stock(self.store1, "LOT-WARN-01", today + timedelta(days=60))
        status_code, days = b_warn.get_expiry_status(warning_days=90, critical_days=30, today=today)
        self.assertEqual(status_code, "WARNING_NEAR_EXPIRY")
        self.assertEqual(days, 60)

        # Batch 4: Safe / Normal (180 days remaining)
        b_safe, _ = self._create_batch_and_stock(self.store1, "LOT-SAFE-01", today + timedelta(days=180))
        status_code, days = b_safe.get_expiry_status(warning_days=90, critical_days=30, today=today)
        self.assertEqual(status_code, "SAFE")
        self.assertEqual(days, 180)

    def test_fefo_batch_selection_api(self):
        """Verify FEFO batch selection orders strictly by expiry_date and omits recalled/expired stock."""
        today = timezone.localdate()

        # Create multiple batches
        b_exp, _ = self._create_batch_and_stock(self.store1, "LOT-EXPIRED", today - timedelta(days=1), on_hand=50)
        b_rec, _ = self._create_batch_and_stock(self.store1, "LOT-RECALLED", today + timedelta(days=100), on_hand=50, is_recalled=True)
        b_soon, _ = self._create_batch_and_stock(self.store1, "LOT-SOON", today + timedelta(days=40), on_hand=30)
        b_later, _ = self._create_batch_and_stock(self.store1, "LOT-LATER", today + timedelta(days=150), on_hand=50)

        self.client.force_authenticate(user=self.pharmacist)
        res = self.client.get(
            f"/api/inventory/stores/{self.store1.id}/products/{self.product.id}/fefo/?required_quantity=45"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data["results"]

        # Expired and recalled must be completely excluded!
        batch_numbers = [r["batch_number"] for r in results]
        self.assertNotIn("LOT-EXPIRED", batch_numbers)
        self.assertNotIn("LOT-RECALLED", batch_numbers)
        self.assertEqual(batch_numbers, ["LOT-SOON", "LOT-LATER"])

        # Check candidate allocations (30 from LOT-SOON, 15 from LOT-LATER for required 45)
        self.assertEqual(results[0]["allocated_quantity"], 30)
        self.assertEqual(results[1]["allocated_quantity"], 15)

    def test_quarantine_stock_hold_and_movement(self):
        """Verify quarantining stock increments quarantine counter, leaves on-hand unchanged, and appends HOLD movement."""
        today = timezone.localdate()
        b, stock = self._create_batch_and_stock(self.store1, "LOT-QHOLD-01", today + timedelta(days=120), on_hand=100, quarantined=0)

        self.client.force_authenticate(user=self.pharmacist)
        res = self.client.post("/api/inventory/quarantine/", {
            "store_id": str(self.store1.id),
            "batch_id": str(b.id),
            "quantity": 25,
            "reason_code": "TEMPERATURE_EXCURSION",
            "notes": "Fridge temperature logged at 15C for 4 hours.",
            "evidence_metadata": {"logger_id": "TEMP-LOG-99", "max_temp": 15.2}
        }, format="json")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.data
        self.assertEqual(data["current_on_hand"], 100)
        self.assertEqual(data["current_quarantined"], 25)
        self.assertEqual(data["current_available"], 75)

        stock.refresh_from_db()
        self.assertEqual(stock.quantity_on_hand, 100)
        self.assertEqual(stock.quantity_quarantined, 25)
        self.assertEqual(stock.available_quantity, 75)

        # Check StockMovement
        mvt = StockMovement.objects.filter(reference_type="QUARANTINE_RECORD").first()
        self.assertIsNotNone(mvt)
        self.assertEqual(mvt.movement_type, "QUARANTINE_HOLD")
        self.assertEqual(mvt.direction, "HOLD")
        self.assertEqual(mvt.quantity, 25)
        self.assertEqual(mvt.quarantine_before, 0)
        self.assertEqual(mvt.quarantine_after, 25)

    def test_quarantine_release_partial_and_full(self):
        """Verify releasing quarantine updates balances and transitions status to RELEASED upon full release."""
        today = timezone.localdate()
        b, stock = self._create_batch_and_stock(self.store1, "LOT-QREL-01", today + timedelta(days=120), on_hand=100, quarantined=40)

        quar_record = StockQuarantineRecord.objects.create(
            organization=self.org,
            store=self.store1,
            batch=b,
            product=self.product,
            quarantine_number="QRN-20261026-TEST",
            quantity_quarantined=40,
            reason_code="AMBIGUOUS_IDENTITY",
            notes="Labeling defect suspected.",
            quarantined_by=self.pharmacist
        )

        # Partial release of 15 units by Store Manager
        self.client.force_authenticate(user=self.manager)
        res1 = self.client.post(f"/api/inventory/quarantine/{quar_record.id}/release/", {
            "release_quantity": 15,
            "release_reason": "First 15 boxes verified with manufacturer certificate of analysis."
        }, format="json")

        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        quar_record.refresh_from_db()
        stock.refresh_from_db()
        self.assertEqual(quar_record.status, "ACTIVE")
        self.assertEqual(quar_record.quantity_quarantined, 25)
        self.assertEqual(stock.quantity_quarantined, 25)
        self.assertEqual(stock.available_quantity, 75)

        # Full release of remaining 25 units
        res2 = self.client.post(f"/api/inventory/quarantine/{quar_record.id}/release/", {
            "release_quantity": 25,
            "release_reason": "Remaining units inspected and cleared."
        }, format="json")

        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        quar_record.refresh_from_db()
        stock.refresh_from_db()
        self.assertEqual(quar_record.status, "RELEASED")
        self.assertEqual(stock.quantity_quarantined, 0)
        self.assertEqual(stock.available_quantity, 100)

    def test_quarantine_release_rejected_if_recalled_or_expired(self):
        """Verify release from quarantine is rejected if the batch was recalled or expired."""
        today = timezone.localdate()
        b, stock = self._create_batch_and_stock(self.store1, "LOT-QFAIL-01", today - timedelta(days=1), on_hand=50, quarantined=50)

        quar_record = StockQuarantineRecord.objects.create(
            organization=self.org,
            store=self.store1,
            batch=b,
            product=self.product,
            quarantine_number="QRN-20261026-FAIL1",
            quantity_quarantined=50,
            reason_code="OTHER",
            quarantined_by=self.manager
        )

        self.client.force_authenticate(user=self.manager)
        # Attempt release on expired batch
        res = self.client.post(f"/api/inventory/quarantine/{quar_record.id}/release/", {
            "release_quantity": 50,
            "release_reason": "Attempting illegal release."
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", res.data["detail"].lower())

    def test_quarantine_disposition_writeoff_depletes_fifo_cost(self):
        """Verify quarantine write-off reduces on-hand, clears quarantine, and depletes FIFO cost layers."""
        today = timezone.localdate()
        b, stock = self._create_batch_and_stock(self.store1, "LOT-QDISP-01", today + timedelta(days=120), on_hand=30, quarantined=30)

        quar_record = StockQuarantineRecord.objects.create(
            organization=self.org,
            store=self.store1,
            batch=b,
            product=self.product,
            quarantine_number="QRN-20261026-DISP",
            quantity_quarantined=30,
            reason_code="DAMAGED",
            notes="Water leakage in storeroom destroyed packaging.",
            quarantined_by=self.manager
        )

        self.client.force_authenticate(user=self.manager)
        res = self.client.post(f"/api/inventory/quarantine/{quar_record.id}/dispose/", {
            "disposition_type": "WRITTEN_OFF",
            "notes": "Witnessed destruction per pharma waste compliance protocols."
        }, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        quar_record.refresh_from_db()
        stock.refresh_from_db()

        self.assertEqual(quar_record.status, "WRITTEN_OFF")
        self.assertEqual(stock.quantity_on_hand, 0)
        self.assertEqual(stock.quantity_quarantined, 0)

        # Verify FIFO layer depleted
        layer = BatchInwardCostLayer.objects.get(batch=b, store=self.store1)
        self.assertEqual(layer.remaining_quantity, 0)

        # Check outward movement
        mvt = StockMovement.objects.filter(reference_type="QUARANTINE_RECORD", movement_type="DAMAGE_WRITEOFF").first()
        self.assertIsNotNone(mvt)
        self.assertEqual(mvt.direction, "OUT")
        self.assertEqual(mvt.quantity, 30)

    def test_batch_recall_multi_store_auto_quarantine(self):
        """Verify organization-wide batch recall halts availability across all branches and auto-quarantines on-hand stock."""
        today = timezone.localdate()
        # Batch exists in both Store 1 (50 units) and Store 2 (30 units)
        b = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="LOT-MULTI-RECALL",
            expiry_date=today + timedelta(days=200),
            mrp=Decimal("50.00"),
            unit_mrp=Decimal("5.00"),
            created_by=self.owner
        )
        s1 = StoreBatchStock.objects.create(
            organization=self.org,
            store=self.store1,
            product=self.product,
            batch=b,
            quantity_on_hand=50,
            quantity_quarantined=0
        )
        s2 = StoreBatchStock.objects.create(
            organization=self.org,
            store=self.store2,
            product=self.product,
            batch=b,
            quantity_on_hand=30,
            quantity_quarantined=0
        )

        self.client.force_authenticate(user=self.owner)
        res = self.client.post("/api/inventory/recalls/", {
            "batch_id": str(b.id),
            "source": "REGULATOR",
            "severity": "CLASS_1_CRITICAL",
            "reason": "CDSCO circular: Sub-standard dissolution profile detected in central testing.",
            "evidence_references": {"circular_number": "CDSCO-2026-9081", "lab_ref": "CENTRAL-LAB-22"},
            "auto_quarantine_stock": True
        }, format="json")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        recall_data = res.data
        self.assertEqual(recall_data["affected_stores_count"], 2)
        self.assertEqual(recall_data["affected_quantity_on_hand"], 80)
        self.assertEqual(recall_data["status"], "QUARANTINED_ALL")

        # Verify batch flag
        b.refresh_from_db()
        self.assertTrue(b.is_recalled)
        self.assertEqual(b.status, "recalled")

        # Verify Store 1 and Store 2 stocks are quarantined and available drops to 0
        s1.refresh_from_db()
        s2.refresh_from_db()
        self.assertEqual(s1.quantity_quarantined, 50)
        self.assertEqual(s1.available_quantity, 0)
        self.assertEqual(s2.quantity_quarantined, 30)
        self.assertEqual(s2.available_quantity, 0)

    def test_recalled_batch_blocks_transfer_dispatch(self):
        """Verify transfer dispatch is immediately blocked when attempting to dispatch a recalled batch."""
        today = timezone.localdate()
        b, _ = self._create_batch_and_stock(self.store1, "LOT-REC-DISP", today + timedelta(days=120), on_hand=100, is_recalled=True)

        trf = StockTransfer.objects.create(
            organization=self.org,
            transfer_number="TRF-2C4-0001",
            source_store=self.store1,
            destination_store=self.store2,
            status="APPROVED",
            requested_by=self.manager
        )
        StockTransferItem.objects.create(
            transfer=trf,
            product=self.product,
            batch=b,
            packaging_snapshot=self.snapshot,
            quantity_requested=20,
            quantity_dispatched=0,
            unit_cost=Decimal("3.00"),
            unit_mrp=Decimal("5.00")
        )

        self.client.force_authenticate(user=self.manager)
        res = self.client.post(
            f"/api/inventory/transfers/{trf.id}/dispatch/",
            {},
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("recalled", res.data["detail"].lower())

    def test_in_transit_transfer_auto_quarantines_on_arrival_if_recalled(self):
        """Verify stock recalled during transit is auto-quarantined at destination on receipt."""
        today = timezone.localdate()
        b, s1 = self._create_batch_and_stock(self.store1, "LOT-TRANSIT-REC", today + timedelta(days=120), on_hand=50)

        trf = StockTransfer.objects.create(
            organization=self.org,
            transfer_number="TRF-2C4-0002",
            source_store=self.store1,
            destination_store=self.store2,
            status="DISPATCHED",
            requested_by=self.manager,
            dispatched_by=self.manager,
            dispatched_at=timezone.now()
        )
        it = StockTransferItem.objects.create(
            transfer=trf,
            product=self.product,
            batch=b,
            packaging_snapshot=self.snapshot,
            quantity_requested=20,
            quantity_dispatched=20,
            unit_cost=Decimal("3.00"),
            unit_mrp=Decimal("5.00")
        )

        # Batch is recalled while items are physically on the delivery truck
        b.is_recalled = True
        b.recall_reason = "Emergency recall notice issued mid-transit."
        b.save(update_fields=["is_recalled", "recall_reason"])

        # Destination store receives the package
        self.client.force_authenticate(user=self.owner)
        res = self.client.post(
            f"/api/inventory/transfers/{trf.id}/receive/",
            {"receipt_lines": [{"item_id": str(it.id), "quantity_received": 20}]},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Destination stock balance: on-hand = 20, quarantined = 20, available = 0!
        dest_stock = StoreBatchStock.objects.get(store=self.store2, batch=b)
        self.assertEqual(dest_stock.quantity_on_hand, 20)
        self.assertEqual(dest_stock.quantity_quarantined, 20)
        self.assertEqual(dest_stock.available_quantity, 0)

        # Auto-generated quarantine record created
        quar = StockQuarantineRecord.objects.filter(store=self.store2, batch=b).first()
        self.assertIsNotNone(quar)
        self.assertEqual(quar.reason_code, "RECALL")
        self.assertEqual(quar.quantity_quarantined, 20)

    def test_recall_release_requires_owner_and_retains_quarantines(self):
        """Verify only Owner can release a recall, and releasing recall clears is_recalled while preserving quarantine records."""
        today = timezone.localdate()
        b, _ = self._create_batch_and_stock(self.store1, "LOT-REL-TEST", today + timedelta(days=120), on_hand=30, is_recalled=True)

        recall = BatchRecall.objects.create(
            organization=self.org,
            recall_number="RCL-20261026-REL1",
            batch=b,
            product=self.product,
            source="MANUFACTURER",
            severity="CLASS_2_MAJOR",
            reason="Sample testing false alarm.",
            status="INITIATED",
            initiated_by=self.owner
        )

        # Non-owner manager cannot release recall
        self.client.force_authenticate(user=self.manager)
        res_m = self.client.post(f"/api/inventory/recalls/{recall.id}/release/", {
            "resolution_notes": "Manager attempt."
        }, format="json")
        self.assertEqual(res_m.status_code, status.HTTP_403_FORBIDDEN)

        # Owner releases recall
        self.client.force_authenticate(user=self.owner)
        res_o = self.client.post(f"/api/inventory/recalls/{recall.id}/release/", {
            "resolution_notes": "Manufacturer provided proof of batch authenticity and official withdrawal of recall notice."
        }, format="json")
        self.assertEqual(res_o.status_code, status.HTTP_200_OK)

        recall.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual(recall.status, "RELEASED")
        self.assertFalse(b.is_recalled)
        self.assertEqual(b.status, "active")

    def test_cross_organization_quarantine_rejection(self):
        """Verify cross-organization access to quarantine and recall endpoints is strictly denied."""
        today = timezone.localdate()
        b, _ = self._create_batch_and_stock(self.store1, "LOT-CROSS-01", today + timedelta(days=120), on_hand=50)

        # Competitor owner tries to quarantine stock in self.org's store
        self.client.force_authenticate(user=self.cross_owner)
        res = self.client.post("/api/inventory/quarantine/", {
            "store_id": str(self.store1.id),
            "batch_id": str(b.id),
            "quantity": 10,
            "reason_code": "OTHER",
        }, format="json")

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

