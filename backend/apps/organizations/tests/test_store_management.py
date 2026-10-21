from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.authentication.models import User
from apps.organizations.models import Organization, OrganizationMembership, Store, StoreMembership
from apps.audit.models import AuditEvent


class StoreManagementTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create Owner User & Organization
        self.owner = User.objects.create_user(
            email="owner@sushrusha.com",
            password="StrongPassword@2026",
            full_name="Dr. Rajesh Owner",
            is_email_verified=True,
        )
        self.org = Organization.objects.create(name="Sushrusha Pharmacy Group", owner=self.owner)
        OrganizationMembership.objects.create(organization=self.org, user=self.owner, role="owner", is_active=True)

        # Create Another Organization & Owner for cross-tenant isolation testing
        self.other_owner = User.objects.create_user(
            email="other.owner@competitor.com",
            password="StrongPassword@2026",
            full_name="Competitor Owner",
            is_email_verified=True,
        )
        self.other_org = Organization.objects.create(name="Competitor Pharma", owner=self.other_owner)
        OrganizationMembership.objects.create(organization=self.other_org, user=self.other_owner, role="owner", is_active=True)

        # Create Staff User
        self.staff_user = User.objects.create_user(
            email="pharmacist@sushrusha.com",
            password="StrongPassword@2026",
            full_name="Jane Pharmacist",
            is_email_verified=True,
        )

        self.stores_url = reverse("store-list-create")
        self.overview_url = reverse("org-overview")
        self.team_url = reverse("org-team")

    def test_owner_create_store_persists_in_db(self):
        """Owner creates store: must validate unique code, persist to PostgreSQL, and log audit event."""
        self.client.force_authenticate(user=self.owner)
        payload = {
            "name": "Central Hospital Branch",
            "code": "CEN-01",
            "address": "123 Healthcare Blvd",
            "city": "Mumbai",
            "state": "Maharashtra",
            "postal_code": "400001",
            "phone": "+91 22 12345678",
            "email": "central@sushrusha.com",
            "status": "active",
        }
        res = self.client.post(self.stores_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["name"], "Central Hospital Branch")
        self.assertEqual(res.data["code"], "CEN-01")

        # Verify PostgreSQL database persistence
        store = Store.objects.filter(code="CEN-01", organization=self.org).first()
        self.assertIsNotNone(store)
        self.assertEqual(store.city, "Mumbai")
        self.assertEqual(store.status, "active")

        # Verify AuditEvent was logged
        audit = AuditEvent.objects.filter(event_type="STORE_CREATED", organization=self.org).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.details.get("store_code"), "CEN-01")

    def test_duplicate_store_code_rejected(self):
        """Duplicate store code in the same organization must be rejected with 400 Bad Request."""
        self.client.force_authenticate(user=self.owner)
        Store.objects.create(organization=self.org, name="First Branch", code="CEN-01")

        payload = {
            "name": "Second Branch With Same Code",
            "code": "CEN-01",
        }
        res = self.client.post(self.stores_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", res.data)

    def test_non_owner_cannot_create_store(self):
        """Store creation by non-owner must be rejected with 403 Forbidden."""
        self.client.force_authenticate(user=self.staff_user)
        res = self.client.post(self.stores_url, {"name": "Unauthorized Store"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_store_details_and_editing_persistence(self):
        """Editing store details must persist changes to PostgreSQL and log audit event."""
        store = Store.objects.create(organization=self.org, name="Original Name", code="STR-ORIG", status="setup")
        detail_url = reverse("store-detail-update", kwargs={"store_id": store.id})

        self.client.force_authenticate(user=self.owner)
        update_payload = {
            "name": "Updated Branch Name",
            "address": "456 New Road",
            "status": "active",
        }
        res = self.client.patch(detail_url, update_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["name"], "Updated Branch Name")
        self.assertEqual(res.data["status"], "active")

        # Verify in database
        store.refresh_from_db()
        self.assertEqual(store.name, "Updated Branch Name")
        self.assertEqual(store.status, "active")
        self.assertEqual(store.address, "456 New Road")

        # Verify audit event
        audit = AuditEvent.objects.filter(event_type="STORE_UPDATED", organization=self.org).first()
        self.assertIsNotNone(audit)

    def test_cross_organization_store_access_denied(self):
        """Owner of Organization A cannot access or edit stores belonging to Organization B."""
        competitor_store = Store.objects.create(organization=self.other_org, name="Competitor Branch", code="COMP-01")
        detail_url = reverse("store-detail-update", kwargs={"store_id": competitor_store.id})

        self.client.force_authenticate(user=self.owner)

        # GET attempt
        res_get = self.client.get(detail_url)
        self.assertEqual(res_get.status_code, status.HTTP_403_FORBIDDEN)

        # PATCH attempt
        res_patch = self.client.patch(detail_url, {"name": "Hacked Name"}, format="json")
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

    def test_assign_store_manager(self):
        """Owner can assign a manager to a store: updates store.manager and creates manager StoreMembership."""
        store = Store.objects.create(organization=self.org, name="Branch 1", code="BR-1")
        assign_url = reverse("store-assign-manager", kwargs={"store_id": store.id})

        self.client.force_authenticate(user=self.owner)
        res = self.client.post(assign_url, {"email": self.staff_user.email}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        store.refresh_from_db()
        self.assertEqual(store.manager, self.staff_user)

        membership = StoreMembership.objects.filter(store=store, user=self.staff_user).first()
        self.assertIsNotNone(membership)
        self.assertEqual(membership.role, "manager")
        self.assertTrue(membership.is_active)

    def test_membership_deactivation_does_not_affect_user_account(self):
        """Deactivating store membership deactivates ONLY that store membership, not user account or other stores."""
        store_1 = Store.objects.create(organization=self.org, name="Branch 1", code="BR-1")
        store_2 = Store.objects.create(organization=self.org, name="Branch 2", code="BR-2")

        # User is active member in both stores
        m1 = StoreMembership.objects.create(store=store_1, user=self.staff_user, role="pharmacist", is_active=True)
        m2 = StoreMembership.objects.create(store=store_2, user=self.staff_user, role="pharmacist", is_active=True)

        self.client.force_authenticate(user=self.owner)
        member_detail_url = reverse("store-member-detail", kwargs={"store_id": store_1.id, "membership_id": m1.id})

        res = self.client.patch(member_detail_url, {"is_active": False}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        m1.refresh_from_db()
        m2.refresh_from_db()
        self.staff_user.refresh_from_db()

        # m1 is inactive
        self.assertFalse(m1.is_active)
        # m2 remains active!
        self.assertTrue(m2.is_active)
        # User account is still active and email verified!
        self.assertTrue(self.staff_user.is_active)
        self.assertTrue(self.staff_user.is_email_verified)

    def test_organization_overview_metrics(self):
        """Overview endpoint must return real database metrics for the owner's organization."""
        Store.objects.create(organization=self.org, name="Store A", code="ST-A", status="active")
        Store.objects.create(organization=self.org, name="Store B", code="ST-B", status="setup")

        self.client.force_authenticate(user=self.owner)
        res = self.client.get(self.overview_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        metrics = res.data["metrics"]
        self.assertEqual(metrics["total_stores"], 2)
        self.assertEqual(metrics["active_stores"], 1)
        self.assertEqual(metrics["setup_stores"], 1)
        self.assertEqual(len(res.data["stores_summary"]), 2)

