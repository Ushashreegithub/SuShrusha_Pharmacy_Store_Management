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
    StockTransfer,
    StockTransferItem,
    TransferDiscrepancy,
)
from apps.inventory.services import StockLedgerService

User = get_user_model()


class Phase2C2Tests(TransactionTestCase):
    """
    Automated integration tests for Milestone 2C.2:
    Inter-Store Stock Transfer lifecycle, deterministic custody, in-transit holds,
    FIFO cost layer inheritance, idempotency, RBAC, and cost masking.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Organization & Owner
        self.owner = User.objects.create_user(
            email="owner_2c2@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Owner TwoC2"
        )
        self.org = Organization.objects.create(
            name="PharmaPro 2C2 Org",
            owner=self.owner,
            is_active=True
        )
        self.owner_membership = OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role="owner",
            is_active=True
        )

        # 2. Stores: Store 1 (Source) and Store 2 (Destination)
        self.store1 = Store.objects.create(
            name="Source Central Store",
            organization=self.org,
            code="STR-SRC-01",
            status="active"
        )
        self.store2 = Store.objects.create(
            name="Destination Branch Store",
            organization=self.org,
            code="STR-DST-02",
            status="active"
        )

        # 3. Store Managers
        self.manager1 = User.objects.create_user(
            email="manager1_2c2@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Manager Source Store"
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.manager1,
            role="manager",
            is_active=True
        )

        self.manager2 = User.objects.create_user(
            email="manager2_2c2@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Manager Dest Store"
        )
        StoreMembership.objects.create(
            store=self.store2,
            user=self.manager2,
            role="manager",
            is_active=True
        )

        # 4. Pharmacist (Store 1, restricted cost view)
        self.pharmacist = User.objects.create_user(
            email="pharmacist_2c2@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Pharmacist Source Store"
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.pharmacist,
            role="pharmacist",
            is_active=True
        )

        # 5. External Organization & Store
        self.ext_owner = User.objects.create_user(
            email="ext_owner_2c2@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Ext Org Owner"
        )
        self.ext_org = Organization.objects.create(
            name="External Corp",
            owner=self.ext_owner,
            is_active=True
        )
        OrganizationMembership.objects.create(
            organization=self.ext_org,
            user=self.ext_owner,
            role="owner",
            is_active=True
        )
        self.ext_store = Store.objects.create(
            name="External Branch",
            organization=self.ext_org,
            code="EXT-STR-01",
            status="active"
        )

        # 6. Test Product & Packaging Snapshot
        self.product = Product.objects.create(
            organization=self.org,
            name="Amoxicillin 500mg Caps",
            sku="AMX-500-CAP",
            barcode="8901234567890",
            category="Antibiotics",
            base_unit="capsule",
            sale_unit="strip",
            conversion_factor=10,
            is_loose_dispensing_allowed=True,
            is_active=True
        )
        self.snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(self.product)

        # 7. Test Batch & Initial Source Stock (100 base units = 10 strips)
        self.batch = Batch.objects.create(
            organization=self.org,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="BAT-AMX-2026",
            expiry_date=timezone.localdate() + timedelta(days=365),
            mrp=Decimal("80.00"),
            unit_mrp=Decimal("8.0000"),
            created_by=self.owner,
            status="active"
        )

        # Establish opening stock at Store 1 (100 base units, unit_cost=5.0000, unit_mrp=8.0000)
        self.source_stock = StoreBatchStock.objects.create(
            organization=self.org,
            store=self.store1,
            product=self.product,
            batch=self.batch,
            quantity_on_hand=100,
            quantity_quarantined=0,
            low_stock_threshold=10
        )
        self.cost_layer = BatchInwardCostLayer.objects.create(
            organization=self.org,
            store=self.store1,
            batch=self.batch,
            receipt_type="OPENING_STOCK",
            receipt_reference="INIT-2C2",
            original_quantity=100,
            remaining_quantity=100,
            purchase_cost_per_sale_unit=Decimal("50.00"),
            unit_cost=Decimal("5.0000")
        )

    # -------------------------------------------------------------------------
    # 1. Transfer Creation Tests
    # -------------------------------------------------------------------------

    def test_stock_transfer_creation_success(self):
        """Valid stock transfer request between two branches in the same organization."""
        self.client.force_authenticate(user=self.manager1)
        payload = {
            "source_store_id": str(self.store1.id),
            "destination_store_id": str(self.store2.id),
            "notes": "Urgent branch stock replenishment",
            "items": [
                {
                    "product_id": str(self.product.id),
                    "batch_id": str(self.batch.id),
                    "quantity_requested": 40
                }
            ]
        }

        response = self.client.post("/api/inventory/transfers/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()

        self.assertTrue(data["transfer_number"].startswith("TRF-"))
        self.assertEqual(data["status"], "SUBMITTED")
        self.assertEqual(data["source_store_id"], str(self.store1.id))
        self.assertEqual(data["destination_store_id"], str(self.store2.id))
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["quantity_requested"], 40)
        self.assertEqual(data["items"][0]["quantity_dispatched"], 0)
        self.assertEqual(data["items"][0]["in_transit_quantity"], 0)

    def test_stock_transfer_same_store_rejected(self):
        """Transfer where source and destination stores are identical must be rejected."""
        self.client.force_authenticate(user=self.manager1)
        payload = {
            "source_store_id": str(self.store1.id),
            "destination_store_id": str(self.store1.id),
            "items": [
                {
                    "product_id": str(self.product.id),
                    "batch_id": str(self.batch.id),
                    "quantity_requested": 20
                }
            ]
        }
        response = self.client.post("/api/inventory/transfers/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Source store and destination store must be different branches", str(response.json()))

    def test_stock_transfer_cross_org_rejected(self):
        """Cross-organization transfer request must be strictly rejected."""
        self.client.force_authenticate(user=self.manager1)
        payload = {
            "source_store_id": str(self.store1.id),
            "destination_store_id": str(self.ext_store.id),
            "items": [
                {
                    "product_id": str(self.product.id),
                    "batch_id": str(self.batch.id),
                    "quantity_requested": 20
                }
            ]
        }
        response = self.client.post("/api/inventory/transfers/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_transfer_empty_items_rejected(self):
        """Transfer without line items must be rejected."""
        self.client.force_authenticate(user=self.manager1)
        payload = {
            "source_store_id": str(self.store1.id),
            "destination_store_id": str(self.store2.id),
            "items": []
        }
        response = self.client.post("/api/inventory/transfers/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------------------
    # 2. Dispatch Tests
    # -------------------------------------------------------------------------

    def _create_test_transfer(self, qty_requested=40):
        transfer = StockTransfer.objects.create(
            organization=self.org,
            source_store=self.store1,
            destination_store=self.store2,
            transfer_number=f"TRF-{uuid.uuid4().hex[:8].upper()}",
            status="SUBMITTED",
            requested_by=self.manager1
        )
        item = StockTransferItem.objects.create(
            transfer=transfer,
            product=self.product,
            batch=self.batch,
            packaging_snapshot=self.snapshot,
            quantity_requested=qty_requested,
            quantity_dispatched=0,
            quantity_received=0,
            quantity_damaged=0,
            quantity_missing=0,
            quantity_excess=0,
            unit_mrp=Decimal("8.0000"),
            unit_cost=Decimal("5.0000"),
            status="PENDING"
        )
        return transfer, item

    def test_dispatch_stock_transfer_success(self):
        """Dispatching deducts physical stock from source, transitions to DISPATCHED."""
        transfer, item = self._create_test_transfer(qty_requested=40)
        self.client.force_authenticate(user=self.manager1)

        key = str(uuid.uuid4())
        response = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/dispatch/",
            {},
            HTTP_IDEMPOTENCY_KEY=key,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify source stock balance decremented from 100 to 60
        self.source_stock.refresh_from_db()
        self.assertEqual(self.source_stock.quantity_on_hand, 60)

        # Verify StockMovement ledger
        movement = StockMovement.objects.filter(
            store=self.store1,
            batch=self.batch,
            movement_type="TRANSFER_DISPATCH"
        ).first()
        self.assertIsNotNone(movement)
        self.assertEqual(movement.direction, "OUT")
        self.assertEqual(movement.quantity, 40)
        self.assertEqual(movement.balance_before, 100)
        self.assertEqual(movement.balance_after, 60)
        self.assertEqual(movement.unit_cost, Decimal("5.0000"))

        # Verify transfer status and item
        transfer.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(transfer.status, "DISPATCHED")
        self.assertEqual(item.quantity_dispatched, 40)
        self.assertEqual(item.in_transit_quantity, 40)
        self.assertEqual(item.status, "DISPATCHED")

    def test_dispatch_insufficient_stock_fails(self):
        """Attempt to dispatch more stock than available on-hand must fail."""
        transfer, item = self._create_test_transfer(qty_requested=150)  # Only 100 available
        self.client.force_authenticate(user=self.manager1)

        key = str(uuid.uuid4())
        response = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/dispatch/",
            {},
            HTTP_IDEMPOTENCY_KEY=key,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Insufficient available stock", str(response.json()))

        # Source stock must remain completely unaltered
        self.source_stock.refresh_from_db()
        self.assertEqual(self.source_stock.quantity_on_hand, 100)

    def test_dispatch_idempotency_replay(self):
        """Repeated dispatch requests with identical key return cached replay."""
        transfer, item = self._create_test_transfer(qty_requested=30)
        self.client.force_authenticate(user=self.manager1)

        key = str(uuid.uuid4())
        res1 = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/dispatch/",
            {},
            HTTP_IDEMPOTENCY_KEY=key,
            format="json"
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        res2 = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/dispatch/",
            {},
            HTTP_IDEMPOTENCY_KEY=key,
            format="json"
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.json(), res2.json())

        # Balance must only have been deducted ONCE (100 - 30 = 70)
        self.source_stock.refresh_from_db()
        self.assertEqual(self.source_stock.quantity_on_hand, 70)

    # -------------------------------------------------------------------------
    # 3. Receipt & Discrepancy Tests
    # -------------------------------------------------------------------------

    def test_destination_receipt_full_success(self):
        """Full receipt credits destination stock, creates FIFO cost layer, marks COMPLETED."""
        transfer, item = self._create_test_transfer(qty_requested=40)
        # Dispatch transfer first
        StockLedgerService.dispatch_stock_transfer(
            transfer=transfer,
            actor=self.manager1,
            idempotency_key=str(uuid.uuid4()),
            raw_payload={"action": "dispatch"}
        )

        # Authenticate as destination store manager
        self.client.force_authenticate(user=self.manager2)
        key = str(uuid.uuid4())
        payload = {
            "receipt_lines": [
                {
                    "item_id": str(item.id),
                    "quantity_received": 40,
                    "quantity_damaged": 0,
                    "quantity_missing": 0,
                    "quantity_excess": 0
                }
            ]
        }

        response = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/receive/",
            payload,
            HTTP_IDEMPOTENCY_KEY=key,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify destination stock created with 40 units
        dest_stock = StoreBatchStock.objects.get(store=self.store2, batch=self.batch)
        self.assertEqual(dest_stock.quantity_on_hand, 40)

        # Verify FIFO inward cost layer created at destination with source unit cost
        cost_layer = BatchInwardCostLayer.objects.filter(
            store=self.store2,
            batch=self.batch,
            receipt_type="TRANSFER_IN"
        ).first()
        self.assertIsNotNone(cost_layer)
        self.assertEqual(cost_layer.original_quantity, 40)
        self.assertEqual(cost_layer.remaining_quantity, 40)
        self.assertEqual(cost_layer.unit_cost, Decimal("5.0000"))
        self.assertEqual(cost_layer.receipt_reference, transfer.transfer_number)

        # Verify transfer status
        transfer.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(transfer.status, "COMPLETED")
        self.assertEqual(item.quantity_received, 40)
        self.assertEqual(item.in_transit_quantity, 0)
        self.assertEqual(item.status, "RECEIVED")

    def test_destination_receipt_partial(self):
        """Partial receipt credits received stock, leaves remaining in transit."""
        transfer, item = self._create_test_transfer(qty_requested=40)
        StockLedgerService.dispatch_stock_transfer(
            transfer=transfer,
            actor=self.manager1,
            idempotency_key=str(uuid.uuid4()),
            raw_payload={"action": "dispatch"}
        )

        self.client.force_authenticate(user=self.manager2)
        key = str(uuid.uuid4())
        payload = {
            "receipt_lines": [
                {
                    "item_id": str(item.id),
                    "quantity_received": 25,
                    "quantity_damaged": 0,
                    "quantity_missing": 0,
                    "quantity_excess": 0
                }
            ]
        }

        response = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/receive/",
            payload,
            HTTP_IDEMPOTENCY_KEY=key,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        dest_stock = StoreBatchStock.objects.get(store=self.store2, batch=self.batch)
        self.assertEqual(dest_stock.quantity_on_hand, 25)

        transfer.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(transfer.status, "PARTIALLY_RECEIVED")
        self.assertEqual(item.quantity_received, 25)
        self.assertEqual(item.in_transit_quantity, 15)  # 40 - 25 = 15 remaining
        self.assertEqual(item.status, "PARTIAL")

    def test_destination_receipt_discrepancy_hold(self):
        """Transit shortage and damage trigger DISCREPANCY_HOLD with unassigned liability."""
        transfer, item = self._create_test_transfer(qty_requested=40)
        StockLedgerService.dispatch_stock_transfer(
            transfer=transfer,
            actor=self.manager1,
            idempotency_key=str(uuid.uuid4()),
            raw_payload={"action": "dispatch"}
        )

        self.client.force_authenticate(user=self.manager2)
        key = str(uuid.uuid4())
        payload = {
            "receipt_lines": [
                {
                    "item_id": str(item.id),
                    "quantity_received": 30,
                    "quantity_damaged": 4,
                    "quantity_missing": 6,
                    "quantity_excess": 0,
                    "evidence_notes": "Carton arrived wet; 4 caps crushed, 6 missing."
                }
            ]
        }

        response = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/receive/",
            payload,
            HTTP_IDEMPOTENCY_KEY=key,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Destination receives good units only
        dest_stock = StoreBatchStock.objects.get(store=self.store2, batch=self.batch)
        self.assertEqual(dest_stock.quantity_on_hand, 30)

        transfer.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(transfer.status, "DISCREPANCY_HOLD")
        self.assertEqual(item.status, "DISCREPANCY")
        self.assertEqual(item.quantity_received, 30)
        self.assertEqual(item.quantity_damaged, 4)
        self.assertEqual(item.quantity_missing, 6)
        self.assertEqual(item.in_transit_quantity, 0)

        # Verify TransferDiscrepancy records
        discrepancies = list(transfer.discrepancies.all().order_by("discrepancy_type"))
        self.assertEqual(len(discrepancies), 2)

        damage_disc = next(d for d in discrepancies if d.discrepancy_type == "DAMAGE")
        self.assertEqual(damage_disc.discrepancy_quantity, 4)
        self.assertEqual(damage_disc.status, "PENDING_INVESTIGATION")

        short_disc = next(d for d in discrepancies if d.discrepancy_type == "SHORTAGE")
        self.assertEqual(short_disc.discrepancy_quantity, 6)
        self.assertEqual(short_disc.status, "PENDING_INVESTIGATION")

    def test_discrepancy_resolution_workflow(self):
        """Resolving discrepancies marks them RESOLVED and closes the transfer."""
        transfer, item = self._create_test_transfer(qty_requested=20)
        StockLedgerService.dispatch_stock_transfer(
            transfer=transfer,
            actor=self.manager1,
            idempotency_key=str(uuid.uuid4()),
            raw_payload={"action": "dispatch"}
        )

        StockLedgerService.receive_stock_transfer(
            transfer=transfer,
            actor=self.manager2,
            idempotency_key=str(uuid.uuid4()),
            receipt_lines=[{
                "item_id": str(item.id),
                "quantity_received": 18,
                "quantity_missing": 2,
            }],
            raw_payload={"action": "receive"}
        )

        transfer.refresh_from_db()
        self.assertEqual(transfer.status, "DISCREPANCY_HOLD")
        discrepancy = transfer.discrepancies.first()
        self.assertIsNotNone(discrepancy)

        # Destination manager resolves the discrepancy
        self.client.force_authenticate(user=self.manager2)
        res_payload = {
            "resolution_decision": "LOSS_CONFIRMED",
            "resolution_notes": "Carrier investigation confirmed missing units during transport."
        }
        res = self.client.post(
            f"/api/inventory/transfers/discrepancies/{discrepancy.id}/resolve/",
            res_payload,
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        discrepancy.refresh_from_db()
        transfer.refresh_from_db()
        self.assertEqual(discrepancy.status, "RESOLVED")
        self.assertEqual(discrepancy.resolution_decision, "LOSS_CONFIRMED")
        self.assertEqual(discrepancy.reviewed_by, self.manager2)
        # All items accounted for, so transfer moves to COMPLETED
        self.assertEqual(transfer.status, "COMPLETED")

    # -------------------------------------------------------------------------
    # 4. Cancellation Tests
    # -------------------------------------------------------------------------

    def test_cancel_transfer_before_dispatch(self):
        """SUBMITTED transfer can be safely cancelled by source store manager."""
        transfer, _ = self._create_test_transfer(qty_requested=20)
        self.client.force_authenticate(user=self.manager1)

        res = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/cancel/",
            {"cancellation_reason": "Requested in error"},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        transfer.refresh_from_db()
        self.assertEqual(transfer.status, "CANCELLED")
        self.assertEqual(transfer.cancellation_reason, "Requested in error")

    def test_cancel_transfer_after_dispatch_rejected(self):
        """DISPATCHED transfer CANNOT be cancelled; must proceed through receipt."""
        transfer, _ = self._create_test_transfer(qty_requested=20)
        StockLedgerService.dispatch_stock_transfer(
            transfer=transfer,
            actor=self.manager1,
            idempotency_key=str(uuid.uuid4()),
            raw_payload={"action": "dispatch"}
        )

        self.client.force_authenticate(user=self.manager1)
        res = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/cancel/",
            {"cancellation_reason": "Change of mind"},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot cancel transfer in 'DISPATCHED' status", res.json()["detail"])

    # -------------------------------------------------------------------------
    # 5. Permission & RBAC Tests
    # -------------------------------------------------------------------------

    def test_destination_manager_cannot_dispatch_source_stock(self):
        """Destination store manager has no dispatch authority over source branch stock."""
        transfer, _ = self._create_test_transfer(qty_requested=20)
        self.client.force_authenticate(user=self.manager2)  # Manager of Store 2, not Store 1

        res = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/dispatch/",
            {},
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_source_manager_cannot_receive_at_destination(self):
        """Source store manager has no authority to confirm receipt at destination store."""
        transfer, _ = self._create_test_transfer(qty_requested=20)
        StockLedgerService.dispatch_stock_transfer(
            transfer=transfer,
            actor=self.manager1,
            idempotency_key=str(uuid.uuid4()),
            raw_payload={"action": "dispatch"}
        )

        self.client.force_authenticate(user=self.manager1)  # Manager of Store 1, not Store 2
        res = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/receive/",
            {"receipt_lines": []},
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_pharmacist_cannot_dispatch_or_receive(self):
        """Non-manager staff (pharmacists) cannot perform dispatch or receipt operations."""
        transfer, _ = self._create_test_transfer(qty_requested=20)
        self.client.force_authenticate(user=self.pharmacist)

        res_dispatch = self.client.post(
            f"/api/inventory/transfers/{transfer.id}/dispatch/",
            {},
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            format="json"
        )
        self.assertEqual(res_dispatch.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # 6. Cost Masking Tests
    # -------------------------------------------------------------------------

    def test_cost_masking_for_pharmacist(self):
        """Pharmacists see transfer item details and unit MRP, but unit_cost is stripped."""
        transfer, _ = self._create_test_transfer(qty_requested=20)
        self.client.force_authenticate(user=self.pharmacist)

        res = self.client.get(f"/api/inventory/transfers/{transfer.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        item_data = data["items"][0]

        self.assertIn("unit_mrp", item_data)
        self.assertNotIn("unit_cost", item_data)

    def test_cost_visible_for_store_manager_and_owner(self):
        """Store Managers and Org Owners can view confidential unit_cost."""
        transfer, _ = self._create_test_transfer(qty_requested=20)

        # Store Manager 1
        self.client.force_authenticate(user=self.manager1)
        res_mgr = self.client.get(f"/api/inventory/transfers/{transfer.id}/")
        self.assertEqual(res_mgr.status_code, status.HTTP_200_OK)
        self.assertIn("unit_cost", res_mgr.json()["items"][0])

        # Org Owner
        self.client.force_authenticate(user=self.owner)
        res_own = self.client.get(f"/api/inventory/transfers/{transfer.id}/")
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)
        self.assertIn("unit_cost", res_own.json()["items"][0])

    # -------------------------------------------------------------------------
    # 7. Concurrency & Race Condition Tests
    # -------------------------------------------------------------------------

    def test_dispatch_concurrency_race(self):
        """Two concurrent dispatch attempts on same transfer: exactly one executes deductions."""
        transfer, _ = self._create_test_transfer(qty_requested=30)
        key1 = str(uuid.uuid4())
        key2 = str(uuid.uuid4())

        results = []
        errors = []

        def worker(key):
            try:
                connections.close_all()
                res, is_new = StockLedgerService.dispatch_stock_transfer(
                    transfer=transfer,
                    actor=self.manager1,
                    idempotency_key=key,
                    raw_payload={"thread_key": key}
                )
                results.append((res, is_new))
            except Exception as e:
                errors.append(e)
            finally:
                connections.close_all()

        t1 = threading.Thread(target=worker, args=(key1,))
        t2 = threading.Thread(target=worker, args=(key2,))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # One thread should succeed; the second should either fail or be rejected because status is no longer SUBMITTED
        total_attempts = len(results) + len(errors)
        self.assertEqual(total_attempts, 2)
        self.assertEqual(len(results), 1)

        # Physical stock should only have been deducted ONCE (100 - 30 = 70)
        self.source_stock.refresh_from_db()
        self.assertEqual(self.source_stock.quantity_on_hand, 70)
