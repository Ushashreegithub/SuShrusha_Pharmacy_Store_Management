import uuid
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from django.urls import reverse
from django.core import mail
from django.contrib.sessions.models import Session
from rest_framework import status
from rest_framework.test import APIClient

from apps.authentication.models import (
    User,
    EmailVerificationToken,
    PasswordResetToken,
    hash_token,
)
from apps.organizations.models import (
    Organization,
    OrganizationMembership,
    Store,
    StoreMembership,
)
from apps.audit.models import AuditEvent


class AuthenticationFlowTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.register_url = reverse("auth-register-owner")
        self.verify_url = reverse("auth-verify-email")
        self.resend_url = reverse("auth-resend-verification")
        self.login_url = reverse("auth-login")
        self.logout_url = reverse("auth-logout")
        self.reset_req_url = reverse("auth-password-reset-request")
        self.reset_confirm_url = reverse("auth-password-reset-confirm")
        self.me_url = reverse("auth-me")
        self.csrf_url = reverse("auth-csrf")

        # Standard test registration payload
        self.valid_payload = {
            "fullName": "Dr. Rajesh Nayak",
            "organizationName": "Sushrusha Pharmacy Group",
            "email": "dr.rajesh@sushrusha.com",
            "phoneNumber": "+91 98765 43210",
            "password": "StrongPassword@2026",
            "confirmPassword": "StrongPassword@2026",
        }

    def test_owner_registration_success(self):
        """Owner registration must create unverified user, org, membership, token, and send console email."""
        response = self.client.post(self.register_url, self.valid_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["isEmailVerified"])
        self.assertEqual(response.data["email"], "dr.rajesh@sushrusha.com")

        # Verify DB state
        user = User.objects.get(email="dr.rajesh@sushrusha.com")
        self.assertFalse(user.is_email_verified)
        self.assertTrue(user.check_password("StrongPassword@2026"))

        org = Organization.objects.get(name="Sushrusha Pharmacy Group")
        self.assertEqual(org.owner, user)

        membership = OrganizationMembership.objects.get(organization=org, user=user)
        self.assertEqual(membership.role, "owner")

        # Verify token
        token_record = EmailVerificationToken.objects.filter(user=user).first()
        self.assertIsNotNone(token_record)
        self.assertFalse(token_record.is_used)

        # Verify outbox has 1 email
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Verify Your Sushrusha Pharmacy Account", mail.outbox[0].subject)
        self.assertIn("verify-email?token=", mail.outbox[0].body)

        # Verify audit event
        audit = AuditEvent.objects.filter(event_type="OWNER_REGISTERED", user=user).first()
        self.assertIsNotNone(audit)

    def test_owner_registration_duplicate_email(self):
        """Duplicate email registration must be rejected with 409 Conflict and email_already_registered code."""
        self.client.post(self.register_url, self.valid_payload, format="json")
        response = self.client.post(self.register_url, self.valid_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data.get("code"), "email_already_registered")
        self.assertIn("already exist", response.data.get("detail", "").lower())

    def test_owner_registration_weak_password_and_mismatch(self):
        """Weak password and mismatched confirmation must be rejected."""
        # Mismatched passwords
        payload = self.valid_payload.copy()
        payload["email"] = "other@sushrusha.com"
        payload["confirmPassword"] = "DifferentPassword@2026"
        res = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirmPassword", res.data)

        # Short password (< 8 chars)
        payload["password"] = "short"
        payload["confirmPassword"] = "short"
        res2 = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", res2.data)

    def test_owner_registration_transaction_rollback(self):
        """If organization creation fails, the user creation must be rolled back."""
        with patch.object(Organization.objects, "create", side_effect=Exception("DB Failure")):
            payload = self.valid_payload.copy()
            payload["email"] = "rollback@sushrusha.com"
            response = self.client.post(self.register_url, payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
            self.assertFalse(User.objects.filter(email="rollback@sushrusha.com").exists())

    def test_email_verification_success_and_failure(self):
        """Token verification must validate single-use, expiry, and mark user verified."""
        # 1. Register
        self.client.post(self.register_url, self.valid_payload, format="json")
        user = User.objects.get(email="dr.rajesh@sushrusha.com")
        token_record, raw_token = EmailVerificationToken.create_for_user(user)

        # 2. Test invalid token
        inv_res = self.client.post(self.verify_url, {"token": "completely_invalid_token"}, format="json")
        self.assertEqual(inv_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Test valid token
        valid_res = self.client.post(self.verify_url, {"token": raw_token}, format="json")
        self.assertEqual(valid_res.status_code, status.HTTP_200_OK)
        self.assertTrue(valid_res.data["isEmailVerified"])

        # Check user is now verified
        user.refresh_from_db()
        self.assertTrue(user.is_email_verified)

        # 4. Test already-used token
        reuse_res = self.client.post(self.verify_url, {"token": raw_token}, format="json")
        self.assertEqual(reuse_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already been used", reuse_res.data["detail"])

        # 5. Test expired token
        exp_record, exp_raw = EmailVerificationToken.create_for_user(user)
        exp_record.expires_at = timezone.now() - timedelta(minutes=10)
        exp_record.save()

        exp_res = self.client.post(self.verify_url, {"token": exp_raw}, format="json")
        self.assertEqual(exp_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", exp_res.data["detail"])

    def test_resend_verification_and_throttling(self):
        """Resend verification must dispatch new email and throttle rapid requests."""
        self.client.post(self.register_url, self.valid_payload, format="json")
        mail.outbox.clear()

        # Rapid resend within 60s should be throttled with 429
        res1 = self.client.post(self.resend_url, {"email": "dr.rajesh@sushrusha.com"}, format="json")
        self.assertEqual(res1.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # If token was created more than 60s ago, resend succeeds
        EmailVerificationToken.objects.all().update(created_at=timezone.now() - timedelta(seconds=70))
        res2 = self.client.post(self.resend_url, {"email": "dr.rajesh@sushrusha.com"}, format="json")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

        # Non-existent email returns generic 200 without leaking account presence
        res3 = self.client.post(self.resend_url, {"email": "nonexistent@sushrusha.com"}, format="json")
        self.assertEqual(res3.status_code, status.HTTP_200_OK)

    def test_login_flow(self):
        """Registered accounts authenticate and create session without email verification barrier."""
        self.client.post(self.register_url, self.valid_payload, format="json")
        user = User.objects.get(email="dr.rajesh@sushrusha.com")

        # 1. Invalid credentials
        inv_login = self.client.post(self.login_url, {"email": user.email, "password": "WrongPassword"}, format="json")
        self.assertEqual(inv_login.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Login directly after registration without manual verification must succeed
        valid_login = self.client.post(self.login_url, {"email": user.email, "password": "StrongPassword@2026"}, format="json")
        self.assertEqual(valid_login.status_code, status.HTTP_200_OK)
        self.assertEqual(valid_login.data["user"]["email"], user.email)

        # Verify session cookie was established
        self.assertIn("sessionid", self.client.cookies)

        # 3. Access protected /api/auth/me/
        me_res = self.client.get(self.me_url)
        self.assertEqual(me_res.status_code, status.HTTP_200_OK)
        self.assertEqual(me_res.data["email"], user.email)
        self.assertEqual(len(me_res.data["organizations"]), 1)
        self.assertTrue(me_res.data["organizations"][0]["is_owner"])

        # 4. Logout
        logout_res = self.client.post(self.logout_url)
        self.assertEqual(logout_res.status_code, status.HTTP_200_OK)

        # Accessing /api/auth/me/ after logout must be rejected with 403
        me_after_logout = self.client.get(self.me_url)
        self.assertEqual(me_after_logout.status_code, status.HTTP_403_FORBIDDEN)

    def test_password_reset_and_session_revocation(self):
        """Password reset must issue token, change password, and revoke all active sessions."""
        self.client.post(self.register_url, self.valid_payload, format="json")
        user = User.objects.get(email="dr.rajesh@sushrusha.com")
        user.is_email_verified = True
        user.save()

        # Log in on client A to establish a session
        client_a = APIClient()
        login_a = client_a.post(self.login_url, {"email": user.email, "password": "StrongPassword@2026"}, format="json")
        self.assertEqual(login_a.status_code, status.HTTP_200_OK)
        self.assertEqual(client_a.get(self.me_url).status_code, status.HTTP_200_OK)

        # Request password reset
        mail.outbox.clear()
        req_res = self.client.post(self.reset_req_url, {"email": user.email}, format="json")
        self.assertEqual(req_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

        # Get generated reset token
        token_record = PasswordResetToken.objects.filter(user=user).first()
        self.assertIsNotNone(token_record)

        # Generate a fresh token for confirm test
        token_inst, raw_reset_token = PasswordResetToken.create_for_user(user)

        # Confirm reset with new password
        confirm_res = self.client.post(
            self.reset_confirm_url,
            {
                "token": raw_reset_token,
                "password": "NewStrongPassword@2026",
                "confirmPassword": "NewStrongPassword@2026",
            },
            format="json",
        )
        self.assertEqual(confirm_res.status_code, status.HTTP_200_OK)

        # Client A's session must now be revoked
        self.assertEqual(client_a.get(self.me_url).status_code, status.HTTP_403_FORBIDDEN)

        # Old password must fail
        old_login = self.client.post(self.login_url, {"email": user.email, "password": "StrongPassword@2026"}, format="json")
        self.assertEqual(old_login.status_code, status.HTTP_401_UNAUTHORIZED)

        # New password must succeed
        new_login = self.client.post(self.login_url, {"email": user.email, "password": "NewStrongPassword@2026"}, format="json")
        self.assertEqual(new_login.status_code, status.HTTP_200_OK)

    def test_csrf_cookie_endpoint(self):
        """CSRF endpoint must return token and set csrftoken cookie."""
        res = self.client.get(self.csrf_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("csrfToken", res.data)
        self.assertIn("csrftoken", self.client.cookies)

    def test_store_access_by_role_and_inactive_membership(self):
        """Store permissions: Owners see all org stores; Employees see assigned; Inactive memberships are denied with 403."""
        # 1. Register Owner
        self.client.post(self.register_url, self.valid_payload, format="json")
        owner = User.objects.get(email="dr.rajesh@sushrusha.com")
        owner.is_email_verified = True
        owner.save()
        org = Organization.objects.get(owner=owner)

        # Create two stores under this organization
        store_1 = Store.objects.create(organization=org, name="Main Branch", code="STR-MAIN")
        store_2 = Store.objects.create(organization=org, name="City Branch", code="STR-CITY")

        # 2. Log in as Owner and test /api/organizations/stores/
        owner_client = APIClient()
        owner_client.force_authenticate(user=owner)
        owner_stores_res = owner_client.get("/api/organizations/stores/")
        self.assertEqual(owner_stores_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(owner_stores_res.data), 2)
        self.assertEqual(owner_stores_res.data[0]["role"], "owner")

        # 3. Create Employee with active membership on store_1 and inactive on store_2
        employee = User.objects.create_user(
            email="pharmacist@sushrusha.com",
            password="StrongPassword@2026",
            full_name="Staff Member",
            is_email_verified=True,
        )
        StoreMembership.objects.create(store=store_1, user=employee, role="pharmacist", is_active=True)
        StoreMembership.objects.create(store=store_2, user=employee, role="pharmacist", is_active=False)

        emp_client = APIClient()
        emp_client.force_authenticate(user=employee)

        # Employee listing returns both with their respective is_active flags
        emp_stores_res = emp_client.get("/api/organizations/stores/")
        self.assertEqual(emp_stores_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(emp_stores_res.data), 2)

        # 4. Detail endpoint: Active store allows access
        detail_active = emp_client.get(f"/api/organizations/stores/{store_1.id}/")
        self.assertEqual(detail_active.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_active.data["code"], "STR-MAIN")

        # 5. Detail endpoint: Inactive store DENIES access with 403 and clear message
        detail_inactive = emp_client.get(f"/api/organizations/stores/{store_2.id}/")
        self.assertEqual(detail_inactive.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("inactive", detail_inactive.data["detail"].lower())

