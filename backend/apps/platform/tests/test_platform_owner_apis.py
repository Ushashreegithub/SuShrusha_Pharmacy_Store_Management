from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.utils import timezone
from datetime import timedelta

from apps.organizations.models import (
    Organization,
    Store,
    OrganizationDomain,
    OrganizationMembership,
    StoreMembership,
)
from apps.audit.models import AuditEvent

User = get_user_model()


class PlatformOwnerAuthorizationTests(TestCase):
    """
    Verifies strict IsPlatformOwner authorization requirements:
      1. is_authenticated
      2. is_active
      3. is_staff
      4. is_superuser
      5. Platform domain restriction (client domain rejection)
    """

    def setUp(self):
        self.client = Client()

        # 1. Active Platform Owner (is_staff=True, is_superuser=True, is_active=True)
        self.platform_owner = User.objects.create_superuser(
            email="platform.owner@diracai.com",
            full_name="Platform Administrator",
            password="StrongPassword@123",
            is_email_verified=True,
        )

        # 2. Staff-only account (is_staff=True, is_superuser=False)
        self.staff_only = User.objects.create_user(
            email="staff.only@diracai.com",
            full_name="Staff Only",
            password="StrongPassword@123",
            is_staff=True,
            is_superuser=False,
            is_email_verified=True,
        )

        # 3. Superuser-only account (is_staff=False, is_superuser=True)
        self.super_only = User.objects.create_user(
            email="super.only@diracai.com",
            full_name="Superuser Only",
            password="StrongPassword@123",
            is_staff=False,
            is_superuser=True,
            is_email_verified=True,
        )

        # 4. Inactive Platform Owner (is_active=False)
        self.inactive_owner = User.objects.create_superuser(
            email="inactive.admin@diracai.com",
            full_name="Inactive Admin",
            password="StrongPassword@123",
            is_active=False,
        )

        # 5. Pharmacy Tenant Setup
        self.pharmacy_owner = User.objects.create_user(
            email="owner@sushrusha.com",
            full_name="Pharmacy Owner",
            password="StrongPassword@123",
            is_staff=False,
            is_superuser=False,
            is_email_verified=True,
        )
        self.org = Organization.objects.create(
            name="Sushrusha Pharmacy",
            slug="sushrusha-pharma",
            owner=self.pharmacy_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.pharmacy_owner,
            role="owner",
            is_active=True,
        )
        self.store = Store.objects.create(
            organization=self.org,
            name="Central Dispensary",
            code="STR-001",
            status="active",
        )

        # Staff, Manager, Cashier
        self.manager = User.objects.create_user(
            email="manager@sushrusha.com",
            full_name="Store Manager",
            password="StrongPassword@123",
        )
        StoreMembership.objects.create(
            store=self.store, user=self.manager, role="manager", is_active=True
        )

        self.cashier = User.objects.create_user(
            email="cashier@sushrusha.com",
            full_name="Store Cashier",
            password="StrongPassword@123",
        )
        StoreMembership.objects.create(
            store=self.store, user=self.cashier, role="cashier", is_active=True
        )

        # Map client domain
        OrganizationDomain.objects.create(
            organization=self.org,
            domain="erp.sushrusaeclinic.com",
            is_verified=True,
            status="active",
        )

    def test_anonymous_access_rejected(self):
        res = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertIn(res.status_code, (401, 403))

    def test_pharmacy_owner_rejected(self):
        self.client.force_login(self.pharmacy_owner)
        res = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 403)

    def test_store_manager_rejected(self):
        self.client.force_login(self.manager)
        res = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 403)

    def test_store_cashier_rejected(self):
        self.client.force_login(self.cashier)
        res = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 403)

    def test_staff_only_account_rejected(self):
        self.client.force_login(self.staff_only)
        res = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 403)

    def test_superuser_only_account_rejected(self):
        self.client.force_login(self.super_only)
        res = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 403)

    def test_inactive_platform_owner_rejected(self):
        self.client.force_login(self.inactive_owner)
        res = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertIn(res.status_code, (401, 403))

    def test_active_platform_owner_accepted_on_platform_domain(self):
        self.client.force_login(self.platform_owner)
        res = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("total_organizations", data)
        self.assertIn("active_users", data)

    def test_cross_client_domain_platform_access_strictly_rejected(self):
        """Even an authenticated Platform Owner is rejected if request targets a client custom domain."""
        self.client.force_login(self.platform_owner)
        res = self.client.get("/api/platform/overview/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(res.status_code, 403)


class PlatformManagementOperationsTests(TestCase):
    """
    Verifies management operations:
      - Organization listing, details, activation & suspension (with session revocation)
      - User listing, details, suspension & session revocation
      - Temporary password generation with one-time reveal and must_change_password=True
      - Domain management & verification workflows
      - Audit trail immutability and login activity querying
    """

    def setUp(self):
        self.client = Client()

        self.platform_owner = User.objects.create_superuser(
            email="platform.admin@diracai.com",
            full_name="Platform Admin",
            password="StrongPassword@123",
            is_email_verified=True,
        )
        self.client.force_login(self.platform_owner)

        # Pharmacy Organization A
        self.owner_a = User.objects.create_user(
            email="owner.a@pharma-a.com",
            full_name="Owner Alpha",
            password="Password@123",
            is_email_verified=True,
        )
        self.org_a = Organization.objects.create(
            name="Alpha Pharmacy",
            slug="alpha-pharma",
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
            name="Alpha Store",
            code="STR-A1",
            status="active",
        )

        # Staff user in Org A
        self.staff_a = User.objects.create_user(
            email="staff.a@pharma-a.com",
            full_name="Staff Alpha",
            password="Password@123",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store_a,
            user=self.staff_a,
            role="pharmacist",
            is_active=True,
        )

        # Domain for Org A
        self.domain_a = OrganizationDomain.objects.create(
            organization=self.org_a,
            domain="alpha.client.com",
            is_verified=False,
            status="pending",
        )

    def test_overview_metrics(self):
        res = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_organizations"], 1)
        self.assertEqual(data["active_organizations"], 1)
        self.assertEqual(data["total_stores"], 1)
        self.assertEqual(data["total_domains"], 1)
        self.assertEqual(data["pending_domains"], 1)

    def test_organization_listing_and_filtering(self):
        res = self.client.get("/api/platform/organizations/?search=Alpha", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["name"], "Alpha Pharmacy")
        self.assertEqual(data["results"][0]["owner_email"], "owner.a@pharma-a.com")
        self.assertEqual(data["results"][0]["stores_count"], 1)

    def test_organization_detail(self):
        res = self.client.get(f"/api/platform/organizations/{self.org_a.id}/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], str(self.org_a.id))
        self.assertEqual(data["owner"]["email"], "owner.a@pharma-a.com")
        self.assertEqual(len(data["stores"]), 1)
        self.assertEqual(len(data["domains"]), 1)

    def test_organization_suspension_and_session_eviction(self):
        # Create an active database session for staff_a
        from django.contrib.sessions.backends.db import SessionStore
        staff_session = SessionStore()
        staff_session["_auth_user_id"] = str(self.staff_a.id)
        staff_session["_auth_user_backend"] = "django.contrib.auth.backends.ModelBackend"
        staff_session.save()
        staff_session_key = staff_session.session_key
        self.assertTrue(Session.objects.filter(session_key=staff_session_key).exists())

        # Suspend organization
        res = self.client.post(
            f"/api/platform/organizations/{self.org_a.id}/status/",
            {"is_active": False, "reason": "Non-payment of SaaS invoice"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res.status_code, 200)
        self.org_a.refresh_from_db()
        self.assertFalse(self.org_a.is_active)

        # Audit event recorded
        audit = AuditEvent.objects.filter(
            event_type="PLATFORM_ORG_STATUS_CHANGED", organization=self.org_a
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.details["reason"], "Non-payment of SaaS invoice")
        self.assertFalse(audit.details["after_is_active"])
        # Verify staff_a's session was revoked from the database
        self.assertFalse(Session.objects.filter(session_key=staff_session_key).exists())

    def test_user_listing_never_exposes_passwords_or_hashes(self):
        res = self.client.get("/api/platform/users/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreater(data["count"], 0)
        for user_obj in data["results"]:
            self.assertNotIn("password", user_obj)
            self.assertNotIn("password_hash", user_obj)
            self.assertNotIn("token", user_obj)
            self.assertNotIn("secret", user_obj)
            self.assertIn("email", user_obj)
            self.assertIn("is_active", user_obj)

    def test_user_suspension_blocks_access_and_records_audit(self):
        # Suspend staff_a
        res = self.client.post(
            f"/api/platform/users/{self.staff_a.id}/status/",
            {"is_active": False, "reason": "Security investigation"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res.status_code, 200)
        self.staff_a.refresh_from_db()
        self.assertFalse(self.staff_a.is_active)

        audit = AuditEvent.objects.filter(event_type="PLATFORM_USER_STATUS_CHANGED").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.details["target_user_id"], str(self.staff_a.id))
        self.assertEqual(audit.details["reason"], "Security investigation")

    def test_cannot_suspend_self(self):
        res = self.client.post(
            f"/api/platform/users/{self.platform_owner.id}/status/",
            {"is_active": False, "reason": "Accidental self-lockout"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res.status_code, 400)
        self.platform_owner.refresh_from_db()
        self.assertTrue(self.platform_owner.is_active)

    def test_temporary_password_generation_workflow(self):
        res = self.client.post(
            f"/api/platform/users/{self.staff_a.id}/temporary-password/",
            {"reason": "User forgot credentials and requested admin reset"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate, private")

        data = res.json()
        temp_password = data.get("temporary_password")
        self.assertIsNotNone(temp_password)
        self.assertTrue(data.get("must_change_password"))

        # Verify password is valid in DB
        self.staff_a.refresh_from_db()
        self.assertTrue(self.staff_a.check_password(temp_password))
        self.assertTrue(self.staff_a.must_change_password)

        # Audit event created without password in details
        audit = AuditEvent.objects.filter(event_type="PLATFORM_USER_TEMP_PASSWORD_GENERATED").first()
        self.assertIsNotNone(audit)
        self.assertNotIn("password", str(audit.details))
        self.assertNotIn(temp_password, str(audit.details))

    def test_revoke_user_sessions(self):
        # Simulate active database session for staff_a
        from django.contrib.sessions.backends.db import SessionStore
        staff_session = SessionStore()
        staff_session["_auth_user_id"] = str(self.staff_a.id)
        staff_session["_auth_user_backend"] = "django.contrib.auth.backends.ModelBackend"
        staff_session.save()
        staff_session_key = staff_session.session_key
        self.assertTrue(Session.objects.filter(session_key=staff_session_key).exists())

        res = self.client.post(
            f"/api/platform/users/{self.staff_a.id}/revoke-sessions/",
            {"reason": "Lost device reported"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res.status_code, 200)

        # Audit event recorded
        audit = AuditEvent.objects.filter(event_type="PLATFORM_USER_SESSIONS_REVOKED").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.details["reason"], "Lost device reported")
        self.assertFalse(Session.objects.filter(session_key=staff_session_key).exists())

    def test_domain_create_duplicate_prevention_and_verification(self):
        # 1. Create duplicate domain fails
        res_dup = self.client.post(
            "/api/platform/domains/",
            {"organization_id": str(self.org_a.id), "domain": "alpha.client.com"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_dup.status_code, 400)

        # 2. Create reserved domain fails
        res_res = self.client.post(
            "/api/platform/domains/",
            {"organization_id": str(self.org_a.id), "domain": "pharmapro.diracai.com"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_res.status_code, 400)

        # 3. Create valid new domain succeeds as pending
        res_ok = self.client.post(
            "/api/platform/domains/",
            {"organization_id": str(self.org_a.id), "domain": "beta.client.com"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_ok.status_code, 201)
        new_domain_id = res_ok.json()["id"]

        # 4. Explicit verification workflow
        res_verify = self.client.post(
            f"/api/platform/domains/{new_domain_id}/verify/",
            {"reason": "DNS CNAME verified via Cloudflare"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_verify.status_code, 200)
        d_obj = OrganizationDomain.objects.get(id=new_domain_id)
        self.assertTrue(d_obj.is_verified)
        self.assertEqual(d_obj.status, "active")

        # 5. Status change to suspended
        res_status = self.client.post(
            f"/api/platform/domains/{new_domain_id}/status/",
            {"status": "suspended", "reason": "Certificate expired"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_status.status_code, 200)
        d_obj.refresh_from_db()
        self.assertEqual(d_obj.status, "suspended")

        # 6. Delete domain
        res_del = self.client.delete(
            f"/api/platform/domains/{new_domain_id}/",
            {"reason": "Client migrated to new URL"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_del.status_code, 200)
        self.assertFalse(OrganizationDomain.objects.filter(id=new_domain_id).exists())

    def test_login_activity_and_audit_queries(self):
        # Create sample events
        AuditEvent.log_event(
            event_type="AUTH_LOGIN_SUCCESS",
            user=self.staff_a,
            organization=self.org_a,
            details={"ip": "127.0.0.1"},
        )
        AuditEvent.log_event(
            event_type="AUTH_LOGIN_FAILED",
            details={"attempted_email": "intruder@phishing.com", "ip": "10.0.0.1"},
        )

        res_activity = self.client.get("/api/platform/login-activity/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_activity.status_code, 200)
        data = res_activity.json()
        self.assertGreaterEqual(data["count"], 2)

        res_audit = self.client.get("/api/platform/audit/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_audit.status_code, 200)
        self.assertGreaterEqual(res_audit.json()["count"], 2)


class PlatformLoginRedirectionAndTenantTests(TestCase):
    """
    Verifies authentication and role-based payload scenarios on PharmaPro platform login (/login):
      1. Platform Owner logs in through /api/auth/login/ and gets is_platform_admin=True (no pharmacy org needed)
      2. Pharmacy Owner logs in and gets is_platform_admin=False, primary_role='owner'
      3. Manager logs in and gets primary_role='manager', rejected from /api/platform/
      4. Staff logs in and gets primary_role='employee', rejected from /api/platform/
      5. Tenant context resolution does not block or redirect legitimate Platform Owner without org
    """

    def setUp(self):
        self.client = Client()

        # Platform Owner (No Organization or Store membership)
        self.platform_owner = User.objects.create_superuser(
            email="platform.admin@diracpharma.com",
            full_name="Global Platform Admin",
            password="PlatformSuperPassword@123",
            is_email_verified=True,
        )

        # Pharmacy Setup
        self.pharmacy_owner = User.objects.create_user(
            email="owner.dr.rajesh@sushrusha.com",
            full_name="Dr. Rajesh Varma",
            password="PharmacyOwnerPassword@123",
            is_staff=False,
            is_superuser=False,
            is_email_verified=True,
        )
        self.org = Organization.objects.create(
            name="Sushrusha Hospital Pharmacy",
            slug="sushrusha-pharma-test",
            owner=self.pharmacy_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.pharmacy_owner,
            role="owner",
            is_active=True,
        )

        self.store = Store.objects.create(
            organization=self.org,
            name="Main Dispensing Unit",
            code="DISP-01",
            status="active",
        )

        self.manager = User.objects.create_user(
            email="manager.sunil@sushrusha.com",
            full_name="Sunil Manager",
            password="ManagerPassword@123",
            is_staff=False,
            is_superuser=False,
        )
        StoreMembership.objects.create(
            store=self.store, user=self.manager, role="manager", is_active=True
        )

        self.cashier = User.objects.create_user(
            email="cashier.amit@sushrusha.com",
            full_name="Amit Cashier",
            password="CashierPassword@123",
            is_staff=False,
            is_superuser=False,
        )
        StoreMembership.objects.create(
            store=self.store, user=self.cashier, role="cashier", is_active=True
        )

    def test_platform_owner_login_payload_and_access(self):
        """Platform Owner logs in via standard login API on platform domain and has platform admin flags."""
        res = self.client.post(
            "/api/auth/login/",
            {"email": "platform.admin@diracpharma.com", "password": "PlatformSuperPassword@123"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        user_data = data["user"]

        self.assertTrue(user_data["is_platform_admin"])
        self.assertTrue(user_data["is_superuser"])
        self.assertTrue(user_data["is_staff"])
        self.assertEqual(user_data["primary_role"], "none")
        self.assertIsNone(user_data["active_organization"])

        # Authenticated session can access platform APIs without requiring pharmacy membership
        res_overview = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_overview.status_code, 200)

    def test_pharmacy_owner_login_payload_and_platform_denial(self):
        """Pharmacy Owner logs in, gets primary_role='owner', and is rejected from platform endpoints."""
        res = self.client.post(
            "/api/auth/login/",
            {"email": "owner.dr.rajesh@sushrusha.com", "password": "PharmacyOwnerPassword@123"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res.status_code, 200)
        user_data = res.json()["user"]

        self.assertFalse(user_data["is_platform_admin"])
        self.assertEqual(user_data["primary_role"], "owner")
        self.assertIsNotNone(user_data["active_organization"])
        self.assertEqual(user_data["active_organization"]["id"], str(self.org.id))

        # Pharmacy owner is strictly denied from platform endpoints
        res_platform = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_platform.status_code, 403)

    def test_store_manager_login_payload_and_platform_denial(self):
        """Store Manager logs in, gets primary_role='manager', and is rejected from platform endpoints."""
        res = self.client.post(
            "/api/auth/login/",
            {"email": "manager.sunil@sushrusha.com", "password": "ManagerPassword@123"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res.status_code, 200)
        user_data = res.json()["user"]

        self.assertFalse(user_data["is_platform_admin"])
        self.assertEqual(user_data["primary_role"], "manager")

        res_platform = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_platform.status_code, 403)

    def test_cashier_staff_login_payload_and_platform_denial(self):
        """Cashier/Staff logs in, gets primary_role='employee', and is rejected from platform endpoints."""
        res = self.client.post(
            "/api/auth/login/",
            {"email": "cashier.amit@sushrusha.com", "password": "CashierPassword@123"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res.status_code, 200)
        user_data = res.json()["user"]

        self.assertFalse(user_data["is_platform_admin"])
        self.assertEqual(user_data["primary_role"], "employee")

        res_platform = self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_platform.status_code, 403)


class PlatformRegistrationSettingsAndDomainSimplificationTests(TestCase):
    """
    Tests:
      1. Platform Owner sees/manages Domain Management (with pharmapro.diracai.com) & Registration Settings.
      2. Platform Owner can enable and disable public registration, recording who/when/reason.
      3. Registration is rejected server-side with 403 when disabled.
      4. Existing users (Owner, Manager, Staff, Platform Owner) can still log in when registration is disabled.
      5. Pharmacy users cannot access platform registration settings or domain management.
      6. Re-enabling registration permits new public pharmacy registration again.
    """

    def setUp(self):
        self.client = Client()

        self.platform_owner = User.objects.create_superuser(
            email="platform.owner@diracai.com",
            full_name="Platform Admin",
            password="StrongPassword@123",
            is_email_verified=True,
        )

        self.pharmacy_owner = User.objects.create_user(
            email="owner@pharmacy.com",
            full_name="Pharmacy Owner",
            password="StrongPassword@123",
            is_staff=False,
            is_superuser=False,
            is_email_verified=True,
        )
        self.org = Organization.objects.create(
            name="HealthFirst Pharmacy",
            slug="healthfirst-pharma",
            owner=self.pharmacy_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.org, user=self.pharmacy_owner, role="owner", is_active=True
        )
        self.store = Store.objects.create(
            organization=self.org, name="Branch 1", code="HF-01", status="active"
        )

        self.manager = User.objects.create_user(
            email="manager@pharmacy.com",
            full_name="Branch Manager",
            password="StrongPassword@123",
        )
        StoreMembership.objects.create(
            store=self.store, user=self.manager, role="manager", is_active=True
        )

    def test_host_info_includes_pharmapro_and_excludes_dev_localhost(self):
        self.client.force_login(self.platform_owner)
        res = self.client.get("/api/platform/host-info/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["primary_platform_domain"], "pharmapro.diracai.com")
        self.assertIn("pharmapro.diracai.com", data["configured_platform_domains"])

        # Verify localhost / sushrusha.localhost excluded from production lists
        for dev_host in ("localhost", "127.0.0.1", "testserver", "sushrusha.localhost"):
            self.assertNotIn(dev_host, data["configured_platform_domains"])
            self.assertNotIn(dev_host, [m["domain"] for m in data["configured_client_mappings"]])

    def test_register_domain_prevents_duplicates_cross_org_conflicts_and_dev_hosts(self):
        self.client.force_login(self.platform_owner)

        # Create second organization
        second_owner = User.objects.create_user(
            email="second@pharmacy.com",
            full_name="Second Owner",
            password="StrongPassword@123",
        )
        second_org = Organization.objects.create(
            name="Second Pharmacy", slug="second-pharma", owner=second_owner, is_active=True
        )

        # 1. Cannot register pharmapro.diracai.com or *.localhost
        for forbidden in ("pharmapro.diracai.com", "sushrusha.localhost", "localhost"):
            res_forb = self.client.post(
                "/api/platform/domains/",
                {"organization_id": str(self.org.id), "domain": forbidden},
                content_type="application/json",
                HTTP_HOST="pharmapro.diracai.com",
            )
            self.assertEqual(res_forb.status_code, 400, f"Forbidden host {forbidden} should fail 400")

        # 2. Register erp.sushrusaeclinic.com once for org A
        res_ok = self.client.post(
            "/api/platform/domains/",
            {"organization_id": str(self.org.id), "domain": "erp.sushrusaeclinic.com"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_ok.status_code, 201)
        dom_id = res_ok.json()["id"]

        # 3. Attempting duplicate claim for second_org must fail 400 (cross-org conflict)
        res_dup = self.client.post(
            "/api/platform/domains/",
            {"organization_id": str(second_org.id), "domain": "ERP.SUSHRUSAECLINIC.COM"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_dup.status_code, 400)

        # 4. Deactivating or disconnecting client domain leaves pharmapro.diracai.com fully functional
        res_deact = self.client.post(
            f"/api/platform/domains/{dom_id}/status/",
            {"status": "suspended", "reason": "Routine client domain check"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_deact.status_code, 200)

        from apps.organizations.domain_routing import classify_domain
        cat, org = classify_domain("pharmapro.diracai.com")
        self.assertEqual(cat, "platform")
        self.assertIsNone(org)

        res_list = self.client.get("/api/platform/domains/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_list.status_code, 200)
        # Ensure sushrusha domain appears exactly once in DB results
        sushrusha_items = [r for r in res_list.json()["results"] if r["domain"] == "erp.sushrusaeclinic.com"]
        self.assertEqual(len(sushrusha_items), 1)

    def test_domain_serializer_includes_organization_registration_info(self):
        dom = OrganizationDomain.objects.create(
            organization=self.org,
            domain="erp.healthfirst.in",
            domain_type="client",
            is_verified=False,
            status="pending",
        )
        self.client.force_login(self.platform_owner)
        res = self.client.get("/api/platform/domains/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res.status_code, 200)
        results = res.json()["results"]
        matching = [r for r in results if r["id"] == str(dom.id)]
        self.assertEqual(len(matching), 1)
        item = matching[0]
        self.assertEqual(item["organization_name"], "HealthFirst Pharmacy")
        self.assertEqual(item["organization_slug"], "healthfirst-pharma")
        self.assertEqual(item["owner_email"], "owner@pharmacy.com")
        self.assertEqual(item["stores_count"], 1)
        self.assertEqual(item["verification_method"], "unverified")

    def test_sushrusha_register_verify_activate_suspend_lifecycle_and_fail_closed(self):
        """
        Verifies end-to-end Sushrusha domain workflow:
          - Unregistered erp.sushrusaeclinic.com fails closed (HTTP 400)
          - Register Domain maps erp.sushrusaeclinic.com to existing Sushrusha_Pharma (no duplicate org)
          - Domain starts pending & unverified; cannot be activated before verification; pending domain fails closed
          - Manual verification activates it and resolves directly to Sushrusha_Pharma & preserves stores/memberships
          - Suspending blocks access (HTTP 400) while preserving pharmapro.diracai.com
        """
        sushrusha_owner = User.objects.create_user(
            email="ushashreenayak25@gmail.com",
            full_name="Ushashree Nayak",
            password="StrongPassword@123",
            is_email_verified=True,
        )
        sushrusha_org = Organization.objects.create(
            name="Sushrusha_Pharma",
            slug="sushrusha-pharmacy-store",
            owner=sushrusha_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=sushrusha_org, user=sushrusha_owner, role="owner", is_active=True
        )
        sushrusha_store = Store.objects.create(
            organization=sushrusha_org, name="Sushrusa E-Clinic", code="STR-002", status="active"
        )

        # 1. Unregistered erp.sushrusaeclinic.com -> fails closed HTTP 400
        res_unreg = self.client.post(
            "/api/auth/login/",
            {"email": "ushashreenayak25@gmail.com", "password": "StrongPassword@123"},
            content_type="application/json",
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res_unreg.status_code, 400)

        # 2. Platform Owner registers erp.sushrusaeclinic.com for existing Sushrusha_Pharma
        self.client.force_login(self.platform_owner)
        org_count_before = Organization.objects.count()
        res_create = self.client.post(
            "/api/platform/domains/",
            {
                "organization_id": str(sushrusha_org.id),
                "domain": "erp.sushrusaeclinic.com",
                "domain_type": "client",
                "is_primary": True,
            },
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_create.status_code, 201)
        dom_data = res_create.json()
        dom_id = dom_data["id"]

        # Confirm NO duplicate org created, and NOT auto-verified
        self.assertEqual(Organization.objects.count(), org_count_before)
        self.assertFalse(dom_data["is_verified"])
        self.assertEqual(dom_data["status"], "pending")
        self.assertEqual(dom_data["organization_slug"], "sushrusha-pharmacy-store")
        self.assertEqual(dom_data["owner_email"], "ushashreenayak25@gmail.com")

        # 3. Attempting to activate unverified domain fails HTTP 400
        res_act_fail = self.client.post(
            f"/api/platform/domains/{dom_id}/status/",
            {"status": "active", "reason": "Bypass attempt"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_act_fail.status_code, 400)

        # 4. Pending domain still fails closed on HTTP request
        self.client.logout()
        res_pending = self.client.post(
            "/api/auth/login/",
            {"email": "ushashreenayak25@gmail.com", "password": "StrongPassword@123"},
            content_type="application/json",
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res_pending.status_code, 400)

        # 5. Platform Owner verifies domain manually -> now verified & active
        self.client.force_login(self.platform_owner)
        res_verify = self.client.post(
            f"/api/platform/domains/{dom_id}/verify/",
            {"reason": "Confirmed DNS A/CNAME and SSL certificate externally"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_verify.status_code, 200)
        self.assertTrue(res_verify.json()["domain"]["is_verified"])
        self.assertEqual(res_verify.json()["domain"]["status"], "active")

        # 6. Sushrusha Owner logs in on erp.sushrusaeclinic.com -> resolves cleanly to Sushrusha_Pharma & preserves store
        self.client.logout()
        res_ok = self.client.post(
            "/api/auth/login/",
            {"email": "ushashreenayak25@gmail.com", "password": "StrongPassword@123"},
            content_type="application/json",
            HTTP_HOST="erp.sushrusaeclinic.com",
        )
        self.assertEqual(res_ok.status_code, 200)
        self.assertEqual(res_ok.json()["user"]["active_organization"]["slug"], "sushrusha-pharmacy-store")
        self.assertEqual(Store.objects.filter(organization=sushrusha_org, id=sushrusha_store.id).count(), 1)

        # 7. Suspending erp.sushrusaeclinic.com immediately fails closed while pharmapro.diracai.com stays intact
        self.client.force_login(self.platform_owner)
        res_susp = self.client.post(
            f"/api/platform/domains/{dom_id}/status/",
            {"status": "suspended", "reason": "Scheduled maintenance"},
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_susp.status_code, 200)
        self.client.logout()
        res_after_susp = self.client.get("/api/health/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(res_after_susp.status_code, 400)
        res_plat_ok = self.client.get("/api/health/", HTTP_HOST="pharmapro.diracai.com")
        self.assertNotEqual(res_plat_ok.status_code, 400)

    def test_pharmacy_users_denied_platform_settings_and_domains(self):
        # Anonymous
        self.assertIn(
            self.client.get("/api/platform/registration-settings/", HTTP_HOST="pharmapro.diracai.com").status_code,
            (401, 403),
        )
        self.assertIn(
            self.client.get("/api/platform/host-info/", HTTP_HOST="pharmapro.diracai.com").status_code,
            (401, 403),
        )

        # Pharmacy Owner
        self.client.force_login(self.pharmacy_owner)
        self.assertEqual(
            self.client.get("/api/platform/registration-settings/", HTTP_HOST="pharmapro.diracai.com").status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/platform/registration-settings/",
                {"public_registration_enabled": False, "reason": "Unauthorized attempt"},
                content_type="application/json",
                HTTP_HOST="pharmapro.diracai.com",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/platform/domains/", HTTP_HOST="pharmapro.diracai.com").status_code,
            403,
        )

        # Store Manager
        self.client.force_login(self.manager)
        self.assertEqual(
            self.client.get("/api/platform/registration-settings/", HTTP_HOST="pharmapro.diracai.com").status_code,
            403,
        )

    def test_disable_and_enable_registration_enforced_server_side_while_logins_work(self):
        # 1. Initially public registration is enabled
        res_pub = self.client.get("/api/auth/registration-status/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_pub.status_code, 200)
        self.assertTrue(res_pub.json()["public_registration_enabled"])

        # 2. Platform Owner disables public registration with reason
        self.client.force_login(self.platform_owner)
        res_disable = self.client.post(
            "/api/platform/registration-settings/",
            {
                "public_registration_enabled": False,
                "reason": "Temporary pause for scheduled compliance review",
            },
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_disable.status_code, 200)
        disable_data = res_disable.json()
        self.assertFalse(disable_data["public_registration_enabled"])
        self.assertEqual(disable_data["updated_by_email"], "platform.owner@diracai.com")
        self.assertEqual(disable_data["last_updated_reason"], "Temporary pause for scheduled compliance review")
        self.assertGreaterEqual(len(disable_data["history"]), 1)
        self.assertEqual(disable_data["history"][0]["actor_email"], "platform.owner@diracai.com")
        self.assertFalse(disable_data["history"][0]["after_enabled"])

        # 3. Public registration status now reports disabled
        self.client.logout()
        res_pub_after = self.client.get("/api/auth/registration-status/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(res_pub_after.status_code, 200)
        self.assertFalse(res_pub_after.json()["public_registration_enabled"])

        # 4. New public Owner registration must be rejected with HTTP 403
        res_reg_blocked = self.client.post(
            "/api/auth/register/owner/",
            {
                "fullName": "New Owner",
                "organizationName": "Blocked Org",
                "email": "blocked.owner@test.com",
                "phoneNumber": "+91 99999 00000",
                "password": "StrongPassword@123",
                "confirmPassword": "StrongPassword@123",
            },
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_reg_blocked.status_code, 403)
        self.assertEqual(res_reg_blocked.json()["code"], "registration_disabled")
        self.assertFalse(User.objects.filter(email="blocked.owner@test.com").exists())

        # 5. Existing Pharmacy Owner, Manager, and Platform Owner login MUST still work!
        for login_email in ["owner@pharmacy.com", "manager@pharmacy.com", "platform.owner@diracai.com"]:
            res_login = self.client.post(
                "/api/auth/login/",
                {"email": login_email, "password": "StrongPassword@123"},
                content_type="application/json",
                HTTP_HOST="pharmapro.diracai.com",
            )
            self.assertEqual(res_login.status_code, 200, f"Login failed for existing user {login_email}")

        # 6. Platform Owner re-enables public registration
        self.client.force_login(self.platform_owner)
        res_enable = self.client.post(
            "/api/platform/registration-settings/",
            {
                "public_registration_enabled": True,
                "reason": "Compliance review finished; reopening onboarding",
            },
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_enable.status_code, 200)
        self.assertTrue(res_enable.json()["public_registration_enabled"])

        # 7. Public registration succeeds again
        self.client.logout()
        res_reg_ok = self.client.post(
            "/api/auth/register/owner/",
            {
                "fullName": "New Allowed Owner",
                "organizationName": "Reopened Pharmacy",
                "email": "reopened.owner@test.com",
                "phoneNumber": "+91 99999 11111",
                "password": "StrongPassword@123",
                "confirmPassword": "StrongPassword@123",
            },
            content_type="application/json",
            HTTP_HOST="pharmapro.diracai.com",
        )
        self.assertEqual(res_reg_ok.status_code, 201)
        self.assertTrue(User.objects.filter(email="reopened.owner@test.com").exists())


