from django.test import TestCase, Client
from apps.authentication.models import User
from apps.organizations.models import (
    Organization,
    Store,
    OrganizationMembership,
    StoreMembership,
    OrganizationDomain,
)
from apps.partners.models import Partner, PartnerMembership, PartnerDomain
from apps.products.models import Product
from apps.audit.models import AuditEvent


class PartnerAdministrationAndIsolationTests(TestCase):
    """
    Comprehensive end-to-end tests for Sushrusha Partner Administration,
    host-aware login routing, customer pharmacy isolation, forced password change,
    store/manager provisioning, and account suspension/session eviction.
    """

    def setUp(self):
        # 1. Existing non-partner operational Sushrusha pharmacy (must remain untouched & isolated)
        self.legacy_owner = User.objects.create_user(
            email="legacy.owner@sushrusha.local",
            full_name="Legacy Pharmacy Owner",
            password="LegacyPass@2026!",
            is_email_verified=True,
        )
        self.legacy_org = Organization.objects.create(
            name="Sushrusha_Pharma",
            slug="sushrusha-pharmacy-store",
            owner=self.legacy_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.legacy_org,
            user=self.legacy_owner,
            role="owner",
            is_active=True,
        )
        Store.objects.create(
            organization=self.legacy_org,
            name="Legacy Store",
            code="STR-001",
            status="active",
        )

        # 2. PharmaPro Platform Owner
        self.platform_admin = User.objects.create_superuser(
            email="platform@diracai.com",
            full_name="Platform Superuser",
            password="PlatformPass@2026!",
        )

        # 3. Sushrusha E-Clinic Partner + Verified Active PartnerDomain
        self.partner = Partner.objects.create(
            name="Sushrusha E-Clinic",
            slug="sushrusha-eclinic",
            contact_email="partner@sushrusaeclinic.com",
            is_active=True,
        )
        self.partner_domain = PartnerDomain.objects.create(
            partner=self.partner,
            domain="erp.sushrusaeclinic.com",
            is_verified=True,
            is_primary=True,
            status="active",
        )
        self.partner_owner = User.objects.create_user(
            email="partner.owner@sushrusaeclinic.com",
            full_name="Sushrusha Partner Admin",
            password="PartnerPass@2026!",
            is_email_verified=True,
        )
        PartnerMembership.objects.create(
            partner=self.partner,
            user=self.partner_owner,
            role="partner_owner",
            is_active=True,
        )

        self.client = Client()

    def _login(self, client_obj, email, password, host="erp.sushrusaeclinic.com"):
        return client_obj.post(
            "/api/auth/login/",
            {"email": email, "password": password},
            HTTP_HOST=host,
            content_type="application/json",
        )

    def test_partner_domain_fail_closed_when_unverified_or_suspended(self):
        self.partner_domain.is_verified = False
        self.partner_domain.status = "pending"
        self.partner_domain.save()
        res = self._login(self.client, self.partner_owner.email, "PartnerPass@2026!")
        self.assertEqual(res.status_code, 400)

        self.partner_domain.is_verified = True
        self.partner_domain.status = "suspended"
        self.partner_domain.save()
        res_susp = self._login(self.client, self.partner_owner.email, "PartnerPass@2026!")
        self.assertEqual(res_susp.status_code, 400)

        self.partner_domain.status = "active"
        self.partner_domain.save()
        res_ok = self._login(self.client, self.partner_owner.email, "PartnerPass@2026!")
        self.assertEqual(res_ok.status_code, 200)
        self.assertEqual(res_ok.json()["user"]["portal_role"], "PARTNER_OWNER")

    def test_non_partner_legacy_and_platform_users_cannot_login_on_partner_domain(self):
        # Existing operational Sushrusha_Pharma (partner=None) must NOT log in on partner domain
        res_legacy = self._login(self.client, self.legacy_owner.email, "LegacyPass@2026!")
        self.assertEqual(res_legacy.status_code, 401)

        # Platform owner must NOT log in on partner domain
        res_platform = self._login(self.client, self.platform_admin.email, "PlatformPass@2026!")
        self.assertEqual(res_platform.status_code, 401)

    def test_partner_owner_cannot_access_platform_or_customer_operational_routes(self):
        res = self._login(self.client, self.partner_owner.email, "PartnerPass@2026!")
        self.assertEqual(res.status_code, 200)
        user_data = res.json()["user"]
        self.assertEqual(user_data["portal_role"], "PARTNER_OWNER")
        self.assertIsNone(user_data["active_organization"])
        self.assertEqual(user_data["organizations"], [])

        # Cannot call /api/platform/ from partner or platform host
        self.assertEqual(
            self.client.get("/api/platform/overview/", HTTP_HOST="erp.sushrusaeclinic.com").status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/platform/overview/", HTTP_HOST="pharmapro.diracai.com").status_code,
            403,
        )

        # Cannot call operational customer endpoints
        for op_url in [
            "/api/organizations/overview/",
            "/api/organizations/stores/",
            "/api/products/",
            "/api/inventory/suppliers/",
            "/api/billing/invoices/",
            "/api/audit/",
        ]:
            op_res = self.client.get(op_url, HTTP_HOST="erp.sushrusaeclinic.com")
            self.assertEqual(op_res.status_code, 403, f"Expected 403 on {op_url}, got {op_res.status_code}")

    def test_partner_end_to_end_customer_provisioning_and_customer_manager_flow(self):
        # 1. Partner Owner logs in
        login_res = self._login(self.client, self.partner_owner.email, "PartnerPass@2026!")
        self.assertEqual(login_res.status_code, 200)

        # 2. Partner Owner creates Customer Pharmacy Org A with 2 stores and Primary Manager A
        create_res = self.client.post(
            "/api/partner/pharmacies/",
            {
                "name": "Arogya Medicos",
                "city": "Bhubaneswar",
                "state": "Odisha",
                "license_number": "DL-20B-991",
                "stores": [
                    {"name": "Arogya Main Branch", "code": "ARM-001", "city": "Bhubaneswar", "status": "active"},
                    {"name": "Arogya Unit 2", "code": "ARM-002", "city": "Cuttack", "status": "active"},
                ],
                "manager": {
                    "full_name": "Dr. Ananya Das",
                    "email": "ananya@arogyamedicos.com",
                    "phone_number": "9876543210",
                },
            },
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(create_res.status_code, 201)
        self.assertIn("no-store", create_res["Cache-Control"])
        create_data = create_res.json()
        org_a_id = create_data["pharmacy"]["id"]
        temp_pw = create_data["manager_credentials"]["temporary_password"]
        self.assertTrue(temp_pw)
        self.assertTrue(create_data["manager_credentials"]["must_change_password"])

        # Verify independent Organization was created (not a store under legacy Sushrusha_Pharma)
        org_a = Organization.objects.get(id=org_a_id)
        self.assertEqual(org_a.partner, self.partner)
        self.assertNotEqual(org_a.id, self.legacy_org.id)
        self.assertEqual(self.legacy_org.stores.count(), 1)
        self.assertEqual(org_a.stores.count(), 2)

        # Verify audit log does NOT store plaintext password
        audit_ev = AuditEvent.objects.filter(event_type="PARTNER_PHARMACY_CREATED").first()
        self.assertIsNotNone(audit_ev)
        self.assertNotIn(temp_pw, str(audit_ev.details))

        # 3. Customer Pharmacy Manager A logs in on erp.sushrusaeclinic.com with temp password
        mgr_client = Client()
        mgr_login = self._login(mgr_client, "ananya@arogyamedicos.com", temp_pw)
        self.assertEqual(mgr_login.status_code, 200)
        mgr_login_data = mgr_login.json()
        self.assertTrue(mgr_login_data["must_change_password"])
        self.assertEqual(mgr_login_data["user"]["portal_role"], "PHARMACY_MANAGER")
        self.assertEqual(mgr_login_data["user"]["active_organization"]["id"], str(org_a.id))

        # Blocked on operational APIs until temporary password is changed
        blocked_res = mgr_client.get("/api/organizations/stores/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(blocked_res.status_code, 403)
        self.assertEqual(blocked_res.json().get("code"), "MUST_CHANGE_PASSWORD")

        # 4. Manager changes temporary password
        ch_res = mgr_client.post(
            "/api/auth/change-password/",
            {
                "current_password": temp_pw,
                "new_password": "AnanyaNewPass@2026!",
                "confirm_new_password": "AnanyaNewPass@2026!",
            },
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(ch_res.status_code, 200)

        # 5. Now Manager A accesses their own pharmacy workspace cleanly
        ov_res = mgr_client.get("/api/organizations/overview/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(ov_res.status_code, 200)
        self.assertEqual(ov_res.json()["organization"]["id"], str(org_a.id))
        self.assertEqual(ov_res.json()["metrics"]["total_stores"], 2)

        stores_res = mgr_client.get("/api/organizations/stores/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(stores_res.status_code, 200)
        self.assertEqual(len(stores_res.json()), 2)

        # Manager A CANNOT access Partner Admin or Platform Admin APIs
        self.assertEqual(
            mgr_client.get("/api/partner/overview/", HTTP_HOST="erp.sushrusaeclinic.com").status_code,
            403,
        )
        self.assertEqual(
            mgr_client.get("/api/platform/overview/", HTTP_HOST="erp.sushrusaeclinic.com").status_code,
            403,
        )

        # Manager A creates a product in Org A; Partner Owner still cannot read Org A's products
        prod_res = mgr_client.post(
            "/api/products/",
            {
                "name": "Paracetamol 650mg",
                "sku": "PARA-650-A",
                "category": "otc_medicines",
                "dosage_form": "tablet",
                "manufacturer": "Apex Labs",
                "gst_rate": "12.00",
            },
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(prod_res.status_code, 201)
        self.assertEqual(
            self.client.get("/api/products/", HTTP_HOST="erp.sushrusaeclinic.com").status_code,
            403,
        )

        # Partner Owner can add another store to Org A and verify partner store & manager APIs
        add_store_res = self.client.post(
            "/api/partner/stores/",
            {"organization_id": org_a_id, "name": "Arogya Unit 3", "city": "Puri", "status": "active"},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(add_store_res.status_code, 201)
        unit3_id = add_store_res.json()["store"]["id"]

        # Create a secondary store manager for Org A and reassign stores
        add_mgr_res = self.client.post(
            "/api/partner/managers/",
            {
                "organization_id": org_a_id,
                "full_name": "Branch Lead A",
                "email": "branch.lead@arogyamedicos.com",
                "store_ids": [unit3_id],
            },
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(add_mgr_res.status_code, 201)
        self.assertIn("no-store", add_mgr_res["Cache-Control"])
        sec_mgr_id = add_mgr_res.json()["manager"]["id"]

        assign_res = self.client.patch(
            f"/api/partner/managers/{sec_mgr_id}/assign-stores/",
            {"organization_id": org_a_id, "store_ids": [unit3_id]},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(assign_res.status_code, 200)

        # 6. Partner creates Customer Pharmacy Org B and Manager B -> strict cross-tenant isolation
        create_b_res = self.client.post(
            "/api/partner/pharmacies/",
            {
                "name": "CareWell Pharmacy",
                "stores": [{"name": "CareWell Flagship", "code": "CW-001", "status": "active"}],
                "manager": {
                    "full_name": "Vikram Rao",
                    "email": "vikram@carewell.com",
                },
            },
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(create_b_res.status_code, 201)
        org_b_id = create_b_res.json()["pharmacy"]["id"]
        temp_pw_b = create_b_res.json()["manager_credentials"]["temporary_password"]

        mgr_b_client = Client()
        self.assertEqual(self._login(mgr_b_client, "vikram@carewell.com", temp_pw_b).status_code, 200)
        self.assertEqual(
            mgr_b_client.post(
                "/api/auth/change-password/",
                {
                    "current_password": temp_pw_b,
                    "new_password": "VikramNewPass@2026!",
                    "confirm_new_password": "VikramNewPass@2026!",
                },
                HTTP_HOST="erp.sushrusaeclinic.com",
                content_type="application/json",
            ).status_code,
            200,
        )

        # Manager B cannot see Org A's Paracetamol product
        b_prods = mgr_b_client.get("/api/products/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(b_prods.status_code, 200)
        b_prod_names = [p["name"] for p in b_prods.json().get("results", b_prods.json() if isinstance(b_prods.json(), list) else [])]
        self.assertNotIn("Paracetamol 650mg", b_prod_names)

        # Manager B cannot switch to Org A
        switch_fail = mgr_b_client.post(
            "/api/auth/switch-organization/",
            {"organization_id": org_a_id},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(switch_fail.status_code, 403)

        # 7. Partner suspends Org A -> evicts Manager A session and blocks login
        susp_res = self.client.post(
            f"/api/partner/pharmacies/{org_a_id}/status/",
            {"is_active": False, "reason": "Subscription payment overdue"},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(susp_res.status_code, 200)
        self.assertGreaterEqual(susp_res.json()["revoked_sessions_count"], 1)

        # Manager A's existing session is invalidated and subsequent login returns 403
        after_susp = mgr_client.get("/api/organizations/overview/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertIn(after_susp.status_code, (401, 403))

        relogin_blocked = self._login(mgr_client, "ananya@arogyamedicos.com", "AnanyaNewPass@2026!")
        self.assertEqual(relogin_blocked.status_code, 403)

        # Product data of Org A remains intact during suspension
        self.assertTrue(Product.objects.filter(organization_id=org_a_id, name="Paracetamol 650mg").exists())

        # Reactivating Org A restores Manager A login & operational data
        react_res = self.client.post(
            f"/api/partner/pharmacies/{org_a_id}/status/",
            {"is_active": True, "reason": "Payment settled"},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(react_res.status_code, 200)
        relogin_ok = self._login(mgr_client, "ananya@arogyamedicos.com", "AnanyaNewPass@2026!")
        self.assertEqual(relogin_ok.status_code, 200)

        # 8. Partner resets Manager B password -> temp password returned once + revokes sessions
        reset_res = self.client.post(
            f"/api/partner/managers/{create_b_res.json()['manager_credentials']['user_id']}/reset-password/",
            {"reason": "Manager requested credential reset"},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(reset_res.status_code, 200)
        self.assertIn("no-store", reset_res["Cache-Control"])
        self.assertTrue(reset_res.json()["must_change_password"])
        self.assertNotEqual(reset_res.json()["temporary_password"], temp_pw_b)

        # Old password for Manager B fails; new temp password works & requires change
        self.assertEqual(
            self._login(Client(), "vikram@carewell.com", "VikramNewPass@2026!").status_code,
            401,
        )
        new_login_b = self._login(Client(), "vikram@carewell.com", reset_res.json()["temporary_password"])
        self.assertEqual(new_login_b.status_code, 200)
        self.assertTrue(new_login_b.json()["must_change_password"])

        # Partner API cannot be called from PharmaPro platform host
        self.assertEqual(
            self.client.get("/api/partner/overview/", HTTP_HOST="pharmapro.diracai.com").status_code,
            403,
        )
        # Org B id verified intact
        self.assertTrue(Organization.objects.filter(id=org_b_id, is_active=True).exists())

    def test_multi_org_customer_manager_switching_and_staff_isolation(self):
        # Partner creates two customer pharmacies and assigns the same user to both
        self._login(self.client, self.partner_owner.email, "PartnerPass@2026!")

        r1 = self.client.post(
            "/api/partner/pharmacies/",
            {
                "name": "Alpha Pharma",
                "stores": [{"name": "Alpha Store 1", "code": "ALP-1", "status": "active"}],
                "manager": {"full_name": "Multi Manager", "email": "multi.mgr@customer.com"},
            },
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(r1.status_code, 201)
        org1_id = r1.json()["pharmacy"]["id"]
        temp_pw = r1.json()["manager_credentials"]["temporary_password"]
        mgr_user = User.objects.get(email="multi.mgr@customer.com")

        r2 = self.client.post(
            "/api/partner/pharmacies/",
            {
                "name": "Beta Pharma",
                "stores": [{"name": "Beta Store 1", "code": "BET-1", "status": "active"}],
            },
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(r2.status_code, 201)
        org2_id = r2.json()["pharmacy"]["id"]
        org2 = Organization.objects.get(id=org2_id)
        OrganizationMembership.objects.create(
            organization=org2, user=mgr_user, role="owner", is_active=True
        )

        mc = Client()
        self.assertEqual(self._login(mc, "multi.mgr@customer.com", temp_pw).status_code, 200)
        mc.post(
            "/api/auth/change-password/",
            {
                "current_password": temp_pw,
                "new_password": "MultiMgrPass@2026!",
                "confirm_new_password": "MultiMgrPass@2026!",
            },
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )

        # Switch to Beta Pharma
        sw = mc.post(
            "/api/auth/switch-organization/",
            {"organization_id": org2_id},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(sw.status_code, 200)
        self.assertEqual(sw.json()["user"]["active_organization"]["id"], org2_id)

        st_res = mc.get("/api/organizations/stores/", HTTP_HOST="erp.sushrusaeclinic.com")
        self.assertEqual(st_res.status_code, 200)
        self.assertEqual([s["code"] for s in st_res.json()], ["BET-1"])

        # Switch back to Alpha Pharma and create a Pharmacy Staff user
        sw2 = mc.post(
            "/api/auth/switch-organization/",
            {"organization_id": org1_id},
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(sw2.status_code, 200)
        alpha_store_id = mc.get("/api/organizations/stores/", HTTP_HOST="erp.sushrusaeclinic.com").json()[0]["id"]

        emp_res = mc.post(
            "/api/organizations/team/",
            {
                "full_name": "Alpha Cashier",
                "email": "cashier@alphapharma.com",
                "role": "cashier",
                "store_ids": [alpha_store_id],
                "password": "CashierPass@2026!",
                "confirm_password": "CashierPass@2026!",
            },
            HTTP_HOST="erp.sushrusaeclinic.com",
            content_type="application/json",
        )
        self.assertEqual(emp_res.status_code, 201)

        # Staff logs in on erp.sushrusaeclinic.com -> PHARMACY_STAFF, restricted from org overview & partner/platform
        sc = Client()
        s_login = self._login(sc, "cashier@alphapharma.com", "CashierPass@2026!")
        self.assertEqual(s_login.status_code, 200)
        self.assertEqual(s_login.json()["user"]["portal_role"], "PHARMACY_STAFF")
        self.assertEqual(
            sc.get("/api/organizations/overview/", HTTP_HOST="erp.sushrusaeclinic.com").status_code,
            403,
        )
        self.assertEqual(
            sc.get("/api/partner/overview/", HTTP_HOST="erp.sushrusaeclinic.com").status_code,
            403,
        )

    def test_local_partner_domain_authorization_on_localhost(self):
        """
        Verify that in local development, an authenticated Partner Owner accessing via
        localhost:8000 or localhost:3000 can access /api/partner/branding/ and
        /api/partner/overview/ with proper partner context.
        """
        c = Client()
        login_res = self._login(c, self.partner_owner.email, "PartnerPass@2026!", host="localhost:8000")
        self.assertEqual(login_res.status_code, 200)

        # 1. Branding on localhost
        branding_res = c.get("/api/partner/branding/", HTTP_HOST="localhost:8000")
        self.assertEqual(branding_res.status_code, 200)
        self.assertEqual(branding_res.json()["slug"], "sushrusha-eclinic")

        # 2. Overview on localhost
        overview_res = c.get("/api/partner/overview/", HTTP_HOST="localhost:8000")
        self.assertEqual(overview_res.status_code, 200)
        self.assertEqual(overview_res.json()["partner"]["slug"], "sushrusha-eclinic")

        # 3. Unauthenticated request to /api/partner/overview/ on localhost is rejected
        unauth_c = Client()
        unauth_res = unauth_c.get("/api/partner/overview/", HTTP_HOST="localhost:8000")
        self.assertIn(unauth_res.status_code, [401, 403])

        # 4. Platform superuser calling /api/partner/overview/ on localhost is rejected
        admin_c = Client()
        admin_login = admin_c.post(
            "/api/auth/login/",
            {"email": "platform@diracai.com", "password": "PlatformPass@2026!"},
            content_type="application/json",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(admin_login.status_code, 200)
        admin_partner_res = admin_c.get("/api/partner/overview/", HTTP_HOST="localhost:8000")
        self.assertEqual(admin_partner_res.status_code, 403)

        # 5. Non-partner production domain calling /api/partner/overview/ is blocked with 403
        prod_res = c.get("/api/partner/overview/", HTTP_HOST="pharmapro.diracai.com")
        self.assertEqual(prod_res.status_code, 403)
