from datetime import timedelta
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from django.core import mail
from rest_framework import status
from rest_framework.test import APIClient

from apps.authentication.models import User
from apps.organizations.models import Organization, OrganizationMembership, Store, StoreMembership
from apps.invitations.models import EmployeeInvitation
from apps.audit.models import AuditEvent


class InvitationsTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create Owner & Organization
        self.owner = User.objects.create_user(
            email="owner@sushrusha.com",
            password="StrongPassword@2026",
            full_name="Dr. Rajesh Owner",
            is_email_verified=True,
        )
        self.org = Organization.objects.create(name="Sushrusha Pharmacy Group", owner=self.owner)
        OrganizationMembership.objects.create(organization=self.org, user=self.owner, role="owner", is_active=True)

        self.store = Store.objects.create(organization=self.org, name="City Pharmacy", code="CTY-01")

        # Manager user
        self.manager_user = User.objects.create_user(
            email="manager@sushrusha.com",
            password="StrongPassword@2026",
            full_name="Branch Manager",
            is_email_verified=True,
        )
        StoreMembership.objects.create(store=self.store, user=self.manager_user, role="manager", is_active=True)

        self.invites_url = reverse("invitation-list-create")
        self.verify_url = reverse("invitation-verify")
        self.accept_url = reverse("invitation-accept")

    def test_owner_create_invitation_flow(self):
        """Owner invites pharmacist: token generated, email sent, audit event logged."""
        mail.outbox.clear()
        self.client.force_authenticate(user=self.owner)

        payload = {
            "email": "new.pharmacist@sushrusha.com",
            "store_id": str(self.store.id),
            "role": "pharmacist",
        }
        res = self.client.post(self.invites_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["email"], "new.pharmacist@sushrusha.com")
        self.assertEqual(res.data["status"], "pending")

        # Verify email dispatched
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("invite-setup?token=", mail.outbox[0].body)

        # Verify audit event
        audit = AuditEvent.objects.filter(event_type="INVITATION_CREATED").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.details.get("recipient_email"), "new.pharmacist@sushrusha.com")

    def test_manager_cannot_invite_owner(self):
        """Manager cannot invite anyone with owner or admin role."""
        self.client.force_authenticate(user=self.manager_user)
        payload = {
            "email": "another.owner@sushrusha.com",
            "store_id": str(self.store.id),
            "role": "owner",
        }
        res = self.client.post(self.invites_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verify_and_accept_invitation(self):
        """Verify token and accept invitation: user created, password set, StoreMembership created."""
        invitation, raw_token = EmployeeInvitation.create_invitation(
            organization=self.org,
            store=self.store,
            invited_by=self.owner,
            email="onboarding.staff@sushrusha.com",
            role="cashier",
        )

        # 1. Verify token
        res_verify = self.client.get(f"{self.verify_url}?token={raw_token}")
        self.assertEqual(res_verify.status_code, status.HTTP_200_OK)
        self.assertEqual(res_verify.data["status"], "valid")
        self.assertEqual(res_verify.data["role"], "cashier")

        # 2. Accept token
        accept_payload = {
            "token": raw_token,
            "fullName": "New Cashier Person",
            "password": "StrongPassword@2026",
            "confirmPassword": "StrongPassword@2026",
        }
        res_accept = self.client.post(self.accept_url, accept_payload, format="json")
        self.assertEqual(res_accept.status_code, status.HTTP_200_OK)

        # Verify user account
        user = User.objects.get(email="onboarding.staff@sushrusha.com")
        self.assertTrue(user.is_email_verified)
        self.assertTrue(user.check_password("StrongPassword@2026"))

        # Verify StoreMembership
        membership = StoreMembership.objects.filter(store=self.store, user=user).first()
        self.assertIsNotNone(membership)
        self.assertEqual(membership.role, "cashier")
        self.assertTrue(membership.is_active)

        # Verify invitation status is now accepted
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, "accepted")

        # 3. Re-using same token must be rejected
        res_reuse = self.client.get(f"{self.verify_url}?token={raw_token}")
        self.assertEqual(res_reuse.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_reuse.data["status"], "used")

    def test_resend_and_revoke_invitation(self):
        """Resending generates fresh token; revoking marks status as revoked."""
        invitation, raw_token = EmployeeInvitation.create_invitation(
            organization=self.org,
            store=self.store,
            invited_by=self.owner,
            email="resend.test@sushrusha.com",
            role="pharmacist",
        )

        self.client.force_authenticate(user=self.owner)

        # Resend
        resend_url = reverse("invitation-resend", kwargs={"invitation_id": invitation.id})
        res_resend = self.client.post(resend_url)
        self.assertEqual(res_resend.status_code, status.HTTP_200_OK)

        # Revoke
        revoke_url = reverse("invitation-revoke", kwargs={"invitation_id": invitation.id})
        res_revoke = self.client.post(revoke_url)
        self.assertEqual(res_revoke.status_code, status.HTTP_200_OK)
        self.assertEqual(res_revoke.data["status"], "revoked")

        invitation.refresh_from_db()
        self.assertEqual(invitation.status, "revoked")

