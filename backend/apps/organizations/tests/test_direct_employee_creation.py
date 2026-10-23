import uuid
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.authentication.models import User
from apps.organizations.models import (
    Organization,
    OrganizationMembership,
    Store,
    StoreMembership,
)
from apps.audit.models import AuditEvent


class DirectEmployeeCreationTestCase(TestCase):
    """
    Comprehensive test suite verifying direct account creation for employees and managers,
    immediate login without invitations, voluntary password changes, and store permission boundaries.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Create Owner User and Organization
        self.owner = User.objects.create_user(
            email="owner.direct@sushrusha.com",
            password="StrongPassword@2026",
            full_name="Dr. Sunita Patel",
            phone_number="+91 98765 00001",
            is_email_verified=True,
        )
        self.org = Organization.objects.create(
            name="Patel Healthcare Network",
            owner=self.owner,
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role="owner",
            is_active=True,
        )

        # 2. Create Store Branches
        self.store_main = Store.objects.create(
            organization=self.org,
            name="Patel Central Pharmacy",
            code="PTL-CENTRAL",
            status="active",
        )
        self.store_east = Store.objects.create(
            organization=self.org,
            name="Patel East Branch",
            code="PTL-EAST",
            status="active",
        )
        self.store_west = Store.objects.create(
            organization=self.org,
            name="Patel West Branch",
            code="PTL-WEST",
            status="active",
        )

        # URLs
        self.team_url = reverse("org-team")
        self.login_url = reverse("auth-login")
        self.change_password_url = reverse("auth-change-password")

    def test_owner_creates_employee_and_persists_in_postgres(self):
        """Test 1 & 2: Owner creates employee account; record persists in PostgreSQL with assigned store."""
        self.client.force_authenticate(user=self.owner)

        payload = {
            "full_name": "Ravi Pharmacist",
            "email": "ravi.pharmacist@sushrusha.com",
            "phone_number": "+91 98765 11111",
            "role": "pharmacist",
            "store_ids": [str(self.store_main.id)],
            "password": "RaviPassword@2026",
            "confirm_password": "RaviPassword@2026",
        }
        res = self.client.post(self.team_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("created successfully", res.data["message"])

        # Verify DB state in PostgreSQL
        emp = User.objects.filter(email="ravi.pharmacist@sushrusha.com").first()
        self.assertIsNotNone(emp)
        self.assertEqual(emp.full_name, "Ravi Pharmacist")
        self.assertTrue(emp.is_active)
        self.assertTrue(emp.check_password("RaviPassword@2026"))

        # Verify StoreMembership
        sm = StoreMembership.objects.filter(store=self.store_main, user=emp).first()
        self.assertIsNotNone(sm)
        self.assertEqual(sm.role, "pharmacist")
        self.assertTrue(sm.is_active)

    def test_owner_can_view_and_edit_employee(self):
        """Test 3: Owner can view employee details and update information."""
        self.client.force_authenticate(user=self.owner)

        # Create employee
        create_res = self.client.post(
            self.team_url,
            {
                "full_name": "Anita Cashier",
                "email": "anita.cashier@sushrusha.com",
                "phone_number": "+91 98765 22222",
                "role": "cashier",
                "store_ids": [str(self.store_main.id)],
                "password": "AnitaPassword@2026",
                "confirm_password": "AnitaPassword@2026",
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        user_id = create_res.data["user"]["user_id"]

        # View details
        detail_url = reverse("org-team-member-detail", kwargs={"user_id": user_id})
        view_res = self.client.get(detail_url)
        self.assertEqual(view_res.status_code, status.HTTP_200_OK)
        self.assertEqual(view_res.data["full_name"], "Anita Cashier")
        self.assertEqual(len(view_res.data["store_assignments"]), 1)

        # Edit employee (change name, add store_east)
        patch_res = self.client.patch(
            detail_url,
            {
                "full_name": "Anita Senior Cashier",
                "phone_number": "+91 98765 33333",
                "role": "cashier",
                "store_ids": [str(self.store_main.id), str(self.store_east.id)],
            },
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["full_name"], "Anita Senior Cashier")
        self.assertEqual(len(patch_res.data["store_assignments"]), 2)

        # Verify DB updated
        anita_user = User.objects.get(id=user_id)
        self.assertEqual(anita_user.full_name, "Anita Senior Cashier")
        self.assertEqual(anita_user.phone_number, "+91 98765 33333")
        self.assertEqual(StoreMembership.objects.filter(user=anita_user).count(), 2)

    def test_owner_creates_manager_and_assigns_stores(self):
        """Test 4: Owner creates a manager account and assigns multiple stores."""
        self.client.force_authenticate(user=self.owner)

        payload = {
            "full_name": "Karan Manager",
            "email": "karan.manager@sushrusha.com",
            "phone_number": "+91 98765 44444",
            "role": "manager",
            "store_ids": [str(self.store_main.id), str(self.store_east.id)],
            "password": "KaranPassword@2026",
            "confirm_password": "KaranPassword@2026",
        }
        res = self.client.post(self.team_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        karan = User.objects.get(email="karan.manager@sushrusha.com")
        self.assertEqual(StoreMembership.objects.filter(user=karan, role="manager").count(), 2)

    def test_employee_and_manager_login_with_provided_credentials(self):
        """Test 5 & 6: Employee and Manager log in immediately with initial credentials without invitation flow."""
        self.client.force_authenticate(user=self.owner)

        # 1. Create employee & manager
        self.client.post(
            self.team_url,
            {
                "full_name": "Maya Pharmacist",
                "email": "maya.pharmacist@sushrusha.com",
                "role": "pharmacist",
                "store_ids": [str(self.store_main.id)],
                "password": "MayaPassword@2026",
                "confirm_password": "MayaPassword@2026",
            },
            format="json",
        )
        self.client.post(
            self.team_url,
            {
                "full_name": "Vijay Manager",
                "email": "vijay.manager@sushrusha.com",
                "role": "manager",
                "store_ids": [str(self.store_east.id)],
                "password": "VijayPassword@2026",
                "confirm_password": "VijayPassword@2026",
            },
            format="json",
        )

        # 2. Employee logs in directly
        client_emp = APIClient()
        emp_res = client_emp.post(
            self.login_url,
            {"email": "maya.pharmacist@sushrusha.com", "password": "MayaPassword@2026"},
            format="json",
        )
        self.assertEqual(emp_res.status_code, status.HTTP_200_OK)
        self.assertEqual(emp_res.data["user"]["email"], "maya.pharmacist@sushrusha.com")
        self.assertIn("sessionid", client_emp.cookies)

        # 3. Manager logs in directly
        client_mgr = APIClient()
        mgr_res = client_mgr.post(
            self.login_url,
            {"email": "vijay.manager@sushrusha.com", "password": "VijayPassword@2026"},
            format="json",
        )
        self.assertEqual(mgr_res.status_code, status.HTTP_200_OK)
        self.assertEqual(mgr_res.data["user"]["email"], "vijay.manager@sushrusha.com")
        self.assertIn("sessionid", client_mgr.cookies)

    def test_invalid_credentials_rejected(self):
        """Test 7: Incorrect password is rejected with 401."""
        self.client.force_authenticate(user=self.owner)
        self.client.post(
            self.team_url,
            {
                "full_name": "Test User",
                "email": "test.staff@sushrusha.com",
                "role": "staff",
                "store_ids": [str(self.store_main.id)],
                "password": "CorrectPassword@2026",
                "confirm_password": "CorrectPassword@2026",
            },
            format="json",
        )

        anon = APIClient()
        bad_login = anon.post(
            self.login_url,
            {"email": "test.staff@sushrusha.com", "password": "WrongPassword123"},
            format="json",
        )
        self.assertEqual(bad_login.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_duplicate_email_rejected_with_409(self):
        """Test 8: Creating an account with an existing email returns 409 Conflict."""
        self.client.force_authenticate(user=self.owner)

        payload = {
            "full_name": "Duplicate Test",
            "email": "duplicate@sushrusha.com",
            "role": "cashier",
            "store_ids": [str(self.store_main.id)],
            "password": "StrongPassword@2026",
            "confirm_password": "StrongPassword@2026",
        }
        res1 = self.client.post(self.team_url, payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        res2 = self.client.post(self.team_url, payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res2.data.get("code"), "email_already_exists")

    def test_employee_continues_using_initial_password(self):
        """Test 9: Employee can log in repeatedly with initial password without being forced to change it."""
        self.client.force_authenticate(user=self.owner)
        self.client.post(
            self.team_url,
            {
                "full_name": "Persistent Staff",
                "email": "persistent@sushrusha.com",
                "role": "staff",
                "store_ids": [str(self.store_main.id)],
                "password": "InitialPassword@2026",
                "confirm_password": "InitialPassword@2026",
            },
            format="json",
        )

        emp_client = APIClient()
        # Login 1
        res1 = emp_client.post(self.login_url, {"email": "persistent@sushrusha.com", "password": "InitialPassword@2026"}, format="json")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Login 2 (no force change barrier)
        res2 = emp_client.post(self.login_url, {"email": "persistent@sushrusha.com", "password": "InitialPassword@2026"}, format="json")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

    def test_voluntary_password_change_flow(self):
        """Test 10, 11, & 12: Employee voluntarily changes password; wrong current is rejected; new password works."""
        self.client.force_authenticate(user=self.owner)
        self.client.post(
            self.team_url,
            {
                "full_name": "Pw Change User",
                "email": "pwchange@sushrusha.com",
                "role": "pharmacist",
                "store_ids": [str(self.store_main.id)],
                "password": "OriginalPassword@2026",
                "confirm_password": "OriginalPassword@2026",
            },
            format="json",
        )

        emp = User.objects.get(email="pwchange@sushrusha.com")
        emp_client = APIClient()
        emp_client.force_authenticate(user=emp)

        # Test 11: Incorrect current password rejected
        bad_pw_res = emp_client.post(
            self.change_password_url,
            {
                "current_password": "WrongCurrentPassword",
                "new_password": "NewStrongPassword@2026",
                "confirm_new_password": "NewStrongPassword@2026",
            },
            format="json",
        )
        self.assertEqual(bad_pw_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", bad_pw_res.data)

        # Test 10: Valid voluntary password change succeeds
        good_pw_res = emp_client.post(
            self.change_password_url,
            {
                "current_password": "OriginalPassword@2026",
                "new_password": "NewStrongPassword@2026",
                "confirm_new_password": "NewStrongPassword@2026",
            },
            format="json",
        )
        self.assertEqual(good_pw_res.status_code, status.HTTP_200_OK)

        # Test 12: New password works; old password fails
        anon = APIClient()
        old_login = anon.post(self.login_url, {"email": "pwchange@sushrusha.com", "password": "OriginalPassword@2026"}, format="json")
        self.assertEqual(old_login.status_code, status.HTTP_401_UNAUTHORIZED)

        new_login = anon.post(self.login_url, {"email": "pwchange@sushrusha.com", "password": "NewStrongPassword@2026"}, format="json")
        self.assertEqual(new_login.status_code, status.HTTP_200_OK)

    def test_employee_and_manager_store_access_restrictions(self):
        """Test 13 & 14: Employee/Manager cannot access unassigned stores; Manager cannot grant unauthorized roles."""
        self.client.force_authenticate(user=self.owner)

        # 1. Create employee on store_main only
        self.client.post(
            self.team_url,
            {
                "full_name": "Main Store Pharmacist",
                "email": "main.pharmacist@sushrusha.com",
                "role": "pharmacist",
                "store_ids": [str(self.store_main.id)],
                "password": "Password@2026",
                "confirm_password": "Password@2026",
            },
            format="json",
        )
        emp = User.objects.get(email="main.pharmacist@sushrusha.com")

        # Employee accesses store_main -> 200 OK
        emp_client = APIClient()
        emp_client.force_authenticate(user=emp)
        res_main = emp_client.get(f"/api/organizations/stores/{self.store_main.id}/")
        self.assertEqual(res_main.status_code, status.HTTP_200_OK)

        # Employee accesses unassigned store_west -> 403 Forbidden (Test 13)
        res_west = emp_client.get(f"/api/organizations/stores/{self.store_west.id}/")
        self.assertEqual(res_west.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Create Manager on store_east only
        self.client.post(
            self.team_url,
            {
                "full_name": "East Store Manager",
                "email": "east.manager@sushrusha.com",
                "role": "manager",
                "store_ids": [str(self.store_east.id)],
                "password": "Password@2026",
                "confirm_password": "Password@2026",
            },
            format="json",
        )
        mgr = User.objects.get(email="east.manager@sushrusha.com")
        mgr_client = APIClient()
        mgr_client.force_authenticate(user=mgr)

        # Manager accesses unassigned store_west -> 403 Forbidden (Test 14)
        mgr_west = mgr_client.get(f"/api/organizations/stores/{self.store_west.id}/")
        self.assertEqual(mgr_west.status_code, status.HTTP_403_FORBIDDEN)

        # Manager attempts to create a manager (unauthorized role elevation) -> 403 Forbidden (Test 14)
        illegal_role = mgr_client.post(
            self.team_url,
            {
                "full_name": "Illegal Manager",
                "email": "illegal.mgr@sushrusha.com",
                "role": "manager",
                "store_ids": [str(self.store_east.id)],
                "password": "Password@2026",
                "confirm_password": "Password@2026",
            },
            format="json",
        )
        self.assertEqual(illegal_role.status_code, status.HTTP_403_FORBIDDEN)

        # Manager attempts to assign staff to store_west (unauthorized store) -> 403 Forbidden (Test 14)
        illegal_store = mgr_client.post(
            self.team_url,
            {
                "full_name": "Illegal Staff",
                "email": "illegal.staff@sushrusha.com",
                "role": "staff",
                "store_ids": [str(self.store_west.id)],
                "password": "Password@2026",
                "confirm_password": "Password@2026",
            },
            format="json",
        )
        self.assertEqual(illegal_store.status_code, status.HTTP_403_FORBIDDEN)

    def test_deactivating_one_store_membership_preserves_other_memberships(self):
        """Test 15: Deactivating membership in store A does not deactivate membership in store B or the user account."""
        self.client.force_authenticate(user=self.owner)

        # Create user assigned to both store_main and store_east
        self.client.post(
            self.team_url,
            {
                "full_name": "Multi Branch Staff",
                "email": "multibranch@sushrusha.com",
                "role": "pharmacist",
                "store_ids": [str(self.store_main.id), str(self.store_east.id)],
                "password": "Password@2026",
                "confirm_password": "Password@2026",
            },
            format="json",
        )

        user = User.objects.get(email="multibranch@sushrusha.com")
        m_main = StoreMembership.objects.get(store=self.store_main, user=user)
        m_east = StoreMembership.objects.get(store=self.store_east, user=user)

        # Deactivate membership on store_main
        patch_res = self.client.patch(
            f"/api/organizations/stores/{self.store_main.id}/members/{m_main.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)

        m_main.refresh_from_db()
        m_east.refresh_from_db()
        user.refresh_from_db()

        # m_main is inactive
        self.assertFalse(m_main.is_active)
        # m_east remains ACTIVE!
        self.assertTrue(m_east.is_active)
        # User account remains ACTIVE!
        self.assertTrue(user.is_active)

    def test_no_invitations_required_for_account_creation_or_login(self):
        """Test 16: Account creation and login work directly without any invitation token, link, or email."""
        self.client.force_authenticate(user=self.owner)

        res = self.client.post(
            self.team_url,
            {
                "full_name": "Direct User",
                "email": "direct.user@sushrusha.com",
                "role": "pharmacist",
                "store_ids": [str(self.store_main.id)],
                "password": "DirectPassword@2026",
                "confirm_password": "DirectPassword@2026",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # No invitation record created
        from apps.invitations.models import EmployeeInvitation
        self.assertFalse(EmployeeInvitation.objects.filter(email="direct.user@sushrusha.com").exists())

        # Directly logs in
        anon = APIClient()
        login_res = anon.post(
            self.login_url,
            {"email": "direct.user@sushrusha.com", "password": "DirectPassword@2026"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)

