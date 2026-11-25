import io
from PIL import Image
from django.test import TestCase, Client, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.authentication.models import User
from apps.organizations.models import Organization, OrganizationMembership, Store, StoreMembership
from apps.partners.models import Partner, PartnerMembership, PartnerDomain
from apps.audit.models import AuditEvent


class PartnerOrganizationSettingsTests(TestCase):
    """
    Unit and integration tests for Sushrusha Partner Organization Profile,
    Dynamic Branding, Logo Upload/Removal, Pillow validation, and strict RBAC isolation.
    """

    def setUp(self):
        # 1. Partner Entity and Active Domain
        self.partner = Partner.objects.create(
            name="Sushrusha E-Clinic",
            slug="sushrusha-eclinic",
            contact_email="partner@sushrusaeclinic.com",
            contact_phone="+919876543210",
            website="https://sushrusaeclinic.com",
            address="Plot 101, Medical Enclave",
            city="Bhubaneswar",
            state="Odisha",
            postal_code="751001",
            gstin="21ABCDE1234F1Z5",
            drug_license_number="DL-20B-123456",
            description="Healthcare and pharmacy network partner",
            is_active=True,
        )
        self.partner_domain = PartnerDomain.objects.create(
            partner=self.partner,
            domain="erp.sushrusaeclinic.com",
            is_verified=True,
            is_primary=True,
            status="active",
        )

        # 2. Partner Owner User
        self.partner_owner = User.objects.create_user(
            email="partner.owner@sushrusaeclinic.com",
            full_name="Sushrusha Partner Owner",
            password="PartnerOwnerPass@2026!",
            is_email_verified=True,
        )
        PartnerMembership.objects.create(
            partner=self.partner,
            user=self.partner_owner,
            role="partner_owner",
            is_active=True,
        )

        # 3. Customer Pharmacy and Customer Pharmacy Manager (must be rejected)
        self.customer_manager = User.objects.create_user(
            email="manager@customerpharma.com",
            full_name="Customer Pharmacy Manager",
            password="CustomerPass@2026!",
            is_email_verified=True,
        )
        self.customer_org = Organization.objects.create(
            name="Apex Healthcare Pharmacy",
            slug="apex-healthcare-pharmacy",
            partner=self.partner,
            owner=self.customer_manager,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.customer_org,
            user=self.customer_manager,
            role="owner",
            is_active=True,
        )

        # 4. Normal Staff User (must be rejected)
        self.staff_user = User.objects.create_user(
            email="staff@customerpharma.com",
            full_name="Pharmacy Staff",
            password="StaffPass@2026!",
            is_email_verified=True,
        )
        OrganizationMembership.objects.create(
            organization=self.customer_org,
            user=self.staff_user,
            role="staff",
            is_active=True,
        )

        self.client = Client()

    def _login(self, user_email, password, host="erp.sushrusaeclinic.com"):
        res = self.client.post(
            "/api/auth/login/",
            {"email": user_email, "password": password},
            HTTP_HOST=host,
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)

    def _create_test_image(self, format="PNG", size=(100, 100), color=(15, 118, 110)):
        file_obj = io.BytesIO()
        image = Image.new("RGBA" if format == "PNG" else "RGB", size, color)
        image.save(file_obj, format=format)
        file_obj.seek(0)
        ext = format.lower()
        content_type = f"image/{ext}" if ext != "jpg" else "image/jpeg"
        return SimpleUploadedFile(f"test_logo.{ext}", file_obj.read(), content_type=content_type)

    def test_partner_owner_get_profile_success(self):
        self._login(self.partner_owner.email, "PartnerOwnerPass@2026!")
        res = self.client.get("/api/partner/profile/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], str(self.partner.id))
        self.assertEqual(data["name"], "Sushrusha E-Clinic")
        self.assertEqual(data["slug"], "sushrusha-eclinic")
        self.assertEqual(data["contact_email"], "partner@sushrusaeclinic.com")
        self.assertEqual(data["gstin"], "21ABCDE1234F1Z5")
        self.assertEqual(data["city"], "Bhubaneswar")
        self.assertIn("logo_url", data)

    def test_partner_owner_update_profile_success(self):
        self._login(self.partner_owner.email, "PartnerOwnerPass@2026!")
        payload = {
            "name": "Sushrusha Health & Clinics Network",
            "description": "Updated regional health network description",
            "contact_email": "admin@sushrusaeclinic.com",
            "contact_phone": "+919999988888",
            "website": "https://www.sushrusaeclinic.com",
            "address": "Tower 4, Infocity Avenue",
            "city": "Bhubaneswar",
            "state": "Odisha",
            "postal_code": "751024",
            "gstin": "21XYZAB5678C1Z9",
            "drug_license_number": "DL-20B-998877",
        }
        res = self.client.patch(
            "/api/partner/profile/",
            payload,
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["name"], "Sushrusha Health & Clinics Network")
        self.assertEqual(data["gstin"], "21XYZAB5678C1Z9")
        self.assertEqual(data["postal_code"], "751024")

        # Verify DB persistence
        self.partner.refresh_from_db()
        self.assertEqual(self.partner.name, "Sushrusha Health & Clinics Network")
        self.assertEqual(self.partner.gstin, "21XYZAB5678C1Z9")

        # Verify Audit Log
        audit = AuditEvent.objects.filter(
            event_type="PARTNER_PROFILE_UPDATED",
            user=self.partner_owner,
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.details["partner_id"], str(self.partner.id))

    def test_partner_owner_update_profile_validation_errors(self):
        self._login(self.partner_owner.email, "PartnerOwnerPass@2026!")
        # Empty name
        res_empty_name = self.client.patch(
            "/api/partner/profile/",
            {"name": "   "},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(res_empty_name.status_code, 400)
        self.assertIn("name", res_empty_name.json())

        # GSTIN exceeding 15 chars
        res_long_gstin = self.client.patch(
            "/api/partner/profile/",
            {"gstin": "21ABCDE1234F1Z5TOOLONG"},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(res_long_gstin.status_code, 400)
        self.assertIn("gstin", res_long_gstin.json())

    def test_upload_and_replace_partner_logo(self):
        self._login(self.partner_owner.email, "PartnerOwnerPass@2026!")
        image_file = self._create_test_image(format="PNG")

        res_upload = self.client.post(
            "/api/partner/profile/logo/",
            {"logo": image_file},
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res_upload.status_code, 200)
        data = res_upload.json()
        self.assertIn("logo_url", data)
        self.assertIn("/media/partner_logos/", data["logo_url"])

        self.partner.refresh_from_db()
        self.assertTrue(bool(self.partner.logo))

        # Check Audit Log for logo upload
        audit_up = AuditEvent.objects.filter(
            event_type="PARTNER_LOGO_UPDATED",
            user=self.partner_owner,
        ).first()
        self.assertIsNotNone(audit_up)

        # Re-upload / replace with JPEG
        image_file_2 = self._create_test_image(format="JPEG")
        res_replace = self.client.post(
            "/api/partner/profile/logo/",
            {"logo": image_file_2},
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res_replace.status_code, 200)

        # Check delete / remove logo
        res_delete = self.client.delete(
            "/api/partner/profile/logo/",
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res_delete.status_code, 200)
        self.assertIsNone(res_delete.json()["logo_url"])

        self.partner.refresh_from_db()
        self.assertFalse(bool(self.partner.logo))

        audit_del = AuditEvent.objects.filter(
            event_type="PARTNER_LOGO_REMOVED",
            user=self.partner_owner,
        ).first()
        self.assertIsNotNone(audit_del)

    def test_logo_upload_rejects_corrupted_or_non_image_files(self):
        self._login(self.partner_owner.email, "PartnerOwnerPass@2026!")
        fake_image = SimpleUploadedFile("fake.png", b"NOT_A_REAL_IMAGE_BYTES", content_type="image/png")

        res = self.client.post(
            "/api/partner/profile/logo/",
            {"logo": fake_image},
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("logo", res.json())

    def test_logo_upload_rejects_oversized_file(self):
        self._login(self.partner_owner.email, "PartnerOwnerPass@2026!")
        # 5.5 MB dummy file
        large_bytes = b"0" * (6 * 1024 * 1024)
        large_file = SimpleUploadedFile("large.png", large_bytes, content_type="image/png")

        res = self.client.post(
            "/api/partner/profile/logo/",
            {"logo": large_file},
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("logo", res.json())

    def test_partner_branding_endpoint_public_tenant_resolution(self):
        # Public call without authentication on the partner domain
        res = self.client.get("/api/partner/branding/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["name"], "Sushrusha E-Clinic")
        self.assertEqual(data["slug"], "sushrusha-eclinic")
        self.assertEqual(data["website"], "https://sushrusaeclinic.com")

    def test_customer_pharmacy_manager_cannot_access_or_modify_partner_profile(self):
        self._login(self.customer_manager.email, "CustomerPass@2026!")

        # GET forbidden
        res_get = self.client.get("/api/partner/profile/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(res_get.status_code, 403)

        # PATCH forbidden
        res_patch = self.client.patch(
            "/api/partner/profile/",
            {"name": "Hacked Name"},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(res_patch.status_code, 403)

        # Logo upload forbidden
        image = self._create_test_image()
        res_logo = self.client.post(
            "/api/partner/profile/logo/",
            {"logo": image},
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res_logo.status_code, 403)

    def test_pharmacy_staff_cannot_access_partner_profile(self):
        self._login(self.staff_user.email, "StaffPass@2026!")
        res = self.client.get("/api/partner/profile/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(res.status_code, 403)

    def test_unauthenticated_request_is_rejected(self):
        res = self.client.get("/api/partner/profile/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertIn(res.status_code, [401, 403])
