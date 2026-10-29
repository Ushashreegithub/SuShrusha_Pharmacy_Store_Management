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
    Supplier,
    GoodsReceipt,
    StockTransfer,
    StockAdjustment,
    PhysicalStockCount,
    StockQuarantineRecord,
    BatchRecall,
)
from apps.inventory.services import StockLedgerService

User = get_user_model()


class CompleteInventoryModuleTests(TransactionTestCase):
    """
    Automated integration tests for Complete Inventory Management Module:
    - Inventory Command Center Overview API (`/api/inventory/overview/`)
    - Stock Movement Ledger Explorer API (`/api/inventory/movements/` & `/api/inventory/ledger/`)
    - Role-based cost masking on movement ledger (Owner/Manager vs Pharmacist)
    - Action queue calculation (recalls, expired, near-expiry, transfers, adjustments)
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Organization & Owner
        self.owner = User.objects.create_user(
            email="owner_overview@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Dr. Owner Overview"
        )
        self.org = Organization.objects.create(
            name="PharmaPro Command Org",
            owner=self.owner,
            is_active=True
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role="owner",
            is_active=True
        )

        # 2. Store Manager & Pharmacist
        self.manager = User.objects.create_user(
            email="manager_overview@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Manager Rajesh"
        )
        self.pharmacist = User.objects.create_user(
            email="pharmacist_overview@pharmaPro.test",
            password="StrongPassword123!",
            full_name="Pharmacist Priya"
        )

        # 3. Stores
        self.store1 = Store.objects.create(
            name="Command Central Store",
            organization=self.org,
            code="CMD-01",
            status="active"
        )
        self.store2 = Store.objects.create(
            name="Branch Store Two",
            organization=self.org,
            code="CMD-02",
            status="active"
        )

        StoreMembership.objects.create(
            store=self.store1,
            user=self.manager,
            role="manager",
            is_active=True
        )
        StoreMembership.objects.create(
            store=self.store1,
            user=self.pharmacist,
            role="pharmacist",
            is_active=True
        )

        # 4. Product & Packaging Snapshot
        self.product = Product.objects.create(
            organization=self.org,
            name="Amoxicillin 500mg Capsules",
            sku="AMX-500-CMD",
            barcode="8901234567890",
            category="antibiotics",
            dosage_form="capsule",
            prescription_class="prescription",
            base_unit="capsule",
            sale_unit="strip",
            conversion_factor=10,
            is_loose_dispensing_allowed=True,
            is_active=True
        )
        self.snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(self.product)

        # 5. Initialize Opening Stock to generate Batches, StoreBatchStock, and StockMovement
        self.today = timezone.localdate()
        self.future_exp = self.today + timedelta(days=180)
        self.near_exp = self.today + timedelta(days=20)
        self.past_exp = self.today - timedelta(days=5)

        # Batch 1: Normal Safe Stock
        res1, _ = StockLedgerService.post_opening_stock(
            store=self.store1,
            actor=self.owner,
            idempotency_key=uuid.uuid4(),
            raw_payload={},
            validated_data={
                "product": self.product,
                "packaging_snapshot": self.snapshot,
                "batch_number": "BATCH-SAFE-01",
                "manufacturer_name": "Cipla Ltd",
                "manufacturing_date": self.today - timedelta(days=60),
                "expiry_date": self.future_exp,
                "mrp": Decimal("150.00"),
                "purchase_cost_per_sale_unit": Decimal("90.00"),
                "quantity_sale_units": 10,
                "quantity_loose_base_units": 0,
                "low_stock_threshold": 5,
                "receipt_reference": "OP-01",
                "reason": "Safe batch opening stock",
            }
        )

        # Batch 2: Near Expiry (<= 30 days)
        res2, _ = StockLedgerService.post_opening_stock(
            store=self.store1,
            actor=self.owner,
            idempotency_key=uuid.uuid4(),
            raw_payload={},
            validated_data={
                "product": self.product,
                "packaging_snapshot": self.snapshot,
                "batch_number": "BATCH-NEAR-EXP",
                "manufacturer_name": "Sun Pharma",
                "manufacturing_date": self.today - timedelta(days=300),
                "expiry_date": self.near_exp,
                "mrp": Decimal("120.00"),
                "purchase_cost_per_sale_unit": Decimal("75.00"),
                "quantity_sale_units": 5,
                "quantity_loose_base_units": 0,
                "low_stock_threshold": 5,
                "receipt_reference": "OP-02",
                "reason": "Near expiry batch opening stock",
            }
        )

    def test_inventory_overview_kpis_and_action_queue(self):
        """Verify GET /api/inventory/overview/ calculates KPIs and actionable alerts accurately."""
        self.client.force_authenticate(user=self.owner)
        res = self.client.get(f"/api/inventory/overview/?store_id={self.store1.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.json()
        kpis = data["kpis"]

        # Total products cataloged
        self.assertEqual(kpis["total_products"], 1)
        # Active batches: 2 batches (100 + 50 = 150 base units)
        self.assertEqual(kpis["active_batches"], 2)
        self.assertEqual(kpis["total_on_hand_units"], 150)
        self.assertEqual(kpis["available_units"], 150)
        # Critical near expiry count should detect BATCH-NEAR-EXP (expiring in 20 days <= 30 days)
        self.assertEqual(kpis["critical_near_expiry_count"], 1)

        # Action Queue should include the near expiry alert
        action_queue = data["action_queue"]
        near_expiry_alerts = [a for a in action_queue if a["type"] == "NEAR_EXPIRY"]
        self.assertEqual(len(near_expiry_alerts), 1)
        self.assertEqual(near_expiry_alerts[0]["count"], 1)

        # Recent movements should contain the 2 opening stock records
        recent = data["recent_movements"]
        self.assertGreaterEqual(len(recent), 2)
        self.assertEqual(recent[0]["movement_type"], "OPENING_STOCK")

    def test_stock_ledger_list_and_filters(self):
        """Verify GET /api/inventory/movements/ returns immutable transaction logs with filters."""
        self.client.force_authenticate(user=self.manager)
        res = self.client.get(f"/api/inventory/movements/?store_id={self.store1.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.json()
        self.assertIn("count", data)
        self.assertIn("results", data)
        self.assertGreaterEqual(data["count"], 2)

        # Filter by movement_type
        res_filter = self.client.get(f"/api/inventory/movements/?store_id={self.store1.id}&movement_type=OPENING_STOCK")
        self.assertEqual(res_filter.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res_filter.json()["count"], 2)

        # Filter by batch_number search
        res_search = self.client.get(f"/api/inventory/movements/?store_id={self.store1.id}&search=BATCH-SAFE-01")
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        self.assertEqual(res_search.json()["count"], 1)
        self.assertEqual(res_search.json()["results"][0]["batch_number"], "BATCH-SAFE-01")

        # Ledger alias endpoint works identically
        res_alias = self.client.get(f"/api/inventory/ledger/?store_id={self.store1.id}")
        self.assertEqual(res_alias.status_code, status.HTTP_200_OK)
        self.assertEqual(res_alias.json()["count"], data["count"])

    def test_stock_ledger_server_side_cost_masking(self):
        """
        Verify that sensitive unit_cost and total_cost_value fields in StockMovement
        are visible to Store Managers and Owners, but strictly masked for Pharmacists.
        """
        # Manager view -> cost visible
        self.client.force_authenticate(user=self.manager)
        res_mgr = self.client.get(f"/api/inventory/movements/?store_id={self.store1.id}")
        self.assertEqual(res_mgr.status_code, status.HTTP_200_OK)
        item_mgr = res_mgr.json()["results"][0]
        self.assertIn("unit_cost", item_mgr)
        self.assertIn("total_cost_value", item_mgr)

        # Pharmacist view -> cost strictly masked
        self.client.force_authenticate(user=self.pharmacist)
        res_pharm = self.client.get(f"/api/inventory/movements/?store_id={self.store1.id}")
        self.assertEqual(res_pharm.status_code, status.HTTP_200_OK)
        item_pharm = res_pharm.json()["results"][0]
        self.assertNotIn("unit_cost", item_pharm)
        self.assertNotIn("total_cost_value", item_pharm)
        # Public identifiers remain visible
        self.assertIn("unit_mrp", item_pharm)
        self.assertIn("quantity", item_pharm)
        self.assertIn("balance_after", item_pharm)
