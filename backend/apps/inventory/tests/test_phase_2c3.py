import uuid
import threading
from decimal import Decimal
from datetime import timedelta
from django.db import connections, transaction
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
    AdjustmentApprovalPolicy,
    PhysicalStockCount,
    PhysicalStockCountItem,
    StockAdjustment,
)
from apps.inventory.services import StockLedgerService

User = get_user_model()


class Phase2C3Tests(TransactionTestCase):
    """
    Automated integration tests for Milestone 2C.3:
    Stock Adjustments, approval policies, separation of duties, FIFO cost layer consumption,
    physical stock count sessions, intervening movement reconciliation, and cost masking.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Organization & Owner
        self.owner = User.objects.create_user(
            email="owner_2c3@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Owner TwoC3"
        )
        self.org = Organization.objects.create(
            name="PharmaPro 2C3 Org",
            owner=self.owner,
            is_active=True
        )
        self.owner_membership = OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role="owner",
            is_active=True
        )

        # 2. Stores: Store 1 (Main)
        self.store1 = Store.objects.create(
            name="City Central Store",
            organization=self.org,
            code="STR-2C3-01",
            status="active"
        )

        # 3. Store Manager (assigned to Store 1)
        self.manager = User.objects.create_user(
            email="manager_2c3@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Manager City Store"
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.manager,
            role="manager",
            is_active=True
        )

        # Assistant Manager / Second Reviewer (for separation of duties testing)
        self.reviewer_mgr = User.objects.create_user(
            email="reviewer_mgr_2c3@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Reviewer Manager"
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.reviewer_mgr,
            role="manager",
            is_active=True
        )

        # 4. Pharmacist (assigned to Store 1, staff without cost viewing rights)
        self.pharmacist = User.objects.create_user(
            email="pharmacist_2c3@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Pharmacist City Store"
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.pharmacist,
            role="pharmacist",
            is_active=True
        )

        # 5. Product & Packaging Snapshot
        self.product = Product.objects.create(
            organization=self.org,
            name="Paracetamol 650mg Tablets",
            sku="PCM-650-TAB",
            barcode="8901234999999",
            category="Analgesics",
            base_unit="tablet",
            sale_unit="strip",
            conversion_factor=10,
            is_loose_dispensing_allowed=True,
            is_active=True
        )
        self.snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(self.product)

        # 6. Test Batch with 100 units on hand
        self.batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="BAT-PCM-2026",
            expiry_date=timezone.localdate() + timedelta(days=365),
            mrp=Decimal("30.00"),
            unit_mrp=Decimal("3.0000"),
            created_by=self.owner,
            status="active"
        )

        # Establish 100 base units of stock with cost layer (unit_cost = 2.0000)
        self.stock = StoreBatchStock.objects.create(
            organization=self.org,
            store=self.store1,
            product=self.product,
            batch=self.batch,
            quantity_on_hand=100,
            quantity_quarantined=0,
            low_stock_threshold=10
        )
        self.cost_layer1 = BatchInwardCostLayer.objects.create(
            organization=self.org,
            store=self.store1,
            batch=self.batch,
            receipt_type="OPENING_STOCK",
            receipt_reference="INIT-2C3-A",
            original_quantity=60,
            remaining_quantity=60,
            purchase_cost_per_sale_unit=Decimal("20.00"),
            unit_cost=Decimal("2.0000")
        )
        self.cost_layer2 = BatchInwardCostLayer.objects.create(
            organization=self.org,
            store=self.store1,
            batch=self.batch,
            receipt_type="PURCHASE_RECEIPT",
            receipt_reference="INIT-2C3-B",
            original_quantity=40,
            remaining_quantity=40,
            purchase_cost_per_sale_unit=Decimal("25.00"),
            unit_cost=Decimal("2.5000")
        )

    # -------------------------------------------------------------------------
    # 1. Stock Adjustment Creation & Validation
    # -------------------------------------------------------------------------

    def test_create_adjustment_request_success(self):
        """Pharmacist or Store Manager can create a valid adjustment request."""
        self.client.force_authenticate(user=self.manager)
        payload = {
            "store_id": str(self.store1.id),
            "product_id": str(self.product.id),
            "batch_id": str(self.batch.id),
            "adjustment_quantity": -10,  # 10 units broken
            "reason_code": "DAMAGE",
            "explanation": "Broken blister pack discovered during morning shelf check."
        }
        res = self.client.post("/api/inventory/adjustments/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()

        self.assertTrue(data["adjustment_number"].startswith("ADJ-"))
        self.assertEqual(data["status"], "SUBMITTED")
        self.assertEqual(data["system_quantity_at_request"], 100)
        self.assertEqual(data["adjustment_quantity"], -10)
        self.assertEqual(data["resulting_quantity"], 90)
        self.assertEqual(data["reason_code"], "DAMAGE")
        # Valuation: 10 units * latest unit_cost (2.5000) = 25.00
        self.assertEqual(Decimal(data["calculated_valuation"]), Decimal("25.00"))

    def test_create_adjustment_zero_quantity_rejected(self):
        """Adjustment quantity cannot be zero."""
        self.client.force_authenticate(user=self.manager)
        payload = {
            "store_id": str(self.store1.id),
            "product_id": str(self.product.id),
            "batch_id": str(self.batch.id),
            "adjustment_quantity": 0,
            "reason_code": "CORRECTION",
            "explanation": "Testing zero quantity."
        }
        res = self.client.post("/api/inventory/adjustments/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot be zero", str(res.json()))

    def test_create_adjustment_excessive_negative_rejected(self):
        """Adjustment resulting in negative stock balance must be rejected."""
        self.client.force_authenticate(user=self.manager)
        payload = {
            "store_id": str(self.store1.id),
            "product_id": str(self.product.id),
            "batch_id": str(self.batch.id),
            "adjustment_quantity": -150,  # Only 100 on hand
            "reason_code": "PHYSICAL_SHORTAGE",
            "explanation": "Attempting to deduct more stock than on hand."
        }
        res = self.client.post("/api/inventory/adjustments/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("negative physical stock", str(res.json()))

    # -------------------------------------------------------------------------
    # 2. Separation of Duties & Approval Policy
    # -------------------------------------------------------------------------

    def _create_submitted_adjustment(self, qty=-15, reason="DAMAGE", requester=None):
        req_user = requester or self.manager
        adj = StockAdjustment.objects.create(
            organization=self.org,
            store=self.store1,
            adjustment_number=f"ADJ-{uuid.uuid4().hex[:8].upper()}",
            product=self.product,
            batch=self.batch,
            packaging_snapshot=self.snapshot,
            system_quantity_at_request=100,
            adjustment_quantity=qty,
            resulting_quantity=100 + qty,
            reason_code=reason,
            explanation="Adjustment under test.",
            status="SUBMITTED",
            unit_cost_basis=Decimal("2.0000"),
            calculated_valuation=Decimal(abs(qty) * 2),
            requested_by=req_user
        )
        return adj

    def test_separation_of_duties_self_approval_blocked(self):
        """Requester is strictly forbidden from approving their own adjustment."""
        adj = self._create_submitted_adjustment(requester=self.manager)
        self.client.force_authenticate(user=self.manager)  # Manager tries to approve self

        res = self.client.post(
            f"/api/inventory/adjustments/{adj.id}/review/",
            {"decision": "APPROVE", "review_notes": "Self approval attempt"},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Separation of duties violation", res.json()["detail"])

    def test_unconfigured_policy_blocks_store_manager_from_writeoff(self):
        """Under unconfigured approval policy, write-offs strictly require Owner approval."""
        adj = self._create_submitted_adjustment(reason="DAMAGE", requester=self.pharmacist)
        self.client.force_authenticate(user=self.manager)  # Manager tries to approve write-off

        res = self.client.post(
            f"/api/inventory/adjustments/{adj.id}/review/",
            {"decision": "APPROVE", "review_notes": "Manager approving write-off"},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("strictly require Organization Owner approval", res.json()["detail"])

    def test_owner_can_approve_writeoff(self):
        """Organization Owner can successfully approve write-off adjustments."""
        adj = self._create_submitted_adjustment(reason="DAMAGE", requester=self.manager)
        self.client.force_authenticate(user=self.owner)  # Owner approves

        res = self.client.post(
            f"/api/inventory/adjustments/{adj.id}/review/",
            {"decision": "APPROVE", "review_notes": "Authorized by Owner after inspection"},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        adj.refresh_from_db()
        self.assertEqual(adj.status, "APPROVED")
        self.assertEqual(adj.reviewed_by, self.owner)

    def test_rejection_workflow(self):
        """Reviewer can reject adjustment request with explanatory notes."""
        adj = self._create_submitted_adjustment(requester=self.pharmacist)
        self.client.force_authenticate(user=self.manager)

        res = self.client.post(
            f"/api/inventory/adjustments/{adj.id}/review/",
            {"decision": "REJECT", "review_notes": "Insufficient evidence provided for breakage."},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        adj.refresh_from_db()
        self.assertEqual(adj.status, "REJECTED")
        self.assertEqual(adj.review_notes, "Insufficient evidence provided for breakage.")

    # -------------------------------------------------------------------------
    # 3. Posting & Ledger Integration
    # -------------------------------------------------------------------------

    def test_cannot_post_unapproved_adjustment(self):
        """Attempting to post an adjustment in SUBMITTED state must fail."""
        adj = self._create_submitted_adjustment(requester=self.pharmacist)
        self.client.force_authenticate(user=self.manager)

        key = str(uuid.uuid4())
        res = self.client.post(
            f"/api/inventory/adjustments/{adj.id}/post/",
            {},
            HTTP_IDEMPOTENCY_KEY=key,
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Approval is required before posting", str(res.json()))

    def test_post_negative_adjustment_depletes_fifo_cost_layers(self):
        """Posting negative write-off decrements physical stock and depletes FIFO cost layers."""
        # Request 70 units write-off (layer1 has 60 @ 2.00, layer2 has 40 @ 2.50)
        adj = self._create_submitted_adjustment(qty=-70, reason="DAMAGE", requester=self.pharmacist)
        adj.status = "APPROVED"
        adj.save()

        self.client.force_authenticate(user=self.manager)
        key = str(uuid.uuid4())
        res = self.client.post(
            f"/api/inventory/adjustments/{adj.id}/post/",
            {},
            HTTP_IDEMPOTENCY_KEY=key,
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Physical stock: 100 - 70 = 30
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_on_hand, 30)

        # FIFO layers: layer1 (60 units) fully depleted; layer2 (40 units) depleted by 10 (remaining: 30)
        self.cost_layer1.refresh_from_db()
        self.cost_layer2.refresh_from_db()
        self.assertEqual(self.cost_layer1.remaining_quantity, 0)
        self.assertEqual(self.cost_layer2.remaining_quantity, 30)

        # Ledger movement: DAMAGE_WRITEOFF of 70 units
        movement = StockMovement.objects.filter(
            store=self.store1,
            batch=self.batch,
            movement_type="DAMAGE_WRITEOFF"
        ).first()
        self.assertIsNotNone(movement)
        self.assertEqual(movement.direction, "OUT")
        self.assertEqual(movement.quantity, 70)
        self.assertEqual(movement.balance_before, 100)
        self.assertEqual(movement.balance_after, 30)

    def test_post_positive_adjustment_creates_cost_layer(self):
        """Posting positive surplus adjustment increments on-hand and creates FIFO cost layer."""
        adj = self._create_submitted_adjustment(qty=25, reason="VERIFIED_SURPLUS", requester=self.pharmacist)
        adj.status = "APPROVED"
        adj.save()

        self.client.force_authenticate(user=self.manager)
        key = str(uuid.uuid4())
        res = self.client.post(
            f"/api/inventory/adjustments/{adj.id}/post/",
            {},
            HTTP_IDEMPOTENCY_KEY=key,
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Physical balance: 100 + 25 = 125
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_on_hand, 125)

        # New inward cost layer created
        new_layer = BatchInwardCostLayer.objects.filter(
            store=self.store1,
            batch=self.batch,
            receipt_type="ADJUSTMENT_ADD"
        ).first()
        self.assertIsNotNone(new_layer)
        self.assertEqual(new_layer.original_quantity, 25)
        self.assertEqual(new_layer.remaining_quantity, 25)

        # StockMovement appended
        mvt = StockMovement.objects.filter(
            store=self.store1,
            batch=self.batch,
            movement_type="ADJUSTMENT_ADD"
        ).first()
        self.assertIsNotNone(mvt)
        self.assertEqual(mvt.direction, "IN")
        self.assertEqual(mvt.quantity, 25)
        self.assertEqual(mvt.balance_after, 125)

    def test_post_adjustment_idempotency(self):
        """Duplicate post calls with identical idempotency key return cached replay."""
        adj = self._create_submitted_adjustment(qty=10, reason="VERIFIED_SURPLUS", requester=self.pharmacist)
        adj.status = "APPROVED"
        adj.save()

        self.client.force_authenticate(user=self.manager)
        key = str(uuid.uuid4())
        res1 = self.client.post(f"/api/inventory/adjustments/{adj.id}/post/", {}, HTTP_IDEMPOTENCY_KEY=key, format="json")
        res2 = self.client.post(f"/api/inventory/adjustments/{adj.id}/post/", {}, HTTP_IDEMPOTENCY_KEY=key, format="json")

        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.json(), res2.json())

        # Physical balance only credited ONCE (100 + 10 = 110)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_on_hand, 110)

    # -------------------------------------------------------------------------
    # 4. Physical Stock Count & Intervening Movement Reconciliation
    # -------------------------------------------------------------------------

    def test_start_physical_count_session(self):
        """Initiating a count session locks snapshot_system_quantity."""
        self.client.force_authenticate(user=self.manager)
        payload = {
            "store_id": str(self.store1.id),
            "count_type": "CYCLE_COUNT",
            "notes": "Weekly analgesics count."
        }
        res = self.client.post("/api/inventory/stock-counts/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()

        self.assertTrue(data["count_number"].startswith("CNT-"))
        self.assertEqual(data["status"], "IN_PROGRESS")
        self.assertEqual(len(data["items"]), 1)
        item_data = data["items"][0]
        self.assertEqual(item_data["snapshot_system_quantity"], 100)
        self.assertIsNone(item_data["counted_quantity"])

    def test_record_counts_and_reconcile_with_intervening_movement(self):
        """
        Intervening stock movements between snapshot and count submission
        are accurately reconciled so no valid sales or receipts are overwritten.
        """
        # 1. Start count session at T0 (snapshot on-hand = 100)
        count_session = StockLedgerService.start_physical_stock_count(
            store=self.store1,
            actor=self.manager,
            count_number=f"CNT-{uuid.uuid4().hex[:8].upper()}"
        )
        count_item = count_session.items.first()
        self.assertEqual(count_item.snapshot_system_quantity, 100)

        # 2. Simulate an intervening sale of 20 units at T1
        # Shelf now physically has 80 units, and on-hand balance is updated to 80
        self.stock.quantity_on_hand = 80
        self.stock.save()
        StockMovement.objects.create(
            organization=self.org,
            store=self.store1,
            batch=self.batch,
            product=self.product,
            movement_type="SALE",
            direction="OUT",
            quantity=20,
            balance_before=100,
            balance_after=80,
            unit_cost=Decimal("2.0000"),
            unit_mrp=Decimal("3.0000"),
            reference_type="POS_SALE",
            reference_id="INV-001",
            actor=self.pharmacist
        )

        # 3. Counter visits shelf at T2 and counts 80 units
        self.client.force_authenticate(user=self.pharmacist)
        rec_payload = {
            "items": [
                {
                    "item_id": str(count_item.id),
                    "counted_quantity": 80,
                    "notes": "Verified 80 intact tablets."
                }
            ]
        }
        res_rec = self.client.post(f"/api/inventory/stock-counts/{count_session.id}/record/", rec_payload, format="json")
        self.assertEqual(res_rec.status_code, status.HTTP_200_OK)

        # 4. Manager reconciles count at T3
        self.client.force_authenticate(user=self.manager)
        res_recon = self.client.post(f"/api/inventory/stock-counts/{count_session.id}/reconcile/", {}, format="json")
        self.assertEqual(res_recon.status_code, status.HTTP_200_OK)

        count_item.refresh_from_db()
        count_session.refresh_from_db()

        # Intervening movement (-20) was detected!
        self.assertEqual(count_item.intervening_movement_quantity, -20)
        # Expected benchmark = 100 + (-20) = 80
        self.assertEqual(count_item.reconciled_system_quantity, 80)
        # Calculated variance = 80 - 80 = 0 (No false discrepancy generated!)
        self.assertEqual(count_item.variance_quantity, 0)
        self.assertEqual(count_item.status, "RECONCILED")
        self.assertEqual(count_session.status, "RECONCILED")

    def test_reconciliation_detects_real_shortage(self):
        """When a real shortage exists beyond intervening movements, variance is calculated."""
        count_session = StockLedgerService.start_physical_stock_count(
            store=self.store1,
            actor=self.manager,
            count_number=f"CNT-{uuid.uuid4().hex[:8].upper()}"
        )
        count_item = count_session.items.first()

        # Counter counted 92 units (8 units missing) with zero intervening movements
        StockLedgerService.record_count_quantities(
            stock_count=count_session,
            actor=self.pharmacist,
            items_data=[{"item_id": str(count_item.id), "counted_quantity": 92}]
        )

        # Reconcile
        StockLedgerService.reconcile_physical_stock_count(stock_count=count_session, actor=self.manager)

        count_item.refresh_from_db()
        self.assertEqual(count_item.variance_quantity, -8)

        # Generate adjustments from count session
        self.client.force_authenticate(user=self.manager)
        res_adj = self.client.post(f"/api/inventory/stock-counts/{count_session.id}/generate-adjustments/", {}, format="json")
        self.assertEqual(res_adj.status_code, status.HTTP_201_CREATED)

        adj = StockAdjustment.objects.filter(count_item=count_item).first()
        self.assertIsNotNone(adj)
        self.assertEqual(adj.adjustment_quantity, -8)
        self.assertEqual(adj.reason_code, "PHYSICAL_SHORTAGE")
        self.assertEqual(adj.status, "SUBMITTED")

    # -------------------------------------------------------------------------
    # 5. Cost Masking Tests
    # -------------------------------------------------------------------------

    def test_cost_masking_for_pharmacist_on_adjustments(self):
        """Pharmacists and staff cannot view unit_cost_basis or calculated_valuation."""
        adj = self._create_submitted_adjustment(qty=-5, reason="DAMAGE", requester=self.manager)
        self.client.force_authenticate(user=self.pharmacist)

        res = self.client.get(f"/api/inventory/adjustments/{adj.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        self.assertNotIn("unit_cost_basis", data)
        self.assertNotIn("calculated_valuation", data)

    def test_cost_visible_for_store_manager_and_owner(self):
        """Store Managers and Owners have visibility into cost valuation."""
        adj = self._create_submitted_adjustment(qty=-5, reason="DAMAGE", requester=self.pharmacist)

        self.client.force_authenticate(user=self.manager)
        res_mgr = self.client.get(f"/api/inventory/adjustments/{adj.id}/")
        self.assertEqual(res_mgr.status_code, status.HTTP_200_OK)
        self.assertIn("unit_cost_basis", res_mgr.json())
        self.assertIn("calculated_valuation", res_mgr.json())

        self.client.force_authenticate(user=self.owner)
        res_own = self.client.get(f"/api/inventory/adjustments/{adj.id}/")
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)
        self.assertIn("unit_cost_basis", res_own.json())
        self.assertIn("calculated_valuation", res_own.json())
