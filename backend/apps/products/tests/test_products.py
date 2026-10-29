from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.authentication.models import User
from apps.organizations.models import Organization, Store, OrganizationMembership, StoreMembership
from apps.products.models import Product
from apps.audit.models import AuditEvent


class ProductMasterTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Organization A (Primary)
        self.owner_a = User.objects.create_user(
            email="owner.a@pharmaPro.com",
            password="StrongPassword@2026",
            full_name="Dr. Owner A",
            phone_number="+91 98765 00001",
            is_email_verified=True,
        )
        self.org_a = Organization.objects.create(
            name="Apex Health Network",
            owner=self.owner_a,
        )
        OrganizationMembership.objects.create(
            organization=self.org_a,
            user=self.owner_a,
            role="owner",
            is_active=True,
        )
        self.store_a1 = Store.objects.create(
            organization=self.org_a,
            name="Apex Central Branch",
            code="APX-001",
            status="active",
        )

        # Manager in Org A
        self.manager_a = User.objects.create_user(
            email="manager.a@PharmaPro.com",
            password="StrongPassword@2026",
            full_name="Manager Alice",
            phone_number="+91 98765 00002",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store_a1,
            user=self.manager_a,
            role="manager",
            is_active=True,
        )

        # Pharmacist in Org A
        self.pharmacist_a = User.objects.create_user(
            email="pharmacist.a@PharmaPro.com",
            password="StrongPassword@2026",
            full_name="Pharmacist Bob",
            phone_number="+91 98765 00003",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store_a1,
            user=self.pharmacist_a,
            role="pharmacist",
            is_active=True,
        )

        # 2. Organization B (Isolated Tenant)
        self.owner_b = User.objects.create_user(
            email="owner.b@PharmaPro.com",
            password="StrongPassword@2026",
            full_name="Dr. Owner B",
            phone_number="+91 98765 00004",
            is_email_verified=True,
        )
        self.org_b = Organization.objects.create(
            name="Beacon Pharmacy Systems",
            owner=self.owner_b,
        )
        OrganizationMembership.objects.create(
            organization=self.org_b,
            user=self.owner_b,
            role="owner",
            is_active=True,
        )

        # Pre-seed a product in Org A
        self.product_paracetamol = Product.objects.create(
            organization=self.org_a,
            name="Paracetamol 500mg Tablets",
            brand_name="Crocin Advance",
            generic_name="Paracetamol",
            sku="MED-PARA-500",
            barcode="8901030000001",
            category="prescription_medicines",
            item_type="medicine",
            manufacturer="GlaxoSmithKline",
            strength="500 mg",
            dosage_form="tablet",
            prescription_class="otc",
            pack_description="Strip of 15 tablets",
            base_unit="tablet",
            sale_unit="strip",
            conversion_factor=15,
            gst_rate=Decimal("12.00"),
            is_active=True,
            created_by=self.owner_a,
            updated_by=self.owner_a,
        )

        # Pre-seed an archived product in Org A
        self.product_archived = Product.objects.create(
            organization=self.org_a,
            name="Old Vitamin C Syrup",
            sku="MED-VITC-OLD",
            category="supplements_nutrition",
            item_type="wellness_supplement",
            is_active=False,
            created_by=self.owner_a,
        )

        # Pre-seed a product in Org B
        self.product_org_b = Product.objects.create(
            organization=self.org_b,
            name="Org B Digital Thermometer",
            sku="DEV-THERMO-01",
            category="healthcare_devices",
            item_type="device_equipment",
            is_active=True,
            created_by=self.owner_b,
        )

        self.list_create_url = reverse("product-list-create")
        self.metadata_url = reverse("product-metadata")

    def test_unauthenticated_request_rejected(self):
        """Unauthenticated requests must be rejected (401 or 403)."""
        response = self.client.get(self.list_create_url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        response = self.client.post(self.list_create_url, {"name": "Test"})
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_owner_can_create_medicine_product(self):
        """Owner can successfully create a new medicine product with pharmaceutical attributes."""
        self.client.force_authenticate(user=self.owner_a)

        payload = {
            "name": "Amoxicillin 500mg Capsules",
            "brand_name": "Novamox 500",
            "generic_name": "Amoxicillin Trihydrate",
            "sku": "MED-AMOX-500",
            "barcode": "8901030000025",
            "hsn_code": "300410",
            "category": "prescription_medicines",
            "item_type": "medicine",
            "manufacturer": "Cipla Ltd",
            "strength": "500 mg",
            "dosage_form": "capsule",
            "prescription_class": "schedule_h",
            "is_narcotic": False,
            "pack_description": "Strip of 10 capsules",
            "base_unit": "capsule",
            "sale_unit": "strip",
            "conversion_factor": 10,
            "is_loose_dispensing_allowed": True,
            "gst_rate": "12.00",
            "storage_condition": "room_temperature",
            "description": "Store in a cool dry place away from direct moisture.",
        }

        response = self.client.post(self.list_create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Amoxicillin 500mg Capsules")
        self.assertEqual(response.data["sku"], "MED-AMOX-500")
        self.assertEqual(response.data["conversion_factor"], 10)
        self.assertTrue(response.data["is_active"])

        # Verify DB persistence
        created = Product.objects.get(sku="MED-AMOX-500", organization=self.org_a)
        self.assertEqual(created.created_by, self.owner_a)
        self.assertEqual(created.updated_by, self.owner_a)

        # Verify Audit Log entry
        audit = AuditEvent.objects.filter(event_type="PRODUCT_CREATED", organization=self.org_a).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.details["sku"], "MED-AMOX-500")

    def test_owner_can_create_non_medicine_product(self):
        """Non-medicine products can be created without requiring pharmaceutical attributes."""
        self.client.force_authenticate(user=self.owner_a)

        payload = {
            "name": "Digital Blood Pressure Monitor",
            "brand_name": "Omron Hem-7120",
            "sku": "DEV-BP-OMRON",
            "category": "healthcare_devices",
            "item_type": "device_equipment",
            "manufacturer": "Omron Healthcare",
            "pack_description": "Box of 1 device",
            "base_unit": "piece",
            "sale_unit": "box",
            "conversion_factor": 1,
            "is_loose_dispensing_allowed": False,
            "gst_rate": "18.00",
        }

        response = self.client.post(self.list_create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Digital Blood Pressure Monitor")
        self.assertEqual(response.data["item_type"], "device_equipment")
        self.assertEqual(response.data["dosage_form"], "na")
        self.assertEqual(response.data["prescription_class"], "otc")

    def test_manager_can_create_product(self):
        """Store Managers within the organization are authorized to create products."""
        self.client.force_authenticate(user=self.manager_a)

        payload = {
            "name": "Ibuprofen 400mg Tablets",
            "sku": "MED-IBU-400",
            "category": "prescription_medicines",
            "item_type": "medicine",
            "dosage_form": "tablet",
            "base_unit": "tablet",
            "sale_unit": "strip",
            "conversion_factor": 10,
        }

        response = self.client.post(self.list_create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sku"], "MED-IBU-400")

    def test_staff_cannot_create_product(self):
        """Pharmacists and general staff have read-only access and cannot create products (403 Forbidden)."""
        self.client.force_authenticate(user=self.pharmacist_a)

        payload = {
            "name": "Unauthorized Tablet",
            "sku": "MED-UNAUTH-01",
            "category": "otc_medicines",
        }

        response = self.client.post(self.list_create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("read-only", response.data["detail"].lower())

    def test_duplicate_sku_in_same_organization_rejected(self):
        """A duplicate SKU within the same organization must return 400 Bad Request."""
        self.client.force_authenticate(user=self.owner_a)

        payload = {
            "name": "Duplicate Paracetamol Attempt",
            "sku": "MED-PARA-500",  # Already exists in org_a
            "category": "prescription_medicines",
        }

        response = self.client.post(self.list_create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sku", response.data)
        self.assertIn("already exists", str(response.data["sku"]))

    def test_same_sku_in_different_organization_allowed(self):
        """Organizations are multi-tenant isolated: Org B can use the same SKU that Org A has."""
        self.client.force_authenticate(user=self.owner_b)

        payload = {
            "name": "Org B Paracetamol",
            "sku": "MED-PARA-500",  # Same SKU, but Org B
            "category": "prescription_medicines",
        }

        response = self.client.post(self.list_create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sku"], "MED-PARA-500")

        # Verify two distinct records exist
        self.assertEqual(Product.objects.filter(sku="MED-PARA-500").count(), 2)

    def test_duplicate_barcode_in_same_organization_rejected(self):
        """Duplicate non-empty barcode in the same organization must be rejected."""
        self.client.force_authenticate(user=self.owner_a)

        payload = {
            "name": "Barcode Conflict Product",
            "sku": "MED-CONFLICT-01",
            "barcode": "8901030000001",  # Already used by self.product_paracetamol
            "category": "otc_medicines",
        }

        response = self.client.post(self.list_create_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("barcode", response.data)
        self.assertIn("already exists", str(response.data["barcode"]))

    def test_multiple_blank_barcodes_allowed(self):
        """Multiple products without barcodes (blank strings) are permitted in the same organization."""
        self.client.force_authenticate(user=self.owner_a)

        payload1 = {
            "name": "No Barcode Product 1",
            "sku": "MED-NOBAR-01",
            "barcode": "",
            "category": "otc_medicines",
        }
        payload2 = {
            "name": "No Barcode Product 2",
            "sku": "MED-NOBAR-02",
            "barcode": "",
            "category": "otc_medicines",
        }

        r1 = self.client.post(self.list_create_url, payload1, format="json")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)

        r2 = self.client.post(self.list_create_url, payload2, format="json")
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED)

    def test_tenant_isolation_in_listing(self):
        """Org A can never see Org B products; Org B can never see Org A products."""
        # Org A Owner
        self.client.force_authenticate(user=self.owner_a)
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [p["id"] for p in response.data["results"]]
        self.assertIn(str(self.product_paracetamol.id), ids)
        self.assertNotIn(str(self.product_org_b.id), ids)

        # Org B Owner
        self.client.force_authenticate(user=self.owner_b)
        response_b = self.client.get(self.list_create_url)
        self.assertEqual(response_b.status_code, status.HTTP_200_OK)
        ids_b = [p["id"] for p in response_b.data["results"]]
        self.assertIn(str(self.product_org_b.id), ids_b)
        self.assertNotIn(str(self.product_paracetamol.id), ids_b)

    def test_product_search_and_filtering(self):
        """Listing endpoint correctly filters by search term, category, and active status."""
        self.client.force_authenticate(user=self.owner_a)

        # Search by generic name
        res = self.client.get(f"{self.list_create_url}?search=Paracetamol")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["sku"], "MED-PARA-500")

        # Search by brand name
        res = self.client.get(f"{self.list_create_url}?search=Crocin")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)

        # Search by barcode
        res = self.client.get(f"{self.list_create_url}?search=8901030000001")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)

        # Category filter mismatch
        res = self.client.get(f"{self.list_create_url}?category=baby_care")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 0)

        # Status filter: active (default) should exclude archived
        res_active = self.client.get(f"{self.list_create_url}?status=active")
        self.assertEqual(res_active.status_code, status.HTTP_200_OK)
        skus = [p["sku"] for p in res_active.data["results"]]
        self.assertIn("MED-PARA-500", skus)
        self.assertNotIn("MED-VITC-OLD", skus)

        # Status filter: archived
        res_archived = self.client.get(f"{self.list_create_url}?status=archived")
        self.assertEqual(res_archived.status_code, status.HTTP_200_OK)
        skus_archived = [p["sku"] for p in res_archived.data["results"]]
        self.assertIn("MED-VITC-OLD", skus_archived)
        self.assertNotIn("MED-PARA-500", skus_archived)

    def test_owner_can_edit_product(self):
        """Owner can edit product attributes via PATCH."""
        self.client.force_authenticate(user=self.owner_a)
        url = reverse("product-detail", kwargs={"pk": self.product_paracetamol.id})

        patch_data = {
            "strength": "650 mg",
            "pack_description": "Strip of 10 tablets",
            "conversion_factor": 10,
        }
        response = self.client.patch(url, patch_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["strength"], "650 mg")
        self.assertEqual(response.data["conversion_factor"], 10)

        self.product_paracetamol.refresh_from_db()
        self.assertEqual(self.product_paracetamol.strength, "650 mg")
        self.assertEqual(self.product_paracetamol.updated_by, self.owner_a)

    def test_staff_cannot_edit_product(self):
        """Staff cannot edit product attributes (403 Forbidden)."""
        self.client.force_authenticate(user=self.pharmacist_a)
        url = reverse("product-detail", kwargs={"pk": self.product_paracetamol.id})

        response = self.client.patch(url, {"strength": "1000 mg"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_access_or_edit_product_of_another_organization(self):
        """Users from Org B get 404 when attempting to access or edit Org A products."""
        self.client.force_authenticate(user=self.owner_b)
        url = reverse("product-detail", kwargs={"pk": self.product_paracetamol.id})

        get_res = self.client.get(url)
        self.assertEqual(get_res.status_code, status.HTTP_404_NOT_FOUND)

        patch_res = self.client.patch(url, {"name": "Hacked Name"}, format="json")
        self.assertEqual(patch_res.status_code, status.HTTP_404_NOT_FOUND)

    def test_archive_and_reactivate_product(self):
        """Owner/Manager can archive and reactivate products."""
        self.client.force_authenticate(user=self.owner_a)
        archive_url = reverse("product-archive", kwargs={"pk": self.product_paracetamol.id})
        reactivate_url = reverse("product-reactivate", kwargs={"pk": self.product_paracetamol.id})

        # Archive
        res_arch = self.client.post(archive_url)
        self.assertEqual(res_arch.status_code, status.HTTP_200_OK)
        self.assertFalse(res_arch.data["is_active"])

        self.product_paracetamol.refresh_from_db()
        self.assertFalse(self.product_paracetamol.is_active)

        # Reactivate
        res_react = self.client.post(reactivate_url)
        self.assertEqual(res_react.status_code, status.HTTP_200_OK)
        self.assertTrue(res_react.data["is_active"])

        self.product_paracetamol.refresh_from_db()
        self.assertTrue(self.product_paracetamol.is_active)

    def test_metadata_endpoint(self):
        """Metadata endpoint returns categories, dosage forms, units, and classifications."""
        self.client.force_authenticate(user=self.pharmacist_a)
        response = self.client.get(self.metadata_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("categories", response.data)
        self.assertIn("dosage_forms", response.data)
        self.assertIn("units", response.data)
        self.assertIn("prescription_classes", response.data)
        self.assertGreater(len(response.data["categories"]), 5)

