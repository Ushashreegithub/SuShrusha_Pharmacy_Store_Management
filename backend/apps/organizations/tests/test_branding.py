import io
import uuid
from PIL import Image
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.organizations.models import Organization, Store, OrganizationMembership, StoreMembership
from apps.audit.models import AuditEvent

User = get_user_model()


def create_test_image(format="PNG", size=(64, 64), color="blue"):
    """Generate in-memory valid image file bytes."""
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format=format)
    buf.seek(0)
    return buf.getvalue()


class OrganizationBrandingTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Primary Organization & Owner
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
        self.org_membership = OrganizationMembership.objects.create(
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

        # 2. Staff user belonging to same store
        self.staff_user = User.objects.create_user(
            email="staff@sushrusha.com",
            password="SecurePassword123!",
            full_name="Staff Member",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store,
            user=self.staff_user,
            role="pharmacist",
            is_active=True,
        )

        # 3. Another tenant organization and owner
        self.other_owner = User.objects.create_user(
            email="other@medplus.com",
            password="SecurePassword123!",
            full_name="Other Owner",
            is_email_verified=True,
        )
        self.other_org = Organization.objects.create(
            name="MedPlus Clinic",
            slug="medplus-clinic",
            owner=self.other_owner,
        )
        OrganizationMembership.objects.create(
            organization=self.other_org,
            user=self.other_owner,
            role="owner",
            is_active=True,
        )

    # 1. Owner can retrieve authorized branding
    def test_owner_can_retrieve_branding(self):
        self.client.force_authenticate(user=self.owner)
        res = self.client.get("/api/organizations/branding/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], str(self.org.id))
        self.assertEqual(res.data["name"], "Sushrusha Pharmacy")
        self.assertIsNone(res.data["logo_url"])

    # 2. Staff can retrieve their authorized organization branding
    def test_staff_can_retrieve_org_branding(self):
        self.client.force_authenticate(user=self.staff_user)
        res = self.client.get("/api/organizations/branding/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], str(self.org.id))
        self.assertEqual(res.data["name"], "Sushrusha Pharmacy")

    # 3. Unauthenticated request is rejected
    def test_unauthenticated_request_rejected(self):
        res = self.client.get("/api/organizations/branding/")
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    # 4. Authorized owner can update organization name
    def test_owner_can_update_organization_name(self):
        self.client.force_authenticate(user=self.owner)
        res = self.client.patch("/api/organizations/settings/", {"name": "Sushrusha Super Pharmacy"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.org.refresh_from_db()
        self.assertEqual(self.org.name, "Sushrusha Super Pharmacy")

        # Verify audit event
        audit = AuditEvent.objects.filter(
            event_type="ORGANIZATION_SETTINGS_UPDATED", organization=self.org
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.user, self.owner)

    # 5. Non-owner staff cannot update organization settings
    def test_staff_cannot_update_organization_settings(self):
        self.client.force_authenticate(user=self.staff_user)
        res = self.client.patch("/api/organizations/settings/", {"name": "Hacked Name"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.org.refresh_from_db()
        self.assertEqual(self.org.name, "Sushrusha Pharmacy")

    # 6. Authorized owner can upload valid PNG logo
    def test_owner_can_upload_valid_logo(self):
        self.client.force_authenticate(user=self.owner)
        img_bytes = create_test_image(format="PNG")
        uploaded = SimpleUploadedFile("logo.png", img_bytes, content_type="image/png")

        res = self.client.post("/api/organizations/logo/", {"logo": uploaded}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res.data["logo_url"])
        self.assertIn("/media/org_logos/", res.data["logo_url"])

        self.org.refresh_from_db()
        self.assertTrue(bool(self.org.logo))

        # Verify audit event
        audit = AuditEvent.objects.filter(
            event_type="ORGANIZATION_LOGO_UPLOADED", organization=self.org
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.user, self.owner)

    # 7. Authorized owner can replace an existing logo
    def test_owner_can_replace_existing_logo(self):
        self.client.force_authenticate(user=self.owner)

        # Upload first logo
        img1 = SimpleUploadedFile("logo1.png", create_test_image(format="PNG", color="red"), content_type="image/png")
        res1 = self.client.post("/api/organizations/logo/", {"logo": img1}, format="multipart")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        first_url = res1.data["logo_url"]

        # Upload second logo (JPEG)
        img2 = SimpleUploadedFile("logo2.jpg", create_test_image(format="JPEG", color="green"), content_type="image/jpeg")
        res2 = self.client.post("/api/organizations/logo/", {"logo": img2}, format="multipart")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        second_url = res2.data["logo_url"]

        self.assertNotEqual(first_url, second_url)

    # 8. Authorized owner can remove logo
    def test_owner_can_remove_logo(self):
        self.client.force_authenticate(user=self.owner)

        # First upload
        img = SimpleUploadedFile("logo.png", create_test_image(format="PNG"), content_type="image/png")
        self.client.post("/api/organizations/logo/", {"logo": img}, format="multipart")
        self.org.refresh_from_db()
        self.assertTrue(bool(self.org.logo))

        # Delete logo
        res = self.client.delete("/api/organizations/logo/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data["logo_url"])

        self.org.refresh_from_db()
        self.assertFalse(bool(self.org.logo))

        # Verify audit event
        audit = AuditEvent.objects.filter(
            event_type="ORGANIZATION_LOGO_REMOVED", organization=self.org
        ).first()
        self.assertIsNotNone(audit)

    # 9. Non-owner staff cannot upload or delete logo
    def test_staff_cannot_upload_or_delete_logo(self):
        self.client.force_authenticate(user=self.staff_user)
        img = SimpleUploadedFile("logo.png", create_test_image(format="PNG"), content_type="image/png")

        post_res = self.client.post("/api/organizations/logo/", {"logo": img}, format="multipart")
        self.assertEqual(post_res.status_code, status.HTTP_403_FORBIDDEN)

        del_res = self.client.delete("/api/organizations/logo/")
        self.assertEqual(del_res.status_code, status.HTTP_403_FORBIDDEN)

    # 10. Rejection of oversized files (>2MB)
    def test_reject_oversized_file(self):
        self.client.force_authenticate(user=self.owner)
        oversized_data = b"X" * (2 * 1024 * 1024 + 1024)  # 2MB + 1KB
        uploaded = SimpleUploadedFile("big.png", oversized_data, content_type="image/png")

        res = self.client.post("/api/organizations/logo/", {"logo": uploaded}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exceeds the 2MB limit", str(res.data))

    # 11. Rejection of SVG / XML files disguised as images
    def test_reject_svg_disguised_file(self):
        self.client.force_authenticate(user=self.owner)
        svg_content = b"<svg xmlns='http://www.w3.org/2000/svg'><circle r='10'/></svg>"
        uploaded = SimpleUploadedFile("logo.png", svg_content, content_type="image/png")

        res = self.client.post("/api/organizations/logo/", {"logo": uploaded}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("SVG", str(res.data))

    # 12. Rejection of plain text or corrupt binary
    def test_reject_corrupt_or_text_file(self):
        self.client.force_authenticate(user=self.owner)
        bad_content = b"This is just plain text content, not an image!"
        uploaded = SimpleUploadedFile("logo.png", bad_content, content_type="image/png")

        res = self.client.post("/api/organizations/logo/", {"logo": uploaded}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # 13. CurrentUserView (/api/auth/me/) includes logo_url
    def test_current_user_profile_includes_logo_url(self):
        self.client.force_authenticate(user=self.owner)
        img = SimpleUploadedFile("logo.png", create_test_image(format="PNG"), content_type="image/png")
        self.client.post("/api/organizations/logo/", {"logo": img}, format="multipart")

        res = self.client.get("/api/auth/me/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        orgs = res.data.get("organizations", [])
        self.assertEqual(len(orgs), 1)
        self.assertIsNotNone(orgs[0].get("logo_url"))
        self.assertIn("/media/org_logos/", orgs[0]["logo_url"])
