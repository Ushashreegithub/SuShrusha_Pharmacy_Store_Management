from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from apps.organizations.models import Organization, Store, OrganizationMembership, StoreMembership, OrganizationDomain
from apps.organizations.domain_routing import normalize_host, classify_domain, get_domain_bound_organization
from apps.audit.models import AuditEvent

User = get_user_model()


class DomainRoutingAndClassificationTests(TestCase):
    """Verifies host normalization and domain classification rules."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner@sushrusha.com",
            full_name="Sushrusha Owner",
            password="StrongPassword@123",
            is_email_verified=True,
        )
        self.sushrusha_org = Organization.objects.create(
            name="Sushrusha_Pharma",
            slug="sushrusha-pharmacy-store",
            owner=self.owner,
            is_active=True,
        )
        self.domain_record = OrganizationDomain.objects.create(
            organization=self.sushrusha_org,
            domain="erp.sushrusaeclinic.com",
            domain_type="client",
            is_verified=True,
            is_primary=True,
            status="active",
        )

    def test_host_normalization(self):
        self.assertEqual(normalize_host("erp.sushrusaeclinic.com:8000"), "erp.sushrusaeclinic.com")
        self.assertEqual(normalize_host("ERP.SUSHRUSAECLINIC.COM:3000"), "erp.sushrusaeclinic.com")
        self.assertEqual(normalize_host("pharmapro.diracai.com:443"), "pharmapro.diracai.com")
        self.assertEqual(normalize_host("localhost:3000"), "localhost")
        self.assertEqual(normalize_host(""), "")

    def test_classify_platform_domain(self):
        category, org = classify_domain("pharmapro.diracai.com")
        self.assertEqual(category, "platform")
        self.assertIsNone(org)

    def test_classify_verified_client_domain(self):
        category, org = classify_domain("erp.sushrusaeclinic.com")
        self.assertEqual(category, "client")
        self.assertEqual(org, self.sushrusha_org)

    def test_classify_configured_client_domain_map(self):
        # sushrusha.localhost mapped via CLIENT_DOMAIN_ORGANIZATION_MAP
        category, org = classify_domain("sushrusha.localhost")
        self.assertEqual(category, "client")
        self.assertEqual(org, self.sushrusha_org)

    def test_classify_unknown_domain_fails_closed(self):
        category, org = classify_domain("malicious-phishing.com")
        self.assertEqual(category, "unknown")
        self.assertIsNone(org)

    def test_unverified_client_domain_not_treated_as_client(self):
        # Create unverified domain
        OrganizationDomain.objects.create(
            organization=self.sushrusha_org,
            domain="unverified.sushrusha.com",
            domain_type="client",
            is_verified=False,
            status="pending",
        )
        category, org = classify_domain("unverified.sushrusha.com")
        self.assertEqual(category, "unknown")
        self.assertIsNone(org)

    def test_pending_unverified_suspended_and_unregistered_sushrusha_fail_closed(self):
        # 1. Verified & active works
        self.assertEqual(classify_domain("erp.sushrusaeclinic.com"), ("client", self.sushrusha_org))

        # 2. Pending fails closed
        self.domain_record.is_verified = False
        self.domain_record.status = "pending"
        self.domain_record.save()
        self.assertEqual(classify_domain("erp.sushrusaeclinic.com"), ("unknown", None))

        # 3. Unverified even with active status fails closed
        self.domain_record.is_verified = False
        self.domain_record.status = "active"
        self.domain_record.save()
        self.assertEqual(classify_domain("erp.sushrusaeclinic.com"), ("unknown", None))

        # 4. Suspended fails closed (never falls back to static map)
        self.domain_record.is_verified = True
        self.domain_record.status = "suspended"
        self.domain_record.save()
        self.assertEqual(classify_domain("erp.sushrusaeclinic.com"), ("unknown", None))

        # 5. Deleted / unregistered production host fails closed (no bypass!)
        self.domain_record.delete()
        self.assertEqual(classify_domain("erp.sushrusaeclinic.com"), ("unknown", None))


class DomainBoundAuthenticationTests(TestCase):
    """Verifies domain-bound authentication, cross-tenant rejection, and session pinning."""

    def setUp(self):
        # 1. Organization A: Sushrusha_Pharma
        self.sushrusha_owner = User.objects.create_user(
            email="sushrusha.owner@example.com",
            full_name="Sushrusha Owner",
            password="Password123!",
            is_email_verified=True,
        )
        self.sushrusha_org = Organization.objects.create(
            name="Sushrusha_Pharma",
            slug="sushrusha-pharmacy-store",
            owner=self.sushrusha_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.sushrusha_org,
            user=self.sushrusha_owner,
            role="owner",
            is_active=True,
        )
        self.sushrusha_store = Store.objects.create(
            organization=self.sushrusha_org,
            name="Main Clinic Branch",
            code="STR-001",
            status="active",
        )
        self.sushrusha_pharmacist = User.objects.create_user(
            email="pharmacist@sushrusha.com",
            full_name="Sushrusha Pharmacist",
            password="Password123!",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.sushrusha_store,
            user=self.sushrusha_pharmacist,
            role="pharmacist",
            is_active=True,
        )

        # Domain mapping
        OrganizationDomain.objects.create(
            organization=self.sushrusha_org,
            domain="erp.sushrusaeclinic.com",
            is_verified=True,
            status="active",
        )

        # 2. Organization B: Other Pharmacy (Tenant B)
        self.other_owner = User.objects.create_user(
            email="other.owner@competitor.com",
            full_name="Competitor Owner",
            password="Password123!",
            is_email_verified=True,
        )
        self.other_org = Organization.objects.create(
            name="Competitor Pharmacy",
            slug="competitor-pharma",
            owner=self.other_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.other_org,
            user=self.other_owner,
            role="owner",
            is_active=True,
        )

        self.client = Client()

    def test_sushrusha_member_login_success_on_sushrusha_domain(self):
        """Active member of Sushrusha can sign in on erp.sushrusaeclinic.com."""
        response = self.client.post(
            "/api/auth/login/",
            {"email": "pharmacist@sushrusha.com", "password": "Password123!"},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.session.get("active_organization_id"), str(self.sushrusha_org.id))

    def test_cross_tenant_login_rejected_with_generic_401(self):
        """
        User belonging to Competitor Pharmacy attempting sign-in on Sushrusha domain
        MUST be rejected with identical generic 401 error and logged in audit.
        """
        response = self.client.post(
            "/api/auth/login/",
            {"email": "other.owner@competitor.com", "password": "Password123!"},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.json().get("detail"),
            "Invalid email or password. Please verify your credentials and try again.",
        )
        # Ensure audit log captured cross-tenant rejection
        self.assertTrue(
            AuditEvent.objects.filter(event_type="AUTH_CROSS_TENANT_REJECTED", user=self.other_owner).exists()
        )

    def test_platform_login_permits_any_valid_user(self):
        """On platform domain, both users can sign in normally."""
        res_a = self.client.post(
            "/api/auth/login/",
            {"email": "pharmacist@sushrusha.com", "password": "Password123!"},
            HTTP_HOST="pharmapro.diracai.com",
            content_type="application/json",
        )
        self.assertEqual(res_a.status_code, 200)

        self.client.logout()

        res_b = self.client.post(
            "/api/auth/login/",
            {"email": "other.owner@competitor.com", "password": "Password123!"},
            HTTP_HOST="pharmapro.diracai.com",
            content_type="application/json",
        )
        self.assertEqual(res_b.status_code, 200)

    def test_unknown_host_fails_closed(self):
        """Unknown/unverified host header fails closed with 400 Bad Request."""
        response = self.client.get(
            "/api/health/",
            HTTP_HOST="random-attacker-domain.org",
        )
        self.assertEqual(response.status_code, 400)


class PasswordChangeRequirementTests(TestCase):
    """Verifies mandatory first-login password change enforcement."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email="new.owner@sushrusha.com",
            full_name="New Owner",
            password="TempPassword@123",
            is_email_verified=True,
            must_change_password=True,  # Mandatory password change flag
        )
        self.org = Organization.objects.create(
            name="Sushrusha Pharmacy",
            slug="sushrusha-pharma",
            owner=self.owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role="owner",
            is_active=True,
        )
        self.client = Client()

    def test_login_indicates_password_change_required(self):
        response = self.client.post(
            "/api/auth/login/",
            {"email": "new.owner@sushrusha.com", "password": "TempPassword@123"},
            HTTP_HOST="pharmapro.diracai.com",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("must_change_password"))

    def test_protected_endpoints_blocked_until_password_changed(self):
        self.client.force_login(self.owner)

        # Attempt to access protected dashboard API (e.g. stores)
        res = self.client.get("/api/organizations/stores/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json().get("code"), "MUST_CHANGE_PASSWORD")

        # Exempt endpoints (like /api/auth/me/) remain accessible
        res_me = self.client.get("/api/auth/me/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_me.status_code, 200)

    def test_completing_password_change_restores_full_access(self):
        self.client.force_login(self.owner)

        # Change password
        res_change = self.client.post(
            "/api/auth/change-password/",
            {
                "current_password": "TempPassword@123",
                "new_password": "NewPermanentSecurePassword@2026",
                "confirm_new_password": "NewPermanentSecurePassword@2026",
            },
            HTTP_HOST="pharmapro.diracai.com",
            content_type="application/json",
        )
        self.assertEqual(res_change.status_code, 200)

        # Reload user from DB
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.must_change_password)

        # Protected endpoints are now unlocked
        res_stores = self.client.get("/api/organizations/stores/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_stores.status_code, 200)



class CrossTenantIsolationAndAuthorizationTests(TestCase):
    """
    Exhaustive verification of store-level cross-tenant authorization,
    multi-tenant actor isolation, and domain boundary enforcement.
    """

    def setUp(self):
        # 1. Organization A: Sushrusha Pharmacy
        self.owner_a = User.objects.create_user(
            email="multi.owner@example.com",
            full_name="Multi Owner",
            password="StrongPassword@123",
            is_email_verified=True,
        )
        self.org_a = Organization.objects.create(
            name="Sushrusha Pharmacy",
            slug="sushrusha-pharma",
            owner=self.owner_a,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.org_a,
            user=self.owner_a,
            role="owner",
            is_active=True,
        )
        self.store_a = Store.objects.create(
            organization=self.org_a,
            name="Sushrusha Central",
            code="STR-SUS-01",
            status="active",
        )
        OrganizationDomain.objects.create(
            organization=self.org_a,
            domain="erp.sushrusaeclinic.com",
            is_verified=True,
            status="active",
        )

        # 2. Organization B: Competitor Pharmacy
        self.org_b = Organization.objects.create(
            name="Competitor Pharmacy",
            slug="competitor-pharma",
            owner=self.owner_a,  # Same person owns Org B as well!
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.org_b,
            user=self.owner_a,
            role="owner",
            is_active=True,
        )
        self.store_b = Store.objects.create(
            organization=self.org_b,
            name="Competitor Branch",
            code="STR-COMP-01",
            status="active",
        )

        # 3. Multi-org Cashier (Assigned to Store A in Org A, and Store B in Org B)
        self.multi_cashier = User.objects.create_user(
            email="cashier.multi@example.com",
            full_name="Multi Cashier",
            password="StrongPassword@123",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store_a,
            user=self.multi_cashier,
            role="cashier",
            is_active=True,
        )
        StoreMembership.objects.create(
            store=self.store_b,
            user=self.multi_cashier,
            role="cashier",
            is_active=True,
        )

        # Products in both orgs
        from apps.products.models import Product
        self.prod_a = Product.objects.create(
            organization=self.org_a,
            name="Paracetamol Sushrusha 500mg",
            sku="SKU-SUS-PARA",
            category="prescription_medicines",
            item_type="medicine",
            storage_condition="room_temperature",
            sale_unit="strip",
            is_active=True,
        )
        self.prod_b = Product.objects.create(
            organization=self.org_b,
            name="Ibuprofen Competitor 400mg",
            sku="SKU-COMP-IBU",
            category="prescription_medicines",
            item_type="medicine",
            storage_condition="room_temperature",
            sale_unit="strip",
            is_active=True,
        )

        # Audit events in both orgs
        AuditEvent.objects.create(
            organization=self.org_a,
            user=self.owner_a,
            event_type="STORE_CREATED",
            details={"branch": "Sushrusha Central"},
        )
        AuditEvent.objects.create(
            organization=self.org_b,
            user=self.owner_a,
            event_type="STORE_CREATED",
            details={"branch": "Competitor Branch"},
        )

        self.client = Client()

    def test_multi_cashier_cannot_access_other_store_on_sushrusha_domain(self):
        """
        A cashier who belongs to Store A (Org A) and Store B (Org B) MUST NOT be allowed
        to perform billing operations against Store B while on erp.sushrusaeclinic.com.
        """
        self.client.force_login(self.multi_cashier)

        # 1. Billing customer search on Store A succeeds
        res_a = self.client.get(
            f"/api/billing/customers/?store_id={self.store_a.id}",
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res_a.status_code, 200)

        # 2. Billing customer search on Store B (from Org B) MUST be rejected with 403 Forbidden
        res_b = self.client.get(
            f"/api/billing/customers/?store_id={self.store_b.id}",
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res_b.status_code, 403)

    def test_multi_owner_store_list_strictly_scoped_to_active_domain(self):
        """
        An owner who owns Org A and Org B visiting erp.sushrusaeclinic.com
        MUST only see Org A stores. Org B stores must never appear.
        """
        self.client.force_login(self.owner_a)

        res = self.client.get("/api/organizations/stores/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(res.status_code, 200)
        stores_data = res.json()
        store_ids = [s["id"] for s in stores_data]

        self.assertIn(str(self.store_a.id), store_ids)
        self.assertNotIn(str(self.store_b.id), store_ids)

    def test_multi_owner_cannot_read_or_edit_store_b_on_sushrusha_domain(self):
        """
        StoreDetailView returns 404 for Store B when requested on erp.sushrusaeclinic.com.
        """
        self.client.force_login(self.owner_a)

        res = self.client.get(f"/api/organizations/stores/{self.store_b.id}/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(res.status_code, 403)

        # PATCH also fails closed
        res_patch = self.client.patch(
            f"/api/organizations/stores/{self.store_b.id}/",
            {"name": "Hacked Name"},
            content_type="application/json",
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res_patch.status_code, 403)

    def test_multi_owner_catalog_strictly_scoped_to_active_domain(self):
        """
        Product catalog list on erp.sushrusaeclinic.com returns ONLY Org A products.
        """
        self.client.force_login(self.owner_a)

        res = self.client.get("/api/products/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        items = data.get("results", data)
        skus = [p["sku"] for p in items]

        self.assertIn("SKU-SUS-PARA", skus)
        self.assertNotIn("SKU-COMP-IBU", skus)

    def test_multi_owner_audit_strictly_scoped_to_active_domain(self):
        """
        AuditListView returns ONLY Org A audit logs on erp.sushrusaeclinic.com.
        """
        self.client.force_login(self.owner_a)

        res = self.client.get("/api/audit/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(res.status_code, 200)
        events = res.json()
        branches = [e.get("details", {}).get("branch") for e in events]

        self.assertIn("Sushrusha Central", branches)
        self.assertNotIn("Competitor Branch", branches)

    def test_cross_tenant_opening_stock_rejected(self):
        """
        Posting opening stock for Store B on erp.sushrusaeclinic.com MUST return 403 Forbidden.
        """
        self.client.force_login(self.owner_a)

        res = self.client.post(
            f"/api/inventory/stores/{self.store_b.id}/opening-stock/",
            {"items": [], "idempotency_key": "test-key-1"},
            content_type="application/json",
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res.status_code, 403)

    def test_cross_tenant_invitation_creation_rejected(self):
        """
        Inviting an employee to Store B while on erp.sushrusaeclinic.com MUST fail validation.
        """
        self.client.force_login(self.owner_a)

        res = self.client.post(
            "/api/invitations/",
            {
                "email": "new.cashier@example.com",
                "store_id": str(self.store_b.id),
                "role": "cashier",
            },
            content_type="application/json",
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("store_id", res.json())
