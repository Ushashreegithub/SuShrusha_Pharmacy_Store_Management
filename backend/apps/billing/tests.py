import uuid
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.organizations.models import Organization, Store, OrganizationMembership, StoreMembership
from apps.products.models import Product
from apps.inventory.models import (
    Batch,
    StoreBatchStock,
    StockMovement,
    BatchInwardCostLayer,
    ProductPackagingSnapshot,
)
from apps.billing.models import (
    Customer,
    SaleDraft,
    SaleDraftItem,
    DiscountApprovalRequest,
    Invoice,
    Payment,
)
from apps.billing.services import BillingCalculator

User = get_user_model()


class BillingSystemTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Organization & Store
        self.owner = User.objects.create_user(
            email="owner@sushrusha.com",
            password="SecurePassword123!",
            full_name="Dr. Owner",
            is_email_verified=True,
        )
        self.org = Organization.objects.create(
            name="Sushrusha Pharmacy",
            slug="sushrusha-pharmacy",
            owner=self.owner,
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role="owner",
            is_active=True,
        )
        self.store = Store.objects.create(
            organization=self.org,
            name="Main Branch",
            code="STR-001",
            status="active",
        )

        # 2. Store Manager
        self.manager = User.objects.create_user(
            email="manager@sushrusha.com",
            password="SecurePassword123!",
            full_name="Manager Rajesh",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store,
            user=self.manager,
            role="manager",
            is_active=True,
        )

        # 3. Cashier
        self.cashier = User.objects.create_user(
            email="cashier@sushrusha.com",
            password="SecurePassword123!",
            full_name="Cashier Amit",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store,
            user=self.cashier,
            role="cashier",
            is_active=True,
        )

        # 4. Pharmacist
        self.pharmacist = User.objects.create_user(
            email="pharmacist@sushrusha.com",
            password="SecurePassword123!",
            full_name="Pharmacist Priya",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store,
            user=self.pharmacist,
            role="pharmacist",
            is_active=True,
        )

        # 5. Products & Packaging
        # Product A: Paracetamol 500mg (OTC, 1 strip = 10 tablets, loose allowed)
        self.prod_otc = Product.objects.create(
            organization=self.org,
            name="Paracetamol 500mg",
            brand_name="Dolo-650",
            generic_name="Paracetamol",
            sku="PARA-500",
            barcode="8901234567890",
            item_type="medicine",
            prescription_class="otc",
            base_unit="tablet",
            sale_unit="strip",
            conversion_factor=10,
            is_loose_dispensing_allowed=True,
            gst_rate=Decimal("12.00"),
            is_active=True,
        )
        self.snap_otc, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(self.prod_otc)

        # Product B: Amoxicillin 500mg (Rx Schedule H, 1 strip = 10 capsules, no loose)
        self.prod_rx = Product.objects.create(
            organization=self.org,
            name="Amoxicillin 500mg",
            brand_name="Mox-500",
            generic_name="Amoxicillin",
            sku="AMOX-500",
            barcode="8909876543210",
            item_type="medicine",
            prescription_class="schedule_h",
            base_unit="capsule",
            sale_unit="strip",
            conversion_factor=10,
            is_loose_dispensing_allowed=False,
            gst_rate=Decimal("12.00"),
            is_active=True,
        )
        self.snap_rx, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(self.prod_rx)

        # 6. Batches & Stock
        # Batch 1 for OTC: 100 tablets (10 strips), MRP ₹50.00/strip, expires next year
        today = timezone.localdate()
        self.batch_otc = Batch.objects.create(
            organization=self.org,
            product=self.prod_otc,
            packaging_snapshot=self.snap_otc,
            batch_number="LOT-PARA-001",
            expiry_date=today + timezone.timedelta(days=365),
            mrp=Decimal("50.00"),
            unit_mrp=Decimal("5.00"),
            status="active",
        )
        self.stock_otc = StoreBatchStock.objects.create(
            organization=self.org,
            store=self.store,
            product=self.prod_otc,
            batch=self.batch_otc,
            quantity_on_hand=100,
            quantity_quarantined=0,
        )
        self.cost_otc = BatchInwardCostLayer.objects.create(
            organization=self.org,
            store=self.store,
            batch=self.batch_otc,
            receipt_type="OPENING_STOCK",
            receipt_reference="INIT-001",
            original_quantity=100,
            remaining_quantity=100,
            purchase_cost_per_sale_unit=Decimal("30.00"),
            unit_cost=Decimal("3.0000"),
        )

        # Batch 2 for Rx: 50 capsules (5 strips), MRP ₹120.00/strip
        self.batch_rx = Batch.objects.create(
            organization=self.org,
            product=self.prod_rx,
            packaging_snapshot=self.snap_rx,
            batch_number="LOT-AMOX-001",
            expiry_date=today + timezone.timedelta(days=180),
            mrp=Decimal("120.00"),
            unit_mrp=Decimal("12.00"),
            status="active",
        )
        self.stock_rx = StoreBatchStock.objects.create(
            organization=self.org,
            store=self.store,
            product=self.prod_rx,
            batch=self.batch_rx,
            quantity_on_hand=50,
            quantity_quarantined=0,
        )
        self.cost_rx = BatchInwardCostLayer.objects.create(
            organization=self.org,
            store=self.store,
            batch=self.batch_rx,
            receipt_type="OPENING_STOCK",
            receipt_reference="INIT-002",
            original_quantity=50,
            remaining_quantity=50,
            purchase_cost_per_sale_unit=Decimal("80.00"),
            unit_cost=Decimal("8.0000"),
        )

        # 7. Customer
        self.customer = Customer.objects.create(
            organization=self.org,
            name="Rahul Sharma",
            phone_number="9876543210",
            address="Plot 12, Indiranagar",
        )

    # 1. Product Search & Barcode Lookup
    def test_pos_product_search_and_barcode_lookup(self):
        self.client.force_authenticate(user=self.cashier)
        url = f"/api/billing/stores/{self.store.id}/products/search/"

        # Search by name
        res = self.client.get(url, {"q": "Paracetamol"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["name"], "Paracetamol 500mg")
        self.assertEqual(res.data[0]["available_base_units"], 100)
        self.assertEqual(res.data[0]["available_packs"], 10)
        self.assertEqual(Decimal(str(res.data[0]["mrp"])), Decimal("50.00"))

        # Search by exact barcode
        res_bc = self.client.get(url, {"q": "8901234567890"})
        self.assertEqual(res_bc.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_bc.data), 1)
        self.assertEqual(res_bc.data[0]["sku"], "PARA-500")

    # 2. Customer Creation & Search
    def test_customer_creation_and_search(self):
        self.client.force_authenticate(user=self.cashier)
        url = f"/api/billing/stores/{self.store.id}/customers/"

        # Create new customer
        post_data = {
            "name": "Ananya Sen",
            "phone_number": "9123456789",
            "address": "Bhubaneswar, Odisha",
        }
        res = self.client.post(url, post_data)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["name"], "Ananya Sen")

        # Search by phone
        search_res = self.client.get(url, {"search": "9123456789"})
        self.assertEqual(search_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(search_res.data), 1)
        self.assertEqual(search_res.data[0]["name"], "Ananya Sen")

        # Test creating via global /api/billing/customers/ endpoint (without store_id)
        post_global = {
            "name": "Gayatri Behera",
            "phone_number": "9988776655",
        }
        res_global = self.client.post("/api/billing/customers/", post_global)
        self.assertEqual(res_global.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_global.data["name"], "Gayatri Behera")

        # Test search via global /api/billing/customers/ endpoint
        search_global = self.client.get("/api/billing/customers/", {"search": "Gayatri"})
        self.assertEqual(search_global.status_code, status.HTTP_200_OK)
        self.assertTrue(any(c["name"] == "Gayatri Behera" for c in search_global.data))

    # 2b. Customer Assignment to Draft & Edge Cases
    def test_draft_customer_assignment_and_edge_cases(self):
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]

        customer_url = f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/customer/"

        # 1. Assign customer via PATCH (canonical)
        res_patch = self.client.patch(customer_url, {"customer_id": str(self.customer.id)}, format="json")
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_patch.data["customer"])
        self.assertEqual(res_patch.data["customer"]["id"], str(self.customer.id))
        self.assertEqual(res_patch.data["customer"]["name"], self.customer.name)

        # 2. Clear customer via PATCH with null JSON
        res_clear = self.client.patch(customer_url, {"customer_id": None}, format="json")
        self.assertEqual(res_clear.status_code, status.HTTP_200_OK)
        self.assertIsNone(res_clear.data["customer"])

        # 3. Assign customer via POST (backward compatibility alias)
        res_post = self.client.post(customer_url, {"customer_id": str(self.customer.id)}, format="json")
        self.assertEqual(res_post.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_post.data["customer"])
        self.assertEqual(res_post.data["customer"]["id"], str(self.customer.id))

        # 4. Invalid UUID format -> 400
        res_bad_uuid = self.client.patch(customer_url, {"customer_id": "not-a-valid-uuid"}, format="json")
        self.assertEqual(res_bad_uuid.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. Non-existent customer ID -> 404
        random_id = str(uuid.uuid4())
        res_not_found = self.client.patch(customer_url, {"customer_id": random_id}, format="json")
        self.assertEqual(res_not_found.status_code, status.HTTP_404_NOT_FOUND)

        # 6. Cross-tenant customer ID -> 403 Forbidden
        other_user = User.objects.create_user(email="other@pharmacy.com", password="Password123!")
        other_org = Organization.objects.create(name="Other Pharmacy", slug="other-pharmacy", owner=other_user)
        other_customer = Customer.objects.create(organization=other_org, name="Other Customer", phone_number="9998887776")
        res_cross_tenant = self.client.patch(customer_url, {"customer_id": str(other_customer.id)}, format="json")
        self.assertEqual(res_cross_tenant.status_code, status.HTTP_403_FORBIDDEN)

        # 7. Completed or cancelled draft -> 400 Bad Request
        draft_obj = SaleDraft.objects.get(id=draft_id)
        draft_obj.status = "COMPLETED"
        draft_obj.save()
        res_completed = self.client.patch(customer_url, {"customer_id": str(self.customer.id)}, format="json")
        self.assertEqual(res_completed.status_code, status.HTTP_400_BAD_REQUEST)

    # 3. Sale Draft Creation, Item Addition, Loose Dispensing Validation
    def test_draft_item_addition_and_loose_dispensing(self):
        self.client.force_authenticate(user=self.cashier)

        # Get active draft
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        self.assertEqual(res_draft.status_code, status.HTTP_200_OK)
        draft_id = res_draft.data["id"]

        # Add 2 strips of Paracetamol (SALE_UNIT)
        item_url = f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/"
        res_item = self.client.post(item_url, {
            "product_id": str(self.prod_otc.id),
            "quantity": 2,
            "unit_type": "SALE_UNIT",
        })
        self.assertEqual(res_item.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_item.data["items"]), 1)
        self.assertEqual(res_item.data["items"][0]["quantity"], 2)
        self.assertEqual(res_item.data["items"][0]["total_base_units"], 20)

        # Attempt loose dispensing on Amoxicillin (where is_loose_dispensing_allowed = False) -> Must reject
        res_loose_fail = self.client.post(item_url, {
            "product_id": str(self.prod_rx.id),
            "quantity": 4,
            "unit_type": "BASE_UNIT",
        })
        self.assertEqual(res_loose_fail.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Loose dispensing is not permitted", res_loose_fail.data["detail"])

    # 4. Insufficient Stock Rejection
    def test_reject_insufficient_stock(self):
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]

        # Request 20 strips of Paracetamol (only 10 strips / 100 tablets available)
        item_url = f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/"
        res = self.client.post(item_url, {
            "product_id": str(self.prod_otc.id),
            "quantity": 20,
            "unit_type": "SALE_UNIT",
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Insufficient stock", res.data["detail"])

    # 5. Hold and Resume Draft Bill
    def test_hold_and_resume_bill(self):
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]

        # Add item
        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_otc.id),
            "quantity": 1,
            "unit_type": "SALE_UNIT",
        })

        # Hold bill
        hold_res = self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/hold/", {
            "notes": "Customer went to get wallet"
        })
        self.assertEqual(hold_res.status_code, status.HTTP_200_OK)
        self.assertEqual(hold_res.data["status"], "HELD")

        # Resume bill
        resume_res = self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/resume/")
        self.assertEqual(resume_res.status_code, status.HTTP_200_OK)
        self.assertEqual(resume_res.data["status"], "DRAFT")

    # 6. Manual Discount Request & Manager Approval
    def test_discount_request_and_manager_approval(self):
        # Step 1: Cashier creates draft with item
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]
        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_otc.id),
            "quantity": 2,  # ₹100 MRP
            "unit_type": "SALE_UNIT",
        })

        # Step 2: Cashier requests 10% discount
        disc_req_res = self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/discount-request/", {
            "discount_type": "PERCENTAGE",
            "discount_value": "10.00",
            "reason": "Senior citizen discount",
        })
        self.assertEqual(disc_req_res.status_code, status.HTTP_201_CREATED)
        req_id = disc_req_res.data["id"]

        # Step 3: Cashier cannot self-approve!
        self_approve_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/discount-requests/{req_id}/review/",
            {"approved": True}
        )
        self.assertEqual(self_approve_res.status_code, status.HTTP_403_FORBIDDEN)

        # Step 4: Store Manager approves discount
        self.client.force_authenticate(user=self.manager)
        mgr_approve_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/discount-requests/{req_id}/review/",
            {"approved": True}
        )
        self.assertEqual(mgr_approve_res.status_code, status.HTTP_200_OK)
        self.assertEqual(mgr_approve_res.data["discount_status"], "APPROVED")
        # Bill total should now reflect 10% off: ₹100 gross - ₹10 disc = ₹90 payable
        self.assertEqual(Decimal(str(mgr_approve_res.data["totals"]["final_payable"])), Decimal("90.00"))

    # 7. Cart Mutation Invalidates Discount Approval
    def test_cart_mutation_invalidates_approved_discount(self):
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]
        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_otc.id),
            "quantity": 1,
            "unit_type": "SALE_UNIT",
        })

        # Request discount
        disc_req = self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/discount-request/", {
            "discount_type": "PERCENTAGE",
            "discount_value": "10.00",
            "reason": "Regular patient",
        })
        req_id = disc_req.data["id"]

        # Manager approves
        self.client.force_authenticate(user=self.manager)
        self.client.post(f"/api/billing/stores/{self.store.id}/discount-requests/{req_id}/review/", {"approved": True})

        # Cashier modifies cart (adds another item or edits quantity)
        self.client.force_authenticate(user=self.cashier)
        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_otc.id),
            "quantity": 2,
            "unit_type": "SALE_UNIT",
        })

        # Verify discount status was reset to NONE!
        draft_obj = SaleDraft.objects.get(id=draft_id)
        self.assertEqual(draft_obj.discount_status, "NONE")

    # 8. Prescription Authorization Requirement
    def test_prescription_authorization_enforced(self):
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]

        # Add Schedule H medicine (Amoxicillin)
        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_rx.id),
            "quantity": 1,
            "unit_type": "SALE_UNIT",
        })

        # Attempt checkout without pharmacist sign-off -> Must reject!
        checkout_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/",
            {
                "draft_id": draft_id,
                "customer": {"name": "Test Patient", "phone_number": "9998887776"},
                "payments": [{"method": "CASH", "amount": "120.00"}],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
        )
        self.assertEqual(checkout_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Pharmacist verification is mandatory", checkout_res.data["detail"])

        # Pharmacist signs off with prescription and doctor name
        self.client.force_authenticate(user=self.pharmacist)
        rx_res = self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/verify-prescription/", {
            "prescription_number": "RX-2026-9921",
            "doctor_name": "Dr. S. Mohanty (MBBS, MD)",
        })
        self.assertEqual(rx_res.status_code, status.HTTP_200_OK)
        self.assertTrue(bool(rx_res.data["pharmacist_verified_at"]))

    # 9. Transactional Checkout & Stock Deduction
    def test_transactional_checkout_and_stock_deduction(self):
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]

        # Add 2 strips Paracetamol (20 base units) @ ₹50.00 = ₹100.00
        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_otc.id),
            "quantity": 2,
            "unit_type": "SALE_UNIT",
        })

        idempotency_key = f"CHECKOUT-{uuid.uuid4()}"
        checkout_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/",
            {
                "draft_id": draft_id,
                "customer": {"id": str(self.customer.id)},
                "payments": [
                    {
                        "method": "CASH",
                        "amount": "100.00",
                        "cash_tendered": "200.00",
                    }
                ],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=idempotency_key
        )
        self.assertEqual(checkout_res.status_code, status.HTTP_201_CREATED)
        inv_data = checkout_res.data["invoice"]
        self.assertEqual(inv_data["customer_name"], "Rahul Sharma")
        self.assertEqual(Decimal(str(inv_data["net_total"])), Decimal("100.00"))
        self.assertEqual(Decimal(str(inv_data["change_returned"])), Decimal("100.00"))

        # Verify StoreBatchStock was deducted atomically
        self.stock_otc.refresh_from_db()
        self.assertEqual(self.stock_otc.quantity_on_hand, 80)  # 100 - 20 = 80

        # Verify StockMovement was created
        movement = StockMovement.objects.filter(
            store=self.store,
            product=self.prod_otc,
            movement_type="SALE",
            direction="OUT"
        ).first()
        self.assertIsNotNone(movement)
        self.assertEqual(movement.quantity, 20)
        self.assertEqual(movement.balance_after, 80)

        # Verify FIFO Cost layer was depleted
        self.cost_otc.refresh_from_db()
        self.assertEqual(self.cost_otc.remaining_quantity, 80)

        # Idempotency replay check: repeat request with same key
        replay_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/",
            {
                "draft_id": draft_id,
                "customer": {"id": str(self.customer.id)},
                "payments": [{"method": "CASH", "amount": "100.00"}],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=idempotency_key
        )
        self.assertEqual(replay_res.status_code, status.HTTP_200_OK)
        self.assertFalse(replay_res.data["is_newly_created"])
        self.assertEqual(replay_res.data["invoice"]["id"], inv_data["id"])
        # Stock should NOT have been deducted a second time
        self.stock_otc.refresh_from_db()
        self.assertEqual(self.stock_otc.quantity_on_hand, 80)

    # 10. Split Payment Checkout (Cash + UPI) by Store Manager
    def test_split_payment_checkout(self):
        self.client.force_authenticate(user=self.manager)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]

        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_otc.id),
            "quantity": 1,  # ₹50.00
            "unit_type": "SALE_UNIT",
        })

        checkout_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/",
            {
                "draft_id": draft_id,
                "customer": {"name": "Split Customer", "phone_number": "9991112233"},
                "payments": [
                    {"method": "CASH", "amount": "30.00"},
                    {"method": "UPI", "amount": "20.00", "reference_number": "UPI-REF-12345"},
                ],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
        )
        self.assertEqual(checkout_res.status_code, status.HTTP_201_CREATED)
        inv = Invoice.objects.get(id=checkout_res.data["invoice"]["id"])
        self.assertEqual(inv.payments.count(), 2)
        self.assertEqual(inv.paid_amount, Decimal("50.00"))

    # 11. Phase 2 Two-Stage Durable Checkout Lifecycle: Full Cash Settlement
    def test_phase2_two_phase_cash_settlement(self):
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]

        # Add 1 pack OTC (₹50.00)
        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_otc.id),
            "quantity": 1,
            "unit_type": "SALE_UNIT",
        })

        # Step 1: Initiate Checkout
        idempotency_key = f"TEST-PHASE2-CASH-{uuid.uuid4()}"
        init_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/initiate/",
            {
                "draft_id": draft_id,
                "customer": {"id": str(self.customer.id)},
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=idempotency_key
        )
        self.assertEqual(init_res.status_code, status.HTTP_201_CREATED)
        attempt_id = init_res.data["id"]
        self.assertEqual(init_res.data["status"], "PENDING_PAYMENT")
        self.assertEqual(Decimal(str(init_res.data["payable_amount"])), Decimal("50.00"))

        # Step 2: Record Cash Payment (₹50 paid with ₹100 tendered -> ₹50 change)
        pay_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/payments/",
            {
                "method": "CASH",
                "amount": "50.00",
                "cash_tendered": "100.00",
            },
            format="json"
        )
        self.assertEqual(pay_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(pay_res.data["payment"]["status"], "CONFIRMED")
        self.assertEqual(pay_res.data["checkout_attempt"]["status"], "READY_TO_FINALIZE")

        # Step 3: Finalize Checkout
        fin_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/finalize/",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=idempotency_key
        )
        self.assertEqual(fin_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(fin_res.data["is_newly_created"])
        inv = fin_res.data["invoice"]
        self.assertEqual(inv["payment_status"], "PAID")
        self.assertEqual(Decimal(str(inv["net_total"])), Decimal("50.00"))
        self.assertEqual(Decimal(str(inv["change_returned"])), Decimal("50.00"))

        # Verify stock was deducted via canonical StockLedgerService
        self.stock_otc.refresh_from_db()
        self.assertEqual(self.stock_otc.quantity_on_hand, 90)  # 100 - 10 = 90

    # 12. Phase 2 Two-Stage Durable Checkout Lifecycle: UPI with Store Manager Manual Verification
    def test_phase2_upi_manager_verification_lifecycle(self):
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]

        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_otc.id),
            "quantity": 1,
            "unit_type": "SALE_UNIT",
        })

        # Initiate
        attempt_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/initiate/",
            {
                "draft_id": draft_id,
                "customer": {"name": "UPI Payer", "phone_number": "9812345678"},
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
        )
        attempt_id = attempt_res.data["id"]

        # Cashier records UPI Payment
        pay_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/payments/",
            {
                "method": "UPI",
                "amount": "50.00",
                "reference_number": "UPI-TXN-998877",
            },
            format="json"
        )
        self.assertEqual(pay_res.status_code, status.HTTP_201_CREATED)
        payment_id = pay_res.data["payment"]["id"]
        # Must require verification
        self.assertEqual(pay_res.data["payment"]["status"], "REQUIRES_VERIFICATION")
        self.assertEqual(pay_res.data["checkout_attempt"]["status"], "PAYMENT_PENDING_VERIFICATION")

        # Cashier tries to self-verify -> must be REJECTED (400)
        self_verify_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/payments/{payment_id}/verify/",
            {"approved": True},
            format="json"
        )
        self.assertEqual(self_verify_res.status_code, status.HTTP_400_BAD_REQUEST)

        # Cashier tries to finalize before verification -> must be REJECTED (400)
        early_fin_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/finalize/",
            {},
            format="json"
        )
        self.assertEqual(early_fin_res.status_code, status.HTTP_400_BAD_REQUEST)

        # Store Manager verifies the UPI Payment
        self.client.force_authenticate(user=self.manager)
        mgr_verify_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/payments/{payment_id}/verify/",
            {
                "approved": True,
                "verification_notes": "Verified against store UPI soundbox."
            },
            format="json"
        )
        self.assertEqual(mgr_verify_res.status_code, status.HTTP_200_OK)
        self.assertEqual(mgr_verify_res.data["payment"]["status"], "CONFIRMED")
        self.assertEqual(mgr_verify_res.data["checkout_attempt"]["status"], "READY_TO_FINALIZE")

        # Now cashier or manager finalizes successfully
        self.client.force_authenticate(user=self.cashier)
        fin_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/finalize/",
            {},
            format="json"
        )
        self.assertEqual(fin_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(fin_res.data["invoice"]["payment_status"], "PAID")

    # 13. Phase 2 Finalization Stock Shortage Guard
    def test_phase2_insufficient_stock_rollback(self):
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]

        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_otc.id),
            "quantity": 10,  # 100 base units (all available)
            "unit_type": "SALE_UNIT",
        })

        init_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/initiate/",
            {
                "draft_id": draft_id,
                "customer": {"id": str(self.customer.id)},
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
        )
        attempt_id = init_res.data["id"]

        # Record payment
        self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/payments/",
            {"method": "CASH", "amount": "500.00"},
            format="json"
        )

        # External event: stock is reduced before finalization!
        self.stock_otc.quantity_on_hand = 5  # Only 5 remaining now, need 100!
        self.stock_otc.save(update_fields=["quantity_on_hand"])

        # Finalization attempt must fail cleanly and set status to FAILED
        fin_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/finalize/",
            {},
            format="json"
        )
        self.assertEqual(fin_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Stock verification failed", fin_res.data["detail"])

    # 14. Phase 2 Idempotent Replay on Finalize
    def test_phase2_idempotent_finalize_replay(self):
        self.client.force_authenticate(user=self.cashier)
        res_draft = self.client.get(f"/api/billing/stores/{self.store.id}/drafts/active/")
        draft_id = res_draft.data["id"]

        self.client.post(f"/api/billing/stores/{self.store.id}/drafts/{draft_id}/items/", {
            "product_id": str(self.prod_otc.id),
            "quantity": 1,
            "unit_type": "SALE_UNIT",
        })

        idemp_key = f"IDEMP-REPLAY-{uuid.uuid4()}"
        init_res = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/initiate/",
            {
                "draft_id": draft_id,
                "customer": {"id": str(self.customer.id)},
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=idemp_key
        )
        attempt_id = init_res.data["id"]

        self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/payments/",
            {"method": "CASH", "amount": "50.00"},
            format="json"
        )

        fin_res1 = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/finalize/",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=idemp_key
        )
        self.assertEqual(fin_res1.status_code, status.HTTP_201_CREATED)
        self.assertTrue(fin_res1.data["is_newly_created"])

        # Replay finalize with same idempotency key
        fin_res2 = self.client.post(
            f"/api/billing/stores/{self.store.id}/checkout/{attempt_id}/finalize/",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=idemp_key
        )
        self.assertEqual(fin_res2.status_code, status.HTTP_200_OK)
        self.assertFalse(fin_res2.data["is_newly_created"])
        self.assertEqual(fin_res2.data["invoice"]["id"], fin_res1.data["invoice"]["id"])

