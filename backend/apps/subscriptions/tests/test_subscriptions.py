from decimal import Decimal
from datetime import timedelta
from django.test import TestCase, Client
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.authentication.models import User
from apps.organizations.models import (
    Organization,
    Store,
    OrganizationMembership,
    StoreMembership,
)
from apps.partners.models import Partner, PartnerMembership, PartnerDomain
from apps.subscriptions.models import OrganizationSubscription, SubscriptionPayment
from apps.subscriptions.services import (
    confirm_manual_payment,
    renew_subscription_365_days,
    get_subscription_metrics,
    is_janjeevan_partner,
)


class SubscriptionModelAndServiceTests(TestCase):
    def setUp(self):
        self.partner = Partner.objects.create(
            name="Janjivan Organisation Pvt. Ltd",
            slug="sushrusha-eclinic",
            contact_email="partner@janjeevan.local",
            is_active=True,
        )
        self.owner = User.objects.create_user(
            email="pharmacy.owner@test.com",
            full_name="Pharmacy Owner",
            password="OwnerPass@2026!",
            is_email_verified=True,
        )
        self.org = Organization.objects.create(
            name="Test Pharmacy Org",
            slug="test-pharmacy-org",
            partner=self.partner,
            owner=self.owner,
            is_active=True,
        )
        self.partner_owner_user = User.objects.create_user(
            email="partner.owner@janjeevan.local",
            full_name="Partner Owner",
            password="PartnerPass@2026!",
            is_email_verified=True,
        )

    def test_partner_identification(self):
        self.assertTrue(is_janjeevan_partner(self.partner))
        self.assertTrue(is_janjeevan_partner(str(self.partner.id)))
        self.assertTrue(is_janjeevan_partner("sushrusha-eclinic"))
        self.assertTrue(is_janjeevan_partner("34fa8868-0a34-4fe3-8d96-ea59fd178e88"))
        self.assertFalse(is_janjeevan_partner("random-other-partner"))

    def test_confirm_manual_payment_from_not_started(self):
        sub = OrganizationSubscription.objects.create(
            organization=self.org,
            partner=self.partner,
            status=OrganizationSubscription.Status.NOT_STARTED,
        )
        now = timezone.now()

        payment, updated_sub = confirm_manual_payment(
            subscription=sub,
            amount=Decimal("15000.00"),
            confirmed_by=self.partner_owner_user,
            currency="INR",
            payment_reference="TXN-MANUAL-001",
            notes="Annual subscription fee",
        )

        self.assertEqual(updated_sub.status, OrganizationSubscription.Status.ACTIVE)
        self.assertIsNotNone(updated_sub.current_period_start)
        self.assertIsNotNone(updated_sub.current_period_end)
        self.assertGreater(updated_sub.current_period_end, now + timedelta(days=364))
        self.assertEqual(payment.amount, Decimal("15000.00"))
        self.assertEqual(payment.payment_reference, "TXN-MANUAL-001")
        self.assertEqual(payment.confirmed_by, self.partner_owner_user)

    def test_confirm_manual_payment_extension_when_valid(self):
        now = timezone.now()
        initial_end = now + timedelta(days=60)
        sub = OrganizationSubscription.objects.create(
            organization=self.org,
            partner=self.partner,
            status=OrganizationSubscription.Status.ACTIVE,
            current_period_start=now - timedelta(days=305),
            current_period_end=initial_end,
        )

        payment, updated_sub = confirm_manual_payment(
            subscription=sub,
            amount=Decimal("12000.00"),
            confirmed_by=self.partner_owner_user,
            payment_reference="TXN-EXT-002",
        )

        expected_end = initial_end + timedelta(days=365)
        self.assertEqual(updated_sub.status, OrganizationSubscription.Status.ACTIVE)
        self.assertEqual(updated_sub.current_period_end, expected_end)
        self.assertEqual(payment.period_start, initial_end)
        self.assertEqual(payment.period_end, expected_end)

    def test_confirm_manual_payment_from_expired(self):
        past = timezone.now() - timedelta(days=10)
        sub = OrganizationSubscription.objects.create(
            organization=self.org,
            partner=self.partner,
            status=OrganizationSubscription.Status.EXPIRED,
            current_period_start=past - timedelta(days=365),
            current_period_end=past,
        )

        now = timezone.now()
        payment, updated_sub = confirm_manual_payment(
            subscription=sub,
            amount=Decimal("12000.00"),
            confirmed_by=self.partner_owner_user,
            payment_reference="TXN-RENEW-003",
        )

        self.assertEqual(updated_sub.status, OrganizationSubscription.Status.ACTIVE)
        self.assertGreater(updated_sub.current_period_end, now + timedelta(days=364))
        self.assertEqual(payment.period_end, updated_sub.current_period_end)

    def test_payment_append_only_and_undeletable(self):
        sub = OrganizationSubscription.objects.create(
            organization=self.org,
            partner=self.partner,
            status=OrganizationSubscription.Status.ACTIVE,
        )
        now = timezone.now()
        payment = SubscriptionPayment.objects.create(
            subscription=sub,
            amount=Decimal("5000.00"),
            confirmed_at=now,
            confirmed_by=self.partner_owner_user,
            period_start=now,
            period_end=now + timedelta(days=365),
        )

        # Updating payment must raise ValidationError
        payment.amount = Decimal("6000.00")
        with self.assertRaises(ValidationError):
            payment.save()

        # Deleting payment must raise ValidationError
        with self.assertRaises(ValidationError):
            payment.delete()

    def test_get_subscription_metrics(self):
        OrganizationSubscription.objects.create(
            organization=self.org,
            partner=self.partner,
            status=OrganizationSubscription.Status.NOT_STARTED,
        )
        metrics = get_subscription_metrics(self.partner)
        self.assertEqual(metrics["total"], 1)
        self.assertEqual(metrics["not_started"], 1)


class PartnerSubscriptionAPITests(TestCase):
    def setUp(self):
        self.client = Client()

        # 1. Janjeevan Partner + Domain
        self.partner = Partner.objects.create(
            name="Janjivan Organisation Pvt. Ltd",
            slug="sushrusha-eclinic",
            contact_email="partner@janjeevan.local",
            is_active=True,
        )
        PartnerDomain.objects.create(
            partner=self.partner,
            domain="sushrusha.localhost",
            is_verified=True,
            status="active",
        )

        # 2. Partner Owner User
        self.partner_owner = User.objects.create_user(
            email="manash@janjeevan.local",
            full_name="Manash Das",
            password="SecurePartnerPass@2026!",
            is_email_verified=True,
            is_staff=False,
            is_superuser=False,
        )
        PartnerMembership.objects.create(
            partner=self.partner,
            user=self.partner_owner,
            role="partner_owner",
            is_active=True,
        )

        # 3. Other Partner (for unauthorized testing)
        self.other_partner = Partner.objects.create(
            name="Other Regional Partner",
            slug="other-partner",
            is_active=True,
        )
        self.other_partner_owner = User.objects.create_user(
            email="other.owner@otherpartner.local",
            full_name="Other Partner Owner",
            password="OtherPass@2026!",
            is_email_verified=True,
        )
        PartnerMembership.objects.create(
            partner=self.other_partner,
            user=self.other_partner_owner,
            role="partner_owner",
            is_active=True,
        )

        # 4. Pharmacy Organization under Janjeevan
        self.pharmacy_owner = User.objects.create_user(
            email="pharmacy.owner@medicare.local",
            full_name="Dr. Anil Sharma",
            password="PharmacyPass@2026!",
            is_email_verified=True,
        )
        self.pharmacy_org = Organization.objects.create(
            name="Medicare Clinic Pharmacy",
            slug="medicare-clinic-pharmacy",
            partner=self.partner,
            owner=self.pharmacy_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.pharmacy_org,
            user=self.pharmacy_owner,
            role="owner",
            is_active=True,
        )
        self.subscription = OrganizationSubscription.objects.create(
            organization=self.pharmacy_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.NOT_STARTED,
        )

    def test_partner_owner_list_subscriptions(self):
        self.client.force_login(self.partner_owner)
        res = self.client.get(
            "/api/partner/subscriptions/",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["count"], 1)
        first = data["results"][0]
        self.assertEqual(first["organization_name"], "Medicare Clinic Pharmacy")
        self.assertEqual(first["owner_email"], "pharmacy.owner@medicare.local")
        self.assertEqual(first["status"], "not_started")

    def test_partner_owner_access_subscriptions_on_localhost(self):
        self.client.force_login(self.partner_owner)
        res = self.client.get(
            "/api/partner/subscriptions/",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["count"], 1)

    def test_partner_owner_access_subscription_metrics_on_localhost(self):
        self.client.force_login(self.partner_owner)
        res = self.client.get(
            "/api/partner/subscriptions/metrics/",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("total", data)

    def test_partner_owner_get_subscription_detail(self):
        self.client.force_login(self.partner_owner)
        res = self.client.get(
            f"/api/partner/subscriptions/{self.subscription.id}/",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], self.subscription.id)
        self.assertIn("payments", data)

    def test_partner_owner_confirm_manual_payment(self):
        self.client.force_login(self.partner_owner)
        payload = {
            "amount": "15000.00",
            "currency": "INR",
            "payment_reference": "CHQ-890123",
            "notes": "Verified manual bank transfer",
        }
        res = self.client.post(
            f"/api/partner/subscriptions/{self.subscription.id}/confirm-payment/",
            data=payload,
            content_type="application/json",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["subscription"]["status"], "active")
        self.assertEqual(data["payment"]["amount"], "15000.00")
        self.assertEqual(data["payment"]["payment_reference"], "CHQ-890123")

        # Verify DB updated
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, OrganizationSubscription.Status.ACTIVE)
        self.assertEqual(self.subscription.payments.count(), 1)

    def test_partner_owner_renew_subscription_365_days(self):
        self.client.force_login(self.partner_owner)
        payload = {
            "notes": "Annual partnership renewal approved",
            "payment_reference": "ANNUAL-REF-999",
        }
        res = self.client.post(
            f"/api/partner/subscriptions/{self.subscription.id}/renew/",
            data=payload,
            content_type="application/json",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["subscription"]["status"], "active")
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, OrganizationSubscription.Status.ACTIVE)

    def test_non_janjeevan_partner_owner_denied(self):
        self.client.force_login(self.other_partner_owner)
        # Attempt to access using sushrusha domain or otherwise
        res = self.client.get(
            "/api/partner/subscriptions/",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertIn(res.status_code, [401, 403])

    def test_pharmacy_owner_cannot_access_partner_subscription_api(self):
        self.client.force_login(self.pharmacy_owner)
        res = self.client.get(
            "/api/partner/subscriptions/",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertIn(res.status_code, [401, 403])


class TrialLifecycleAndExpiryEnforcementTests(TestCase):
    def setUp(self):
        self.client = Client()

        # Janjeevan Partner + Domain
        self.partner = Partner.objects.create(
            name="Janjivan Organisation Pvt. Ltd",
            slug="sushrusha-eclinic",
            is_active=True,
        )
        PartnerDomain.objects.create(
            partner=self.partner,
            domain="sushrusha.localhost",
            is_verified=True,
            status="active",
        )

        # Pharmacy Organization & Owner
        self.owner = User.objects.create_user(
            email="trial.owner@medicare.local",
            full_name="Trial Owner",
            password="StrongPassword@123",
            is_email_verified=True,
        )
        self.pharmacy_org = Organization.objects.create(
            name="Trial Pharmacy",
            slug="trial-pharmacy",
            partner=self.partner,
            owner=self.owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.pharmacy_org,
            user=self.owner,
            role="owner",
            is_active=True,
        )
        self.store = Store.objects.create(
            organization=self.pharmacy_org,
            name="Main Store",
            code="STR-001",
            status="active",
        )
        StoreMembership.objects.create(
            store=self.store,
            user=self.owner,
            role="manager",
            is_active=True,
        )

        # Pharmacy Employee (not owner)
        self.employee = User.objects.create_user(
            email="pharmacy.emp@medicare.local",
            full_name="Pharmacy Staff",
            password="StaffPassword@123",
            is_email_verified=True,
        )
        OrganizationMembership.objects.create(
            organization=self.pharmacy_org,
            user=self.employee,
            role="employee",
            is_active=True,
        )

    def test_owner_first_login_activates_trial(self):
        # Initial subscription is NOT_STARTED
        sub = OrganizationSubscription.objects.create(
            organization=self.pharmacy_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.NOT_STARTED,
        )

        login_res = self.client.post(
            "/api/auth/login/",
            data={
                "email": "trial.owner@medicare.local",
                "password": "StrongPassword@123",
            },
            content_type="application/json",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertEqual(login_res.status_code, 200)

        sub.refresh_from_db()
        self.assertEqual(sub.status, OrganizationSubscription.Status.TRIALING)
        self.assertIsNotNone(sub.trial_started_at)
        self.assertIsNotNone(sub.current_period_end)
        self.assertGreater(sub.current_period_end, timezone.now() + timedelta(days=364))

    def test_employee_login_does_not_activate_trial(self):
        sub = OrganizationSubscription.objects.create(
            organization=self.pharmacy_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.NOT_STARTED,
        )

        login_res = self.client.post(
            "/api/auth/login/",
            data={
                "email": "pharmacy.emp@medicare.local",
                "password": "StaffPassword@123",
            },
            content_type="application/json",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertEqual(login_res.status_code, 200)

        sub.refresh_from_db()
        self.assertEqual(sub.status, OrganizationSubscription.Status.NOT_STARTED)

    def test_expired_subscription_blocks_operational_apis(self):
        past = timezone.now() - timedelta(days=5)
        OrganizationSubscription.objects.create(
            organization=self.pharmacy_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.EXPIRED,
            current_period_start=past - timedelta(days=365),
            current_period_end=past,
        )

        # Login as owner
        self.client.post(
            "/api/auth/login/",
            data={
                "email": "trial.owner@medicare.local",
                "password": "StrongPassword@123",
            },
            content_type="application/json",
            HTTP_HOST="sushrusha.localhost:3000",
        )

        # Operational API call to stores should be blocked with 403 SUBSCRIPTION_EXPIRED
        res = self.client.get(
            "/api/organizations/stores/",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertEqual(res.status_code, 403)
        data = res.json()
        self.assertEqual(data.get("code"), "SUBSCRIPTION_EXPIRED")

        # Non-operational API (/api/auth/me/) remains accessible
        me_res = self.client.get(
            "/api/auth/me/",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertEqual(me_res.status_code, 200)

    def test_direct_pharmapro_organization_unaffected_by_subscription_check(self):
        # Direct org has no partner
        direct_owner = User.objects.create_user(
            email="direct.owner@pharmapro.local",
            full_name="Direct Owner",
            password="DirectPass@123",
            is_email_verified=True,
        )
        direct_org = Organization.objects.create(
            name="Direct PharmaPro Org",
            slug="direct-pharmapro-org",
            owner=direct_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=direct_org,
            user=direct_owner,
            role="owner",
            is_active=True,
        )
        Store.objects.create(
            organization=direct_org,
            name="Direct Store",
            code="STR-001",
            status="active",
        )

        self.client.post(
            "/api/auth/login/",
            data={
                "email": "direct.owner@pharmapro.local",
                "password": "DirectPass@123",
            },
            content_type="application/json",
            HTTP_HOST="localhost:8000",
        )

        res = self.client.get(
            "/api/organizations/stores/",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(res.status_code, 200)


class CustomerSubscriptionAPITests(TestCase):
    def setUp(self):
        self.partner = Partner.objects.create(
            name="Janjivan Organisation Pvt. Ltd",
            slug="sushrusha-eclinic",
            contact_email="support@sushrusaeclinic.com",
            contact_phone="+91-9876543210",
            website="https://sushrusaeclinic.com",
            address="Plot 42, Healthcare Park",
            city="Bhubaneswar",
            state="Odisha",
            is_active=True,
        )
        self.partner_domain = PartnerDomain.objects.create(
            partner=self.partner,
            domain="sushrusha.localhost:3000",
            is_verified=True,
            is_primary=True,
            status="active",
        )
        self.partner_owner = User.objects.create_user(
            email="partner.owner@sushrusaeclinic.com",
            full_name="Partner Owner Manash",
            password="PartnerPass@123",
            is_email_verified=True,
        )
        PartnerMembership.objects.create(
            partner=self.partner,
            user=self.partner_owner,
            role="partner_owner",
            is_active=True,
        )

        # Customer Pharmacy Org 1: Arogya Organisation Ltd
        self.arogya_owner = User.objects.create_user(
            email="owner@arogya.local",
            full_name="Arogya Owner",
            password="ArogyaPass@123",
            is_email_verified=True,
        )
        self.arogya_org = Organization.objects.create(
            name="Arogya Organisation Ltd",
            slug="arogya-organisation",
            partner=self.partner,
            owner=self.arogya_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.arogya_org,
            user=self.arogya_owner,
            role="owner",
            is_active=True,
        )

        # Customer Pharmacy Org 2: Other Pharmacy Ltd
        self.other_owner = User.objects.create_user(
            email="owner@otherpharmacy.local",
            full_name="Other Owner",
            password="OtherPass@123",
            is_email_verified=True,
        )
        self.other_org = Organization.objects.create(
            name="Other Pharmacy Ltd",
            slug="other-pharmacy",
            partner=self.partner,
            owner=self.other_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=self.other_org,
            user=self.other_owner,
            role="owner",
            is_active=True,
        )

    def _login(self, email, password, host="localhost:8000"):
        return self.client.post(
            "/api/auth/login/",
            data={"email": email, "password": password},
            content_type="application/json",
            HTTP_HOST=host,
        )

    def test_unauthenticated_request_denied(self):
        res = self.client.get(
            "/api/subscriptions/my-subscription/",
            HTTP_HOST="localhost:8000",
        )
        self.assertIn(res.status_code, (401, 403))

    def test_customer_retrieves_own_subscription_with_partner_details(self):
        now = timezone.now()
        sub = OrganizationSubscription.objects.create(
            organization=self.arogya_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.ACTIVE,
            trial_started_at=now - timedelta(days=30),
            current_period_start=now - timedelta(days=30),
            current_period_end=now + timedelta(days=335),
        )

        login_res = self._login("owner@arogya.local", "ArogyaPass@123")
        self.assertEqual(login_res.status_code, 200)

        res = self.client.get(
            "/api/subscriptions/my-subscription/",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertTrue(data["has_subscription"])
        self.assertTrue(data["is_managed_by_partner"])
        self.assertEqual(data["organization_name"], "Arogya Organisation Ltd")
        self.assertEqual(data["status"], "active")
        self.assertEqual(data["plan_name"], "Janjeevan 365-Day Partner License")
        self.assertTrue(data["is_valid"])
        self.assertFalse(data["is_expired"])
        self.assertFalse(data["is_grandfathered"])
        self.assertGreater(data["days_remaining"], 300)
        self.assertEqual(data["partner"]["partner_name"], "Janjivan Organisation Pvt. Ltd")
        self.assertEqual(data["partner"]["contact_email"], "support@sushrusaeclinic.com")
        self.assertIn("Please contact Janjeevan Organisation", data["renewal_instructions"])

    def test_customer_isolated_to_own_organization(self):
        now = timezone.now()
        sub_arogya = OrganizationSubscription.objects.create(
            organization=self.arogya_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.ACTIVE,
            current_period_start=now,
            current_period_end=now + timedelta(days=100),
        )
        sub_other = OrganizationSubscription.objects.create(
            organization=self.other_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.ACTIVE,
            current_period_start=now,
            current_period_end=now + timedelta(days=250),
        )

        # Login as other_owner
        self._login("owner@otherpharmacy.local", "OtherPass@123")
        res = self.client.get(
            "/api/subscriptions/my-subscription/",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # Must strictly see other_org data, never arogya_org
        self.assertEqual(data["organization_id"], str(self.other_org.id))
        self.assertEqual(data["organization_name"], "Other Pharmacy Ltd")
        self.assertNotEqual(data["organization_id"], str(self.arogya_org.id))

    def test_payment_history_is_strictly_scoped_and_ordered(self):
        now = timezone.now()
        sub_arogya = OrganizationSubscription.objects.create(
            organization=self.arogya_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.ACTIVE,
            current_period_start=now,
            current_period_end=now + timedelta(days=365),
        )
        sub_other = OrganizationSubscription.objects.create(
            organization=self.other_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.ACTIVE,
            current_period_start=now,
            current_period_end=now + timedelta(days=365),
        )

        # Create payment for arogya
        p_arogya_1 = SubscriptionPayment.objects.create(
            subscription=sub_arogya,
            amount=Decimal("15000.00"),
            currency="INR",
            payment_reference="AROGYA-TXN-001",
            confirmed_at=now - timedelta(days=10),
            confirmed_by=self.partner_owner,
            period_start=now - timedelta(days=10),
            period_end=now + timedelta(days=355),
            notes="First year annual license",
        )
        p_arogya_2 = SubscriptionPayment.objects.create(
            subscription=sub_arogya,
            amount=Decimal("16000.00"),
            currency="INR",
            payment_reference="AROGYA-TXN-002",
            confirmed_at=now - timedelta(days=1),
            confirmed_by=self.partner_owner,
            period_start=now - timedelta(days=1),
            period_end=now + timedelta(days=364),
            notes="Second year renewal",
        )

        # Create payment for other org
        p_other = SubscriptionPayment.objects.create(
            subscription=sub_other,
            amount=Decimal("99999.00"),
            currency="INR",
            payment_reference="OTHER-TXN-SECRET",
            confirmed_at=now,
            confirmed_by=self.partner_owner,
            period_start=now,
            period_end=now + timedelta(days=365),
        )

        self._login("owner@arogya.local", "ArogyaPass@123")
        res = self.client.get(
            "/api/subscriptions/my-subscription/",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()

        payments = data["payments"]
        self.assertEqual(len(payments), 2)
        # Ordered by -confirmed_at, so AROGYA-TXN-002 comes first
        self.assertEqual(payments[0]["payment_reference"], "AROGYA-TXN-002")
        self.assertEqual(payments[1]["payment_reference"], "AROGYA-TXN-001")
        # Other organization's payments must NEVER leak
        self.assertFalse(any(p["payment_reference"] == "OTHER-TXN-SECRET" for p in payments))

    def test_customer_cannot_modify_subscription_or_confirm_payments(self):
        self._login("owner@arogya.local", "ArogyaPass@123")

        # POST to customer endpoint is not allowed
        res = self.client.post(
            "/api/subscriptions/my-subscription/",
            data={"amount": 5000},
            content_type="application/json",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(res.status_code, 405)

        # POST to partner endpoint is blocked with 403
        sub = OrganizationSubscription.objects.create(
            organization=self.arogya_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.ACTIVE,
        )
        partner_res = self.client.post(
            f"/api/partner/subscriptions/{sub.id}/confirm-payment/",
            data={"amount": 5000},
            content_type="application/json",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(partner_res.status_code, 403)

    def test_direct_pharmapro_org_response(self):
        direct_owner = User.objects.create_user(
            email="direct2@pharmapro.local",
            full_name="Direct Owner 2",
            password="DirectPass@123",
            is_email_verified=True,
        )
        direct_org = Organization.objects.create(
            name="Standalone Direct Pharmacy",
            slug="standalone-direct-pharmacy",
            owner=direct_owner,
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=direct_org,
            user=direct_owner,
            role="owner",
            is_active=True,
        )

        self._login("direct2@pharmapro.local", "DirectPass@123")
        res = self.client.get(
            "/api/subscriptions/my-subscription/",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data["has_subscription"])
        self.assertFalse(data["is_managed_by_partner"])
        self.assertIn("direct PharmaPro platform license", data["message"])

    def test_grandfathered_subscription_response(self):
        sub = OrganizationSubscription.objects.create(
            organization=self.arogya_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.GRANDFATHERED,
        )

        self._login("owner@arogya.local", "ArogyaPass@123")
        res = self.client.get(
            "/api/subscriptions/my-subscription/",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["is_grandfathered"])
        self.assertIsNone(data["days_remaining"])
        self.assertEqual(data["status"], "grandfathered")

    def test_expired_subscription_accessible_on_my_subscription(self):
        now = timezone.now()
        sub = OrganizationSubscription.objects.create(
            organization=self.arogya_org,
            partner=self.partner,
            status=OrganizationSubscription.Status.EXPIRED,
            current_period_start=now - timedelta(days=400),
            current_period_end=now - timedelta(days=35),
        )

        self._login("owner@arogya.local", "ArogyaPass@123")

        # Operational API should be blocked with 403 SUBSCRIPTION_EXPIRED
        store_res = self.client.get(
            "/api/organizations/stores/",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(store_res.status_code, 403)
        self.assertEqual(store_res.json().get("code"), "SUBSCRIPTION_EXPIRED")

        # But my-subscription MUST remain accessible so customer can see details and contact info
        res = self.client.get(
            "/api/subscriptions/my-subscription/",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["is_expired"])
        self.assertEqual(data["days_remaining"], 0)
        self.assertEqual(data["effective_status"], "expired")
        self.assertIn("support@sushrusaeclinic.com", data["partner"]["contact_email"])

    def test_partner_owner_cannot_access_customer_my_subscription(self):
        self._login("partner.owner@sushrusaeclinic.com", "PartnerPass@123", host="sushrusha.localhost:3000")
        res = self.client.get(
            "/api/subscriptions/my-subscription/",
            HTTP_HOST="sushrusha.localhost:3000",
        )
        self.assertEqual(res.status_code, 403)

