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
    Supplier,
    GoodsReceipt,
    GoodsReceiptItem,
)
from apps.inventory.services import StockLedgerService

User = get_user_model()


class Phase2C1Tests(TransactionTestCase):
    """
    Focused automated tests for Milestone 2C.1:
    Supplier Master and Purchase Inward / Goods Receipt Note (GRN).
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Organization A & Owner
        self.owner = User.objects.create_user(
            email="owner_2c1@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Owner TwoC1"
        )
        self.org = Organization.objects.create(
            name="PharmaPro 2C1 Org",
            owner=self.owner,
            is_active=True
        )
        self.owner_membership = OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role="owner",
            is_active=True
        )

        # 2. Store 1 & Store 2
        self.store1 = Store.objects.create(
            name="Central Pharmacy Store",
            organization=self.org,
            code="STR-2C1-01",
            status="active"
        )
        self.store2 = Store.objects.create(
            name="East Branch Store",
            organization=self.org,
            code="STR-2C1-02",
            status="active"
        )

        # 3. Store Manager (assigned to Store 1 only)
        self.manager = User.objects.create_user(
            email="manager_2c1@PharmaPro.test",
            password="StrongPassword123!",
            full_name="Manager TwoC1"
        )
        self.manager_membership = StoreMembership.objects.create(
            store=self.store1,
            user=self.manager,
            role="manager",
            is_active=True
        )

        # 4. Pharmacist (assigned to Store 1, read-only costs)
        self.pharmacist = User.objects.create_user(
            email="pharmacist_2c1@PharmaPro.test",
            password="StrongPassword123!",
            full_name="Pharmacist TwoC1"
        )
        self.pharmacist_membership = StoreMembership.objects.create(
            store=self.store1,
            user=self.pharmacist,
            role="pharmacist",
            is_active=True
        )

        # 5. External Organization B & Owner
        self.ext_owner = User.objects.create_user(
            email="ext_owner_2c1@PharmaPro.test",
            password="StrongPassword123!",
            full_name="External Owner"
        )
        self.ext_org = Organization.objects.create(
            name="External Meds Corp",
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
            name="External Store",
            organization=self.ext_org,
            code="EXT-STR",
            status="active"
        )

        # 6. Catalog Product
        self.product = Product.objects.create(
            organization=self.org,
            name="Ciprofloxacin 500mg Tablets",
            sku="SKU-CIP-500",
            barcode="8901234567001",
            category="antibiotic",
            item_type="medicine",
            dosage_form="tablet",
            prescription_class="schedule_h",
            base_unit="tablet",
            sale_unit="strip",
            conversion_factor=10,
            is_loose_dispensing_allowed=True,
            pack_description="Strip of 10 Tablets",
            gst_rate=Decimal("12.00"),
            is_active=True,
            created_by=self.owner
        )
        self.snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(self.product)

        # 7. Active Supplier
        self.supplier = Supplier.objects.create(
            organization=self.org,
            name="Apex Pharma Distributors",
            supplier_code="SUP-APEX",
            contact_person="Ramesh Gupta",
            phone="9876543210",
            email="orders@apexpharma.test",
            gstin="27AAPCA1234F1Z5",
            drug_license_number="DL-20B-12345",
            is_active=True,
            created_by=self.owner
        )

    # -------------------------------------------------------------------------
    # Supplier Master Tests
    # -------------------------------------------------------------------------

    def test_01_create_supplier_successful(self):
        """Owner or Store Manager can create a supplier with valid GSTIN and license."""
        self.client.force_authenticate(user=self.owner)
        payload = {
            "name": "Zenith Healthcare Wholesale",
            "supplier_code": "SUP-ZENITH",
            "contact_person": "Priya Sharma",
            "phone": "9812345678",
            "email": "contact@zenith.test",
            "gstin": "29BBBBB1234B1Z2",
            "drug_license_number": "DL-21B-98765",
            "payment_terms_days": 45
        }
        res = self.client.post("/api/inventory/suppliers/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.json()["name"], "Zenith Healthcare Wholesale")
        self.assertEqual(res.json()["supplier_code"], "SUP-ZENITH")

    def test_02_supplier_organization_isolation(self):
        """Suppliers are strictly tenant-isolated. External org cannot see or modify them."""
        # External owner views suppliers -> empty list
        self.client.force_authenticate(user=self.ext_owner)
        res = self.client.get("/api/inventory/suppliers/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["count"], 0)

        # External owner cannot view Supplier 1
        res_detail = self.client.get(f"/api/inventory/suppliers/{self.supplier.id}/")
        self.assertEqual(res_detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_03_supplier_gstin_validation(self):
        """GSTIN must be exactly 15 characters if provided."""
        self.client.force_authenticate(user=self.owner)
        res = self.client.post("/api/inventory/suppliers/", {
            "name": "Invalid GSTIN Supplier",
            "gstin": "INVALID_GSTIN"  # 13 chars
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("gstin", res.json()["errors"])

    def test_04_supplier_deactivation(self):
        """Soft-deactivating a supplier sets is_active=False and blocks subsequent intake."""
        self.client.force_authenticate(user=self.owner)
        res = self.client.post(f"/api/inventory/suppliers/{self.supplier.id}/deactivate/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.supplier.refresh_from_db()
        self.assertFalse(self.supplier.is_active)

    # -------------------------------------------------------------------------
    # Goods Receipt Note (GRN) / Purchase Inward Tests
    # -------------------------------------------------------------------------

    def test_05_create_draft_goods_receipt(self):
        """Store staff can create a draft GRN with line items without mutating stock."""
        self.client.force_authenticate(user=self.pharmacist)
        url = f"/api/inventory/stores/{self.store1.id}/goods-receipts/"
        payload = {
            "supplier_id": str(self.supplier.id),
            "supplier_invoice_number": "INV-2026-001",
            "supplier_invoice_date": str(timezone.localdate()),
            "receipt_date": str(timezone.localdate()),
            "notes": "Weekly stock delivery",
            "items": [
                {
                    "product_id": str(self.product.id),
                    "batch_number": "CIP-BATCH-01",
                    "expiry_date": str(timezone.localdate() + timedelta(days=365)),
                    "quantity_sale_units": 10,
                    "quantity_loose_base_units": 0,
                    "purchase_cost_per_sale_unit": "60.00",
                    "mrp": "100.00",
                    "tax_rate": "12.00"
                }
            ]
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertEqual(data["status"], "DRAFT")
        self.assertTrue(data["grn_number"].startswith("GRN-"))
        self.assertEqual(data["items_count"], 1)

        # Verify stock has NOT changed upon drafting
        self.assertFalse(StoreBatchStock.objects.filter(store=self.store1, batch__batch_number="CIP-BATCH-01").exists())
        self.assertFalse(StockMovement.objects.filter(store=self.store1, batch__batch_number="CIP-BATCH-01").exists())

    def test_06_post_goods_receipt_successful(self):
        """
        Posting an approved Goods Receipt creates Batch, StoreBatchStock, StockMovement,
        and BatchInwardCostLayer atomically.
        """
        self.client.force_authenticate(user=self.manager)
        # 1. Create draft GRN
        url_create = f"/api/inventory/stores/{self.store1.id}/goods-receipts/"
        payload = {
            "supplier_id": str(self.supplier.id),
            "supplier_invoice_number": "INV-POST-01",
            "supplier_invoice_date": str(timezone.localdate()),
            "items": [
                {
                    "product_id": str(self.product.id),
                    "batch_number": "CIP-POST-01",
                    "expiry_date": str(timezone.localdate() + timedelta(days=365)),
                    "quantity_sale_units": 5,  # 5 * 10 = 50 tablets
                    "quantity_loose_base_units": 0,
                    "purchase_cost_per_sale_unit": "80.00",
                    "mrp": "120.00",
                    "tax_rate": "12.00"
                }
            ]
        }
        res_create = self.client.post(url_create, payload, format="json")
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        grn_id = res_create.json()["id"]

        # 2. Post to inventory
        url_post = f"/api/inventory/stores/{self.store1.id}/goods-receipts/{grn_id}/post/"
        op_key = str(uuid.uuid4())
        res_post = self.client.post(url_post, {}, format="json", HTTP_IDEMPOTENCY_KEY=op_key)
        self.assertEqual(res_post.status_code, status.HTTP_200_OK)
        self.assertEqual(res_post.json()["status"], "success")

        # 3. Verify database state
        grn = GoodsReceipt.objects.get(id=grn_id)
        self.assertEqual(grn.status, "POSTED")
        self.assertEqual(grn.posted_by, self.manager)

        stock = StoreBatchStock.objects.get(store=self.store1, batch__batch_number="CIP-POST-01")
        self.assertEqual(stock.quantity_on_hand, 50)
        self.assertEqual(stock.available_quantity, 50)

        # Verify Cost Layer
        layer = BatchInwardCostLayer.objects.get(batch__batch_number="CIP-POST-01")
        self.assertEqual(layer.receipt_type, "PURCHASE_GRN")
        self.assertEqual(layer.original_quantity, 50)
        self.assertEqual(layer.remaining_quantity, 50)
        self.assertEqual(layer.unit_cost, Decimal("8.0000"))

        # Verify immutable StockMovement
        mvt = StockMovement.objects.get(batch__batch_number="CIP-POST-01")
        self.assertEqual(mvt.movement_type, "PURCHASE_RECEIPT")
        self.assertEqual(mvt.quantity, 50)
        self.assertEqual(mvt.balance_after, 50)
        self.assertEqual(mvt.reference_type, "GOODS_RECEIPT")
        self.assertEqual(mvt.reference_id, grn.grn_number)

    def test_07_post_goods_receipt_idempotency_replay(self):
        """Replaying a post request with the same idempotency key returns cached response without double-crediting."""
        self.client.force_authenticate(user=self.owner)
        grn = GoodsReceipt.objects.create(
            organization=self.org,
            store=self.store1,
            supplier=self.supplier,
            grn_number="GRN-REPLAY-01",
            supplier_invoice_number="INV-REPLAY-01",
            supplier_invoice_date=timezone.localdate(),
            received_by=self.owner
        )
        GoodsReceiptItem.objects.create(
            goods_receipt=grn,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="CIP-REPLAY-01",
            expiry_date=timezone.localdate() + timedelta(days=365),
            quantity_sale_units=2,
            total_base_units=20,
            purchase_cost_per_sale_unit=Decimal("50.00"),
            unit_cost=Decimal("5.0000"),
            mrp=Decimal("80.00"),
            unit_mrp=Decimal("8.0000"),
            total_cost=Decimal("100.00")
        )

        op_key = str(uuid.uuid4())
        url_post = f"/api/inventory/stores/{self.store1.id}/goods-receipts/{grn.id}/post/"

        res1 = self.client.post(url_post, {}, format="json", HTTP_IDEMPOTENCY_KEY=op_key)
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second call with same key
        res2 = self.client.post(url_post, {}, format="json", HTTP_IDEMPOTENCY_KEY=op_key)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

        # Balance must remain exactly 20 (not 40!)
        stock = StoreBatchStock.objects.get(store=self.store1, batch__batch_number="CIP-REPLAY-01")
        self.assertEqual(stock.quantity_on_hand, 20)
        self.assertEqual(StockMovement.objects.filter(store=self.store1, batch__batch_number="CIP-REPLAY-01").count(), 1)

    def test_08_duplicate_supplier_invoice_rejected(self):
        """Submitting a receipt with the same invoice number for the same supplier is rejected."""
        self.client.force_authenticate(user=self.manager)
        url = f"/api/inventory/stores/{self.store1.id}/goods-receipts/"
        payload = {
            "supplier_id": str(self.supplier.id),
            "supplier_invoice_number": "INV-DUP-TEST",
            "supplier_invoice_date": str(timezone.localdate()),
            "items": [
                {
                    "product_id": str(self.product.id),
                    "batch_number": "CIP-DUP-01",
                    "expiry_date": str(timezone.localdate() + timedelta(days=365)),
                    "quantity_sale_units": 1,
                    "purchase_cost_per_sale_unit": "50.00",
                    "mrp": "80.00"
                }
            ]
        }
        res1 = self.client.post(url, payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        grn_id = res1.json()["id"]

        # Post receipt to set status to POSTED
        self.client.post(f"/api/inventory/stores/{self.store1.id}/goods-receipts/{grn_id}/post/", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))

        # Attempt to create another receipt with same invoice number from same supplier
        res2 = self.client.post(url, payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already been processed", str(res2.json()["errors"]))

    def test_09_expired_batch_rejected_from_goods_receipt(self):
        """Intake with an expired batch is rejected with HTTP 400."""
        self.client.force_authenticate(user=self.manager)
        url = f"/api/inventory/stores/{self.store1.id}/goods-receipts/"
        payload = {
            "supplier_id": str(self.supplier.id),
            "supplier_invoice_number": "INV-EXP-01",
            "supplier_invoice_date": str(timezone.localdate()),
            "items": [
                {
                    "product_id": str(self.product.id),
                    "batch_number": "CIP-EXPIRED",
                    "expiry_date": str(timezone.localdate() - timedelta(days=1)),  # Expired yesterday!
                    "quantity_sale_units": 5,
                    "purchase_cost_per_sale_unit": "50.00",
                    "mrp": "80.00"
                }
            ]
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired batch", str(res.json()["errors"]).lower())

    def test_10_ambiguous_or_damaged_batch_quarantine(self):
        """
        Line items flagged with intake_status='QUARANTINE_REVIEW' are placed into
        quantity_quarantined upon posting, keeping available_quantity at 0.
        """
        self.client.force_authenticate(user=self.owner)
        grn = GoodsReceipt.objects.create(
            organization=self.org,
            store=self.store1,
            supplier=self.supplier,
            grn_number="GRN-QUAR-01",
            supplier_invoice_number="INV-QUAR-01",
            supplier_invoice_date=timezone.localdate(),
            received_by=self.owner
        )
        GoodsReceiptItem.objects.create(
            goods_receipt=grn,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="CIP-QUAR-01",
            expiry_date=timezone.localdate() + timedelta(days=365),
            quantity_sale_units=3,
            total_base_units=30,
            purchase_cost_per_sale_unit=Decimal("60.00"),
            unit_cost=Decimal("6.0000"),
            mrp=Decimal("100.00"),
            unit_mrp=Decimal("10.0000"),
            total_cost=Decimal("180.00"),
            intake_status="QUARANTINE_REVIEW",
            quarantine_reason="Temperature excursion during delivery"
        )

        res = self.client.post(
            f"/api/inventory/stores/{self.store1.id}/goods-receipts/{grn.id}/post/",
            {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        stock = StoreBatchStock.objects.get(store=self.store1, batch__batch_number="CIP-QUAR-01")
        self.assertEqual(stock.quantity_on_hand, 30)
        self.assertEqual(stock.quantity_quarantined, 30)
        # Legally and physically blocked from dispensing!
        self.assertEqual(stock.available_quantity, 0)

    def test_11_pharmacist_cannot_post_goods_receipt(self):
        """Pharmacist can draft receipts but cannot post to inventory (HTTP 403)."""
        self.client.force_authenticate(user=self.pharmacist)
        grn = GoodsReceipt.objects.create(
            organization=self.org,
            store=self.store1,
            supplier=self.supplier,
            grn_number="GRN-PERM-01",
            supplier_invoice_number="INV-PERM-01",
            supplier_invoice_date=timezone.localdate(),
            received_by=self.pharmacist
        )
        url_post = f"/api/inventory/stores/{self.store1.id}/goods-receipts/{grn.id}/post/"
        res = self.client.post(url_post, {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_12_cost_masking_for_pharmacist_on_goods_receipt(self):
        """Pharmacist viewing goods receipt details does not see unit costs or financial totals."""
        grn = GoodsReceipt.objects.create(
            organization=self.org,
            store=self.store1,
            supplier=self.supplier,
            grn_number="GRN-MASK-01",
            supplier_invoice_number="INV-MASK-01",
            supplier_invoice_date=timezone.localdate(),
            total_taxable_amount=Decimal("500.00"),
            total_tax_amount=Decimal("60.00"),
            total_amount=Decimal("560.00"),
            received_by=self.owner
        )
        GoodsReceiptItem.objects.create(
            goods_receipt=grn,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="CIP-MASK-01",
            expiry_date=timezone.localdate() + timedelta(days=365),
            quantity_sale_units=5,
            total_base_units=50,
            purchase_cost_per_sale_unit=Decimal("100.00"),
            unit_cost=Decimal("10.0000"),
            mrp=Decimal("150.00"),
            unit_mrp=Decimal("15.0000"),
            tax_rate=Decimal("12.00"),
            tax_amount=Decimal("60.00"),
            total_cost=Decimal("560.00")
        )

        # Pharmacist view
        self.client.force_authenticate(user=self.pharmacist)
        res_pharm = self.client.get(f"/api/inventory/stores/{self.store1.id}/goods-receipts/{grn.id}/")
        self.assertEqual(res_pharm.status_code, status.HTTP_200_OK)
        data_pharm = res_pharm.json()
        self.assertNotIn("total_amount", data_pharm)
        self.assertNotIn("total_taxable_amount", data_pharm)
        self.assertNotIn("purchase_cost_per_sale_unit", data_pharm["items"][0])
        self.assertNotIn("unit_cost", data_pharm["items"][0])

        # Manager view
        self.client.force_authenticate(user=self.manager)
        res_mgr = self.client.get(f"/api/inventory/stores/{self.store1.id}/goods-receipts/{grn.id}/")
        self.assertEqual(res_mgr.status_code, status.HTTP_200_OK)
        data_mgr = res_mgr.json()
        self.assertIn("total_amount", data_mgr)
        self.assertEqual(data_mgr["total_amount"], "560.00")
        self.assertIn("unit_cost", data_mgr["items"][0])
        self.assertEqual(data_mgr["items"][0]["unit_cost"], "10.0000")

    def test_13_cannot_intake_from_deactivated_supplier(self):
        """Attempting to post a receipt from a deactivated supplier is rejected."""
        self.supplier.is_active = False
        self.supplier.save(update_fields=["is_active"])

        self.client.force_authenticate(user=self.manager)
        grn = GoodsReceipt.objects.create(
            organization=self.org,
            store=self.store1,
            supplier=self.supplier,
            grn_number="GRN-DEACT-01",
            supplier_invoice_number="INV-DEACT-01",
            supplier_invoice_date=timezone.localdate(),
            received_by=self.manager
        )
        GoodsReceiptItem.objects.create(
            goods_receipt=grn,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="CIP-DEACT-01",
            expiry_date=timezone.localdate() + timedelta(days=365),
            quantity_sale_units=1,
            total_base_units=10,
            purchase_cost_per_sale_unit=Decimal("50.00"),
            unit_cost=Decimal("5.0000"),
            mrp=Decimal("80.00"),
            unit_mrp=Decimal("8.0000"),
            total_cost=Decimal("50.00")
        )

        res = self.client.post(
            f"/api/inventory/stores/{self.store1.id}/goods-receipts/{grn.id}/post/",
            {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("deactivated", str(res.json()["detail"]).lower())

    def test_14_cancelled_goods_receipt_cannot_be_posted(self):
        """A cancelled goods receipt cannot be posted to inventory."""
        self.client.force_authenticate(user=self.manager)
        grn = GoodsReceipt.objects.create(
            organization=self.org,
            store=self.store1,
            supplier=self.supplier,
            grn_number="GRN-CANC-01",
            supplier_invoice_number="INV-CANC-01",
            supplier_invoice_date=timezone.localdate(),
            status="CANCELLED",
            received_by=self.manager
        )
        res = self.client.post(
            f"/api/inventory/stores/{self.store1.id}/goods-receipts/{grn.id}/post/",
            {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cancelled", str(res.json()["detail"]).lower())

    def test_15_concurrent_goods_receipt_posting(self):
        """
        Two genuinely concurrent threads attempting to post the same goods receipt
        simultaneously using separate PostgreSQL connections.
        Exactly one posts to inventory; no double-crediting occurs.
        """
        grn = GoodsReceipt.objects.create(
            organization=self.org,
            store=self.store1,
            supplier=self.supplier,
            grn_number="GRN-CONC-01",
            supplier_invoice_number="INV-CONC-01",
            supplier_invoice_date=timezone.localdate(),
            received_by=self.owner
        )
        GoodsReceiptItem.objects.create(
            goods_receipt=grn,
            product=self.product,
            packaging_snapshot=self.snapshot,
            batch_number="CIP-CONC-01",
            expiry_date=timezone.localdate() + timedelta(days=365),
            quantity_sale_units=4,
            total_base_units=40,
            purchase_cost_per_sale_unit=Decimal("75.00"),
            unit_cost=Decimal("7.5000"),
            mrp=Decimal("110.00"),
            unit_mrp=Decimal("11.0000"),
            total_cost=Decimal("300.00")
        )

        barrier = threading.Barrier(2)
        op_key = uuid.uuid4()
        outcomes = []

        def worker():
            connections.close_all()
            try:
                barrier.wait(timeout=5)
                res, is_new = StockLedgerService.post_goods_receipt(
                    goods_receipt=grn,
                    actor=self.owner,
                    idempotency_key=op_key,
                    raw_payload={"grn_id": str(grn.id), "idempotency_key": str(op_key)}
                )
                outcomes.append(("success", is_new))
            except Exception as e:
                outcomes.append(("error", str(e)))
            finally:
                connections.close_all()

        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)
        t1.start()
        t2.start()
        t1.join(timeout=15)
        t2.join(timeout=15)

        # Verification: at most one is_new=True
        newly_posted = sum(1 for status_type, is_new in outcomes if status_type == "success" and is_new is True)
        self.assertEqual(newly_posted, 1)

        # Database state: exactly 40 base units on hand, 1 movement, 1 cost layer
        stock = StoreBatchStock.objects.get(store=self.store1, batch__batch_number="CIP-CONC-01")
        self.assertEqual(stock.quantity_on_hand, 40)
        self.assertEqual(StockMovement.objects.filter(store=self.store1, batch__batch_number="CIP-CONC-01").count(), 1)
        self.assertEqual(BatchInwardCostLayer.objects.filter(store=self.store1, batch__batch_number="CIP-CONC-01").count(), 1)
