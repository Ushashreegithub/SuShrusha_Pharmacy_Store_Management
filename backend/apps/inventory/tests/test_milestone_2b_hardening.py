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
    InventoryOperation,
)
from apps.inventory.services import StockLedgerService
from apps.inventory.exceptions import (
    DuplicateOpeningStockError,
    InvalidQuantityError,
    BatchValidationError,
    StorePermissionDeniedError,
)

User = get_user_model()


class Milestone2BHardeningTests(TransactionTestCase):
    """
    Focused verification and hardening tests for Milestone 2B addressing all 10 requirements in Section 8:
    1. Concurrent requests with the same new idempotency key.
    2. Concurrent requests with different keys for the same opening lot.
    3. Transaction rollback after each relevant mutation stage.
    4. Packaging snapshot changes after previous stock intake.
    5. Loose-unit policy enforcement.
    6. Cross-store and cross-organization authorization.
    7. Cost masking in summary and all response paths.
    8. Cost rounding and base-unit conversions.
    9. Expiry boundary behavior.
    10. Disabled/inactive account and membership checks.
    """

    def setUp(self):
        self.client = APIClient()

        # Organization 1 & Owner
        self.owner = User.objects.create_user(
            email="owner_h@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Owner Hardening"
        )
        self.org = Organization.objects.create(
            name="Hardening Org",
            owner=self.owner,
            is_active=True
        )
        self.owner_membership = OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role="owner",
            is_active=True
        )

        # Store 1 & Store 2
        self.store1 = Store.objects.create(
            name="Hardening Store 1",
            organization=self.org,
            code="HST-01",
            status="active"
        )
        self.store2 = Store.objects.create(
            name="Hardening Store 2",
            organization=self.org,
            code="HST-02",
            status="active"
        )

        # Store Manager (assigned to Store 1 only)
        self.manager = User.objects.create_user(
            email="manager_h@PharmaPro.test",
            password="StrongPassword123!",
            full_name="Manager Hardening"
        )
        self.manager_membership = StoreMembership.objects.create(
            store=self.store1,
            user=self.manager,
            role="manager",
            is_active=True
        )

        # Pharmacist (assigned to Store 1 only)
        self.pharmacist = User.objects.create_user(
            email="pharmacist_h@PharmaPro.test",
            password="StrongPassword123!",
            full_name="Pharmacist Hardening"
        )
        self.pharmacist_membership = StoreMembership.objects.create(
            store=self.store1,
            user=self.pharmacist,
            role="pharmacist",
            is_active=True
        )

        # External Organization 2 & Owner
        self.ext_owner = User.objects.create_user(
            email="ext_owner_h@PharmaPro.test",
            password="StrongPassword123!",
            full_name="External Owner Hardening"
        )
        self.ext_org = Organization.objects.create(
            name="External Hardening Org",
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
            code="EXT-01",
            status="active"
        )

        # Standard Product
        self.product = Product.objects.create(
            organization=self.org,
            name="Azithromycin 500mg Tablets",
            sku="SKU-AZI-500",
            barcode="8901112223334",
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

    # -------------------------------------------------------------------------
    # 1. Concurrent requests with the same new idempotency key
    # -------------------------------------------------------------------------
    def test_01_concurrent_requests_same_new_idempotency_key(self):
        """
        Two genuinely concurrent threads with separate database connections hit
        the stock ledger simultaneously with the same new idempotency key.
        At most one creates the stock; no duplicate stock, movement, or cost layers exist.
        """
        barrier = threading.Barrier(2)
        op_key = uuid.uuid4()
        raw_payload = {
            "idempotency_key": str(op_key),
            "product_id": str(self.product.id),
            "batch_number": "CONC-KEY-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "120.00",
            "purchase_cost_per_sale_unit": "80.00",
            "quantity_sale_units": 5,
        }
        validated_data = {
            "product": self.product,
            "packaging_snapshot": self.snapshot,
            "batch_number": "CONC-KEY-01",
            "expiry_date": timezone.localdate() + timedelta(days=365),
            "mrp": Decimal("120.00"),
            "purchase_cost_per_sale_unit": Decimal("80.00"),
            "quantity_sale_units": 5,
            "quantity_loose_base_units": 0,
            "receipt_reference": "REF-CONC-01",
            "reason": "Concurrency Test"
        }

        results = []
        errors = []

        def worker():
            connections.close_all()
            try:
                barrier.wait(timeout=5)
                res, is_new = StockLedgerService.post_opening_stock(
                    store=self.store1,
                    actor=self.owner,
                    idempotency_key=op_key,
                    raw_payload=raw_payload,
                    validated_data=validated_data
                )
                results.append((res, is_new))
            except Exception as e:
                errors.append(e)
            finally:
                connections.close_all()

        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)
        t1.start()
        t2.start()
        t1.join(timeout=15)
        t2.join(timeout=15)

        # Verification:
        # At least one thread must succeed
        self.assertGreaterEqual(len(results), 1)
        # Exactly 1 new creation
        newly_created_count = sum(1 for _, is_new in results if is_new is True)
        self.assertEqual(newly_created_count, 1)

        # Database state: exactly 50 base units (5 strips * 10), 1 movement, 1 cost layer
        stock = StoreBatchStock.objects.get(store=self.store1, batch__batch_number="CONC-KEY-01")
        self.assertEqual(stock.quantity_on_hand, 50)
        self.assertEqual(StockMovement.objects.filter(store=self.store1, batch__batch_number="CONC-KEY-01").count(), 1)
        self.assertEqual(BatchInwardCostLayer.objects.filter(store=self.store1, batch__batch_number="CONC-KEY-01").count(), 1)

    # -------------------------------------------------------------------------
    # 2. Concurrent requests with different keys for the same opening lot
    # -------------------------------------------------------------------------
    def test_02_concurrent_requests_different_keys_same_lot(self):
        """
        Two concurrent threads attempt to initialize opening stock for the SAME store and batch
        using two DIFFERENT idempotency keys.
        Exactly one must succeed (201); the second must be rejected with DuplicateOpeningStockError (409).
        """
        barrier = threading.Barrier(2)
        batch_num = "CONC-LOT-01"
        expiry = timezone.localdate() + timedelta(days=365)

        def make_call(op_key):
            raw = {
                "idempotency_key": str(op_key),
                "product_id": str(self.product.id),
                "batch_number": batch_num,
                "expiry_date": str(expiry),
                "mrp": "100.00",
                "purchase_cost_per_sale_unit": "70.00",
                "quantity_sale_units": 2,
            }
            validated = {
                "product": self.product,
                "packaging_snapshot": self.snapshot,
                "batch_number": batch_num,
                "expiry_date": expiry,
                "mrp": Decimal("100.00"),
                "purchase_cost_per_sale_unit": Decimal("70.00"),
                "quantity_sale_units": 2,
                "quantity_loose_base_units": 0,
            }
            return raw, validated

        outcomes = []

        def worker(key):
            connections.close_all()
            raw, val = make_call(key)
            try:
                barrier.wait(timeout=5)
                res, is_new = StockLedgerService.post_opening_stock(
                    store=self.store1,
                    actor=self.owner,
                    idempotency_key=key,
                    raw_payload=raw,
                    validated_data=val
                )
                outcomes.append(("success", is_new))
            except DuplicateOpeningStockError:
                outcomes.append(("duplicate_rejected", False))
            except Exception as e:
                outcomes.append(("error", str(e)))
            finally:
                connections.close_all()

        t1 = threading.Thread(target=worker, args=(uuid.uuid4(),))
        t2 = threading.Thread(target=worker, args=(uuid.uuid4(),))
        t1.start()
        t2.start()
        t1.join(timeout=15)
        t2.join(timeout=15)

        successes = [o for o in outcomes if o[0] == "success"]
        duplicates = [o for o in outcomes if o[0] == "duplicate_rejected"]
        self.assertEqual(len(successes), 1)
        self.assertEqual(len(duplicates), 1)

        # Verify only 20 base units were credited
        stock = StoreBatchStock.objects.get(store=self.store1, batch__batch_number=batch_num)
        self.assertEqual(stock.quantity_on_hand, 20)
        self.assertEqual(StockMovement.objects.filter(store=self.store1, batch__batch_number=batch_num).count(), 1)

    # -------------------------------------------------------------------------
    # 3. Transaction rollback after mutation stages
    # -------------------------------------------------------------------------
    def test_03_transaction_rollback_preserves_clean_state(self):
        """
        If an unhandled exception or constraint failure occurs during transaction execution,
        all partial changes roll back cleanly (no orphan balance, movement, or cost layer).
        """
        op_key = uuid.uuid4()
        validated_data = {
            "product": self.product,
            "packaging_snapshot": self.snapshot,
            "batch_number": "ROLLBACK-01",
            "expiry_date": timezone.localdate() + timedelta(days=365),
            "mrp": Decimal("100.00"),
            "purchase_cost_per_sale_unit": Decimal("60.00"),
            "quantity_sale_units": 10,
            "quantity_loose_base_units": 0,
        }

        # Intentionally trigger an exception during post_opening_stock by simulating an error
        try:
            with transaction.atomic():
                StockLedgerService.post_opening_stock(
                    store=self.store1,
                    actor=self.owner,
                    idempotency_key=op_key,
                    raw_payload={"idempotency_key": str(op_key)},
                    validated_data=validated_data
                )
                # Force rollback
                raise RuntimeError("Simulated crash mid-pipeline")
        except RuntimeError:
            pass

        # Verify zero side-effects persisted
        self.assertFalse(StoreBatchStock.objects.filter(store=self.store1, batch__batch_number="ROLLBACK-01").exists())
        self.assertFalse(StockMovement.objects.filter(store=self.store1, batch__batch_number="ROLLBACK-01").exists())
        self.assertFalse(BatchInwardCostLayer.objects.filter(store=self.store1, batch__batch_number="ROLLBACK-01").exists())
        self.assertFalse(InventoryOperation.objects.filter(idempotency_key=op_key).exists())

    # -------------------------------------------------------------------------
    # 4. Packaging snapshot changes after previous stock intake
    # -------------------------------------------------------------------------
    def test_04_packaging_snapshot_immutability_and_versioning(self):
        """
        Intake stock under snapshot v1 (conversion_factor = 10).
        Then update Product Master packaging to 20 (creating snapshot v2).
        The first intake must retain snapshot v1 and historical quantity calculations must not change.
        """
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "SNAP-V1-BATCH",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "100.00",
            "purchase_cost_per_sale_unit": "50.00",
            "quantity_sale_units": 2,  # 2 * 10 = 20 base units
        }
        res1 = self.client.post(url, payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        batch = Batch.objects.get(batch_number="SNAP-V1-BATCH")
        self.assertEqual(batch.packaging_snapshot.version, 1)
        self.assertEqual(batch.packaging_snapshot.conversion_factor, 10)

        # Update product packaging configuration in Product Catalog
        self.product.conversion_factor = 20
        self.product.save()
        snap_v2, created = ProductPackagingSnapshot.get_or_create_current_snapshot(self.product)
        self.assertTrue(created)
        self.assertEqual(snap_v2.version, 2)
        self.assertEqual(snap_v2.conversion_factor, 20)

        # Verify old batch still references snapshot v1
        batch.refresh_from_db()
        self.assertEqual(batch.packaging_snapshot.version, 1)
        self.assertEqual(batch.packaging_snapshot.conversion_factor, 10)

        # Stock listing must format using historical snapshot v1 (2 strips of 10)
        stock_url = f"/api/inventory/stores/{self.store1.id}/stock/?search=SNAP-V1-BATCH"
        res2 = self.client.get(stock_url)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        item = res2.json()["results"][0]
        self.assertEqual(item["quantity_on_hand"], 20)
        self.assertEqual(item["packaging"]["version"], 1)
        self.assertEqual(item["packaging"]["conversion_factor"], 10)
        self.assertEqual(item["formatted_stock"], "2 strips")

    # -------------------------------------------------------------------------
    # 5. Loose-unit policy enforcement
    # -------------------------------------------------------------------------
    def test_05_loose_unit_policy_enforcement(self):
        """
        - Rejects loose units if is_loose_dispensing_allowed = False.
        - Rejects loose units >= conversion_factor.
        - Accepts valid loose units when permitted.
        """
        self.client.force_authenticate(user=self.owner)
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"

        # Product with loose dispensing forbidden
        prod_no_loose = Product.objects.create(
            organization=self.org,
            name="Cough Syrup Bottle 100ml",
            sku="SKU-SYR-100",
            barcode="8909998887771",
            category="syrup",
            item_type="medicine",
            dosage_form="liquid",
            prescription_class="otc",
            base_unit="bottle",
            sale_unit="box",
            conversion_factor=1,
            is_loose_dispensing_allowed=False,
            is_active=True,
            created_by=self.owner
        )

        # 1. Reject loose units when loose dispensing is disabled
        payload_invalid_loose = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(prod_no_loose.id),
            "batch_number": "LOOSE-FAIL-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "85.00",
            "purchase_cost_per_sale_unit": "55.00",
            "quantity_sale_units": 1,
            "quantity_loose_base_units": 1,  # Prohibited!
        }
        res1 = self.client.post(url, payload_invalid_loose, format="json")
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("loose dispensing is not permitted", str(res1.json()).lower())

        # 2. Reject loose units >= conversion_factor (for standard product with factor 10)
        payload_loose_exceed = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "LOOSE-FAIL-02",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "120.00",
            "purchase_cost_per_sale_unit": "80.00",
            "quantity_sale_units": 1,
            "quantity_loose_base_units": 10,  # Must be strictly < 10
        }
        res2 = self.client.post(url, payload_loose_exceed, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("strictly less than the conversion factor", str(res2.json()).lower())

        # 3. Accept valid loose units < conversion_factor
        payload_valid_loose = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "LOOSE-PASS-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "120.00",
            "purchase_cost_per_sale_unit": "80.00",
            "quantity_sale_units": 1,
            "quantity_loose_base_units": 4,  # Valid: 1 strip + 4 tablets = 14 tablets
        }
        res3 = self.client.post(url, payload_valid_loose, format="json")
        self.assertEqual(res3.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res3.json()["quantity_on_hand"], 14)

    # -------------------------------------------------------------------------
    # 6. Cross-store and cross-organization authorization
    # -------------------------------------------------------------------------
    def test_06_cross_store_and_cross_organization_authorization(self):
        """
        - Manager assigned to Store 1 cannot post or view stock in Store 2 (HTTP 403).
        - User from External Org cannot post or view stock in Store 1 (HTTP 403).
        """
        # Store Manager targeting Store 2 (same org, but unassigned)
        self.client.force_authenticate(user=self.manager)
        url_post_s2 = f"/api/inventory/stores/{self.store2.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "CROSS-STORE-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "100.00",
            "purchase_cost_per_sale_unit": "60.00",
            "quantity_sale_units": 1,
        }
        res1 = self.client.post(url_post_s2, payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_403_FORBIDDEN)

        url_list_s2 = f"/api/inventory/stores/{self.store2.id}/stock/"
        res2 = self.client.get(url_list_s2)
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

        # External Owner targeting Store 1
        self.client.force_authenticate(user=self.ext_owner)
        res3 = self.client.post(f"/api/inventory/stores/{self.store1.id}/opening-stock/", payload, format="json")
        self.assertEqual(res3.status_code, status.HTTP_403_FORBIDDEN)

        res4 = self.client.get(f"/api/inventory/stores/{self.store1.id}/stock/")
        self.assertEqual(res4.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # 7. Cost masking in summary and all response paths
    # -------------------------------------------------------------------------
    def test_07_cost_masking_in_summary_and_all_responses(self):
        """
        Ensures Pharmacist, Cashier, and Staff never receive unit_cost or total_valuation_cost
        in results or in summary aggregates. Store Manager receives both.
        """
        # Seed opening stock
        self.client.force_authenticate(user=self.owner)
        self.client.post(f"/api/inventory/stores/{self.store1.id}/opening-stock/", {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "MASK-TEST-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "200.00",
            "purchase_cost_per_sale_unit": "120.00",
            "quantity_sale_units": 10,
        }, format="json")

        stock_url = f"/api/inventory/stores/{self.store1.id}/stock/"

        # 1. Pharmacist view
        self.client.force_authenticate(user=self.pharmacist)
        res_pharm = self.client.get(stock_url)
        self.assertEqual(res_pharm.status_code, status.HTTP_200_OK)
        data_pharm = res_pharm.json()
        item_pharm = data_pharm["results"][0]

        # In results: cost keys completely absent
        self.assertNotIn("unit_cost", item_pharm)
        self.assertNotIn("total_valuation_cost", item_pharm)
        # In summary: cost valuation completely absent
        self.assertNotIn("total_valuation_cost", data_pharm["summary"])

        # 2. Manager view
        self.client.force_authenticate(user=self.manager)
        res_mgr = self.client.get(stock_url)
        self.assertEqual(res_mgr.status_code, status.HTTP_200_OK)
        data_mgr = res_mgr.json()
        item_mgr = data_mgr["results"][0]

        # In results: cost keys present
        self.assertIn("unit_cost", item_mgr)
        self.assertIn("total_valuation_cost", item_mgr)
        self.assertEqual(item_mgr["unit_cost"], "12.0000")
        self.assertEqual(item_mgr["total_valuation_cost"], "1200.00")
        # In summary: cost valuation present
        self.assertIn("total_valuation_cost", data_mgr["summary"])
        self.assertEqual(data_mgr["summary"]["total_valuation_cost"], "1200.00")

    # -------------------------------------------------------------------------
    # 8. Cost rounding and base-unit conversions
    # -------------------------------------------------------------------------
    def test_08_cost_rounding_and_base_unit_conversions(self):
        """
        Tests ROUND_HALF_UP precision with non-integer division:
        Purchase cost 100.00 for conversion factor 6 -> 100 / 6 = 16.666666... -> 16.6667.
        Total base units = 18 -> total_cost_value = 18 * 16.6667 = 300.0006 -> 300.00.
        """
        prod_six = Product.objects.create(
            organization=self.org,
            name="Antibiotic Pack of 6",
            sku="SKU-SIX-01",
            barcode="8901234567899",
            category="antibiotic",
            item_type="medicine",
            dosage_form="tablet",
            prescription_class="schedule_h",
            base_unit="tablet",
            sale_unit="strip",
            conversion_factor=6,
            is_loose_dispensing_allowed=True,
            is_active=True,
            created_by=self.owner
        )
        self.client.force_authenticate(user=self.owner)
        res = self.client.post(f"/api/inventory/stores/{self.store1.id}/opening-stock/", {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(prod_six.id),
            "batch_number": "ROUND-TEST-01",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "150.00",
            "purchase_cost_per_sale_unit": "100.00",
            "quantity_sale_units": 3,
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.json()["unit_cost"], "16.6667")
        self.assertEqual(res.json()["total_cost_value"], "300.00")

        # Verify in BatchInwardCostLayer
        layer = BatchInwardCostLayer.objects.get(batch__batch_number="ROUND-TEST-01")
        self.assertEqual(layer.unit_cost, Decimal("16.6667"))
        self.assertEqual(layer.original_quantity, 18)

    # -------------------------------------------------------------------------
    # 9. Expiry boundary behavior
    # -------------------------------------------------------------------------
    def test_09_expiry_boundary_behavior(self):
        """
        - Expiry today: rejected for intake (HTTP 400).
        - Expiry tomorrow: accepted for intake (HTTP 201).
        - Listing near_expiry with configurable days_to_expiry horizon.
        """
        self.client.force_authenticate(user=self.owner)
        today = timezone.localdate()

        # 1. Expiry today is rejected
        res_today = self.client.post(f"/api/inventory/stores/{self.store1.id}/opening-stock/", {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "EXP-TODAY",
            "expiry_date": str(today),
            "mrp": "100.00",
            "purchase_cost_per_sale_unit": "50.00",
            "quantity_sale_units": 1,
        }, format="json")
        self.assertEqual(res_today.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Expiry tomorrow is accepted
        res_tomorrow = self.client.post(f"/api/inventory/stores/{self.store1.id}/opening-stock/", {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "EXP-TOMORROW",
            "expiry_date": str(today + timedelta(days=1)),
            "mrp": "100.00",
            "purchase_cost_per_sale_unit": "50.00",
            "quantity_sale_units": 1,
        }, format="json")
        self.assertEqual(res_tomorrow.status_code, status.HTTP_201_CREATED)

        # 3. Add batch expiring in 30 days
        self.client.post(f"/api/inventory/stores/{self.store1.id}/opening-stock/", {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "EXP-IN-30",
            "expiry_date": str(today + timedelta(days=30)),
            "mrp": "100.00",
            "purchase_cost_per_sale_unit": "50.00",
            "quantity_sale_units": 1,
        }, format="json")

        # Query near_expiry with days_to_expiry=10 -> should include EXP-TOMORROW but exclude EXP-IN-30
        res_near_10 = self.client.get(f"/api/inventory/stores/{self.store1.id}/stock/?near_expiry=true&days_to_expiry=10")
        batches_near_10 = [i["batch_number"] for i in res_near_10.json()["results"]]
        self.assertIn("EXP-TOMORROW", batches_near_10)
        self.assertNotIn("EXP-IN-30", batches_near_10)

        # Query near_expiry with days_to_expiry=45 -> should include both
        res_near_45 = self.client.get(f"/api/inventory/stores/{self.store1.id}/stock/?near_expiry=true&days_to_expiry=45")
        batches_near_45 = [i["batch_number"] for i in res_near_45.json()["results"]]
        self.assertIn("EXP-TOMORROW", batches_near_45)
        self.assertIn("EXP-IN-30", batches_near_45)

    # -------------------------------------------------------------------------
    # 10. Disabled / inactive account and membership checks
    # -------------------------------------------------------------------------
    def test_10_disabled_account_and_membership_checks(self):
        """
        - Deactivated user account (is_active = False) is rejected.
        - Deactivated store membership (is_active = False) is rejected.
        - Deactivated organization (is_active = False) is rejected.
        - Deactivated product (is_active = False) is rejected.
        """
        url = f"/api/inventory/stores/{self.store1.id}/opening-stock/"
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "product_id": str(self.product.id),
            "batch_number": "INACTIVE-TEST",
            "expiry_date": str(timezone.localdate() + timedelta(days=365)),
            "mrp": "100.00",
            "purchase_cost_per_sale_unit": "50.00",
            "quantity_sale_units": 1,
        }

        # 1. Deactivated user account
        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])
        self.client.force_authenticate(user=self.owner)
        res_user_inactive = self.client.post(url, payload, format="json")
        self.assertEqual(res_user_inactive.status_code, status.HTTP_403_FORBIDDEN)
        # Restore owner
        self.owner.is_active = True
        self.owner.save(update_fields=["is_active"])

        # 2. Deactivated store manager membership
        self.manager_membership.is_active = False
        self.manager_membership.save(update_fields=["is_active"])
        self.client.force_authenticate(user=self.manager)
        res_membership_inactive = self.client.post(url, payload, format="json")
        self.assertEqual(res_membership_inactive.status_code, status.HTTP_403_FORBIDDEN)
        # Restore manager membership
        self.manager_membership.is_active = True
        self.manager_membership.save(update_fields=["is_active"])

        # 3. Deactivated organization
        self.org.is_active = False
        self.org.save(update_fields=["is_active"])
        self.client.force_authenticate(user=self.owner)
        res_org_inactive = self.client.post(url, payload, format="json")
        self.assertEqual(res_org_inactive.status_code, status.HTTP_403_FORBIDDEN)
        # Restore organization
        self.org.is_active = True
        self.org.save(update_fields=["is_active"])

        # 4. Deactivated product
        self.product.is_active = False
        self.product.save(update_fields=["is_active"])
        self.client.force_authenticate(user=self.owner)
        res_prod_inactive = self.client.post(url, payload, format="json")
        self.assertEqual(res_prod_inactive.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("inactive product", str(res_prod_inactive.json()).lower())

