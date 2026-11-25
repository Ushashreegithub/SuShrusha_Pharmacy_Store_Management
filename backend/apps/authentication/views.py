from datetime import timedelta
from django.db import transaction, IntegrityError
from django.utils import timezone
from django.contrib.auth import login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.sessions.models import Session
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from apps.authentication.models import (
    User,
    EmailVerificationToken,
    PasswordResetToken,
    hash_token,
)
from apps.organizations.models import Organization, OrganizationMembership, StoreMembership
from apps.subscriptions.models import OrganizationSubscription
from apps.subscriptions.services import is_janjeevan_partner
from apps.organizations.domain_routing import normalize_host
from apps.partners.models import PartnerMembership
from apps.audit.models import AuditEvent
from apps.platform.models import PlatformSettings
from apps.authentication.services.email_service import EmailService
from apps.authentication.serializers import (
    OwnerRegistrationSerializer,
    EmailVerificationSerializer,
    ResendVerificationSerializer,
    LoginSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    UserProfileSerializer,
    ChangePasswordSerializer,
    SwitchOrganizationSerializer,
)


class CsrfTokenView(APIView):
    """
    Supplies the CSRF cookie for cross-origin or local frontend state-changing requests.
    """
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class PublicRegistrationStatusView(APIView):
    """
    Lightweight public read-only check indicating whether self-service pharmacy registration is open.
    Never exposes user or platform administrative details.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        platform_settings = PlatformSettings.get_settings()
        return Response(
            {"public_registration_enabled": bool(platform_settings.public_registration_enabled)},
            status=status.HTTP_200_OK,
        )


class OwnerRegistrationView(APIView):
    """
    Public registration endpoint strictly for Pharmacy Owners.
    Creates an unverified Owner account and business organization in an atomic transaction.
    Dispatches a real single-use verification token via EmailService.
    Enforces persistent platform-wide public_registration_enabled flag.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        platform_settings = PlatformSettings.get_settings()
        if not platform_settings.public_registration_enabled:
            AuditEvent.log_event(
                event_type="AUTH_REGISTRATION_BLOCKED",
                request=request,
                details={
                    "attempted_email": request.data.get("email", "").strip().lower(),
                    "reason": "Public pharmacy registration is currently disabled by Platform Owner.",
                },
            )
            return Response(
                {
                    "code": "registration_disabled",
                    "detail": "Public pharmacy registration is currently disabled by the platform administrator.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = OwnerRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            email_errors = serializer.errors.get("email", [])
            is_duplicate = any(
                "already exist" in str(e).lower() for e in email_errors
            )
            if is_duplicate:
                return Response(
                    {
                        "code": "email_already_registered",
                        "detail": "An account with this email may already exist. Please sign in or reset your password if needed.",
                        "email": request.data.get("email", "").strip().lower(),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        normalized_email = data["email"].strip().lower()

        try:
            with transaction.atomic():
                # Race-condition safeguard: verify inside transaction
                if User.objects.filter(email=normalized_email).exists():
                    return Response(
                        {
                            "code": "email_already_registered",
                            "detail": "An account with this email may already exist. Please sign in or reset your password if needed.",
                            "email": normalized_email,
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

                # 1. Create owner user (strictly unverified)
                user = User.objects.create_user(
                    email=normalized_email,
                    password=data["password"],
                    full_name=data["fullName"],
                    phone_number=data.get("phoneNumber", ""),
                    is_email_verified=False,
                )

                # 2. Create primary pharmacy organization
                organization = Organization.objects.create(
                    name=data["organizationName"],
                    owner=user,
                )

                # 3. Create owner organization membership
                OrganizationMembership.objects.create(
                    organization=organization,
                    user=user,
                    role="owner",
                    is_active=True,
                )

                # 4. Generate cryptographically secure verification token
                token_instance, raw_token = EmailVerificationToken.create_for_user(user)

                # 5. Log audit event
                AuditEvent.log_event(
                    event_type="OWNER_REGISTERED",
                    request=request,
                    user=user,
                    organization=organization,
                    details={"organization_name": organization.name},
                )

            # 6. Send verification email outside transaction (non-blocking)
            try:
                email_sent = EmailService.send_verification_email(user, raw_token)
            except Exception:
                email_sent = False

            response_data = {
                "message": "Owner account registered successfully. You can now sign in to your dashboard.",
                "email": user.email,
                "organizationName": organization.name,
                "isEmailVerified": False,
                "emailDispatched": email_sent,
            }
            if not email_sent:
                response_data["emailWarning"] = (
                    "Could not deliver verification email to your inbox. Check terminal logs or resend later."
                )

            return Response(response_data, status=status.HTTP_201_CREATED)

        except IntegrityError:
            return Response(
                {
                    "code": "email_already_registered",
                    "detail": "An account with this email may already exist. Please sign in or reset your password if needed.",
                    "email": normalized_email,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except Exception as e:
            return Response(
                {"detail": f"Registration failed due to an internal error: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class EmailVerificationView(APIView):
    """
    Validates single-use token against database and marks email verified.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = EmailVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        raw_token = serializer.validated_data["token"]
        token_hash = hash_token(raw_token)

        token_record = (
            EmailVerificationToken.objects.filter(token_hash=token_hash)
            .select_related("user")
            .first()
        )

        if not token_record:
            return Response(
                {"detail": "Invalid verification token. Please verify the link or request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if token_record.is_used:
            return Response(
                {"detail": "This verification link has already been used. Please sign in with your credentials."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.now() >= token_record.expires_at:
            return Response(
                {"detail": "This verification link has expired. Please request a new verification link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark token used & verify user
        with transaction.atomic():
            token_record.is_used = True
            token_record.used_at = timezone.now()
            token_record.save(update_fields=["is_used", "used_at"])

            user = token_record.user
            user.is_email_verified = True
            user.save(update_fields=["is_email_verified"])

            AuditEvent.log_event(
                event_type="EMAIL_VERIFIED",
                request=request,
                user=user,
                details={"verified_at": str(timezone.now())},
            )

        return Response(
            {
                "message": "Email verified successfully. Your account is now active.",
                "email": user.email,
                "isEmailVerified": True,
            },
            status=status.HTTP_200_OK,
        )


class ResendVerificationView(APIView):
    """
    Resends verification email to an unverified account.
    Returns generic message to prevent account enumeration.
    Enforces a 60-second cooldown per account.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        user = User.objects.filter(email=email).first()

        # Non-enumerating standard message
        success_message = "If an unverified account exists for that email, a verification link has been dispatched."

        if not user or user.is_email_verified or not user.is_active:
            return Response({"message": success_message}, status=status.HTTP_200_OK)

        # Check rate limit (60s cooldown from most recent active token)
        recent_token = (
            EmailVerificationToken.objects.filter(
                user=user,
                created_at__gte=timezone.now() - timedelta(seconds=60),
            )
            .order_by("-created_at")
            .first()
        )

        if recent_token:
            return Response(
                {"detail": "Please wait a moment before requesting another verification email."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        token_instance, raw_token = EmailVerificationToken.create_for_user(user)
        EmailService.send_verification_email(user, raw_token)

        AuditEvent.log_event(
            event_type="RESEND_VERIFICATION",
            request=request,
            user=user,
        )

        return Response({"message": success_message}, status=status.HTTP_200_OK)


class LoginView(APIView):
    """
    Authenticates user credentials against PostgreSQL database.
    Establishes secure, HttpOnly session cookie.
    Email verification is no longer mandatory to access the system.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        remember_me = serializer.validated_data.get("rememberMe", False)

        user = User.objects.filter(email=email).first()

        # Non-enumerating credential rejection
        if not user or not user.check_password(password) or not user.is_active:
            AuditEvent.log_event(
                event_type="AUTH_LOGIN_FAILED",
                request=request,
                details={"attempted_email": email},
            )
            return Response(
                {"detail": "Invalid email or password. Please verify your credentials and try again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Domain-bound authentication gate for dedicated client portals
        domain_category = getattr(request, "domain_category", None)
        bound_org = getattr(request, "bound_organization", None)
        bound_partner = getattr(request, "bound_partner", None)

        chosen_partner_for_session = None
        chosen_org_for_session = None

        if domain_category == "client" and bound_org:
            has_org = OrganizationMembership.objects.filter(
                organization=bound_org, user=user, is_active=True
            ).exists()
            has_store = StoreMembership.objects.filter(
                store__organization=bound_org, user=user, is_active=True
            ).exists()
            if not (has_org or has_store):
                AuditEvent.log_event(
                    event_type="AUTH_CROSS_TENANT_REJECTED",
                    request=request,
                    user=user,
                    organization=bound_org,
                    details={"attempted_email": email, "bound_domain": request.get_host()},
                )
                return Response(
                    {"detail": "Invalid email or password. Please verify your credentials and try again."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            chosen_org_for_session = bound_org

        elif domain_category == "partner" and bound_partner:
            # Platform superusers do not use partner portals for platform access
            if user.is_staff and user.is_superuser:
                AuditEvent.log_event(
                    event_type="AUTH_CROSS_TENANT_REJECTED",
                    request=request,
                    user=user,
                    details={"attempted_email": email, "bound_domain": request.get_host(), "reason": "platform_superuser_on_partner_domain"},
                )
                return Response(
                    {"detail": "Invalid email or password. Please verify your credentials and try again."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

            is_partner_owner = PartnerMembership.objects.filter(
                partner=bound_partner, user=user, is_active=True
            ).exists()
            if is_partner_owner:
                chosen_partner_for_session = bound_partner
            else:
                active_org_mem = (
                    OrganizationMembership.objects.filter(
                        organization__partner=bound_partner,
                        organization__is_active=True,
                        user=user,
                        is_active=True,
                    )
                    .select_related("organization")
                    .order_by("created_at")
                    .first()
                )
                active_store_mem = (
                    StoreMembership.objects.filter(
                        store__organization__partner=bound_partner,
                        store__organization__is_active=True,
                        user=user,
                        is_active=True,
                    )
                    .select_related("store__organization")
                    .order_by("created_at")
                    .first()
                )

                if active_org_mem:
                    chosen_org_for_session = active_org_mem.organization
                elif active_store_mem:
                    chosen_org_for_session = active_store_mem.store.organization
                else:
                    # Check if user belongs to a suspended/deactivated org under this partner
                    has_suspended_org = (
                        OrganizationMembership.objects.filter(
                            organization__partner=bound_partner,
                            organization__is_active=False,
                            user=user,
                        ).exists()
                        or StoreMembership.objects.filter(
                            store__organization__partner=bound_partner,
                            store__organization__is_active=False,
                            user=user,
                        ).exists()
                    )
                    if has_suspended_org:
                        AuditEvent.log_event(
                            event_type="AUTH_SUSPENDED_ORG_LOGIN_BLOCKED",
                            request=request,
                            user=user,
                            details={"attempted_email": email, "bound_domain": request.get_host()},
                        )
                        return Response(
                            {"detail": "This pharmacy organization has been deactivated or suspended. Please contact Sushrusha support."},
                            status=status.HTTP_403_FORBIDDEN,
                        )

                    AuditEvent.log_event(
                        event_type="AUTH_CROSS_TENANT_REJECTED",
                        request=request,
                        user=user,
                        details={"attempted_email": email, "bound_domain": request.get_host()},
                    )
                    return Response(
                        {"detail": "Invalid email or password. Please verify your credentials and try again."},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )

        elif domain_category == "platform":
            norm_host = normalize_host(request.get_host())
            partner_mem = PartnerMembership.objects.filter(
                user=user, is_active=True, partner__is_active=True
            ).select_related("partner").first()

            if partner_mem and not (user.is_staff and user.is_superuser):
                # Production platform domain (pharmapro.diracai.com): reject partner owners
                if norm_host == "pharmapro.diracai.com":
                    AuditEvent.log_event(
                        event_type="AUTH_CROSS_TENANT_REJECTED",
                        request=request,
                        user=user,
                        details={"attempted_email": email, "bound_domain": request.get_host(), "reason": "partner_owner_on_production_platform_domain"},
                    )
                    return Response(
                        {"detail": "Partner administrators must sign in through their dedicated partner portal."},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )
                # Local development preview (localhost / 127.0.0.1): bind partner for session
                chosen_partner_for_session = partner_mem.partner

        # Establish server-side session and rotate session key
        login(request, user)
        request.session.cycle_key()

        # Pin active partner/organization context in session
        if chosen_partner_for_session:
            request.session.pop("active_organization_id", None)
            request.session["active_partner_id"] = str(chosen_partner_for_session.id)
            request.session["bound_domain"] = normalize_host(request.get_host())
            request.active_partner = chosen_partner_for_session
            request.active_organization = None
        elif chosen_org_for_session:
            request.session.pop("active_partner_id", None)
            request.session["active_organization_id"] = str(chosen_org_for_session.id)
            request.session["bound_domain"] = normalize_host(request.get_host())
            request.active_organization = chosen_org_for_session
            request.active_partner = None

        # Start the Janjeevan pharmacy trial only when its own owner logs in.
        # Partner owners, managers, and pharmacy staff must not start the trial.
        if (
            chosen_org_for_session
            and is_janjeevan_partner(chosen_org_for_session.partner_id)
            and chosen_org_for_session.owner_id == user.id
            and OrganizationMembership.objects.filter(
                organization=chosen_org_for_session,
                user=user,
                role="owner",
                is_active=True,
            ).exists()
        ):
            with transaction.atomic():
                subscription, _ = (
                    OrganizationSubscription.objects.select_for_update().get_or_create(
                        organization=chosen_org_for_session,
                        defaults={
                            "partner_id": chosen_org_for_session.partner_id,
                            "status": OrganizationSubscription.Status.NOT_STARTED,
                        },
                    )
                )

                if subscription.status == OrganizationSubscription.Status.NOT_STARTED:
                    trial_start = timezone.now()
                    subscription.status = OrganizationSubscription.Status.TRIALING
                    subscription.trial_started_at = trial_start
                    subscription.current_period_start = trial_start
                    subscription.current_period_end = trial_start + timedelta(days=365)
                    subscription.save(
                        update_fields=[
                            "status",
                            "trial_started_at",
                            "current_period_start",
                            "current_period_end",
                            "updated_at",
                        ]
                    )
                    AuditEvent.objects.create(
                        event_type="SUBSCRIPTION_TRIAL_STARTED",
                        user=user,
                        organization=chosen_org_for_session,
                        details={
                            "partner_id": str(chosen_org_for_session.partner_id),
                            "subscription_id": subscription.id,
                            "trial_started_at": trial_start.isoformat(),
                            "current_period_end": subscription.current_period_end.isoformat(),
                            "action": "owner_first_login_trial_activation",
                        },
                    )

        if remember_me:
            request.session.set_expiry(60 * 60 * 24 * 14)  # 14 days
        else:
            request.session.set_expiry(0)  # Browser session close

        AuditEvent.log_event(
            event_type="AUTH_LOGIN_SUCCESS",
            request=request,
            user=user,
            organization=chosen_org_for_session,
        )

        return Response(
            {
                "message": "Signed in successfully.",
                "must_change_password": bool(getattr(user, "must_change_password", False)),
                "user": UserProfileSerializer(user, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """
    Terminates the authenticated session and clears session cookies.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        if request.user.is_authenticated:
            AuditEvent.log_event(
                event_type="AUTH_LOGOUT",
                request=request,
                user=request.user,
            )

        logout(request)
        return Response({"message": "Signed out successfully."}, status=status.HTTP_200_OK)


class PasswordResetRequestView(APIView):
    """
    Initiates password recovery with a single-use secure token.
    Uses non-enumerating responses to avoid user discovery.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        user = User.objects.filter(email=email, is_active=True).first()

        standard_response = {
            "message": "If an account matching that email address exists, a password reset link has been dispatched."
        }

        if not user:
            return Response(standard_response, status=status.HTTP_200_OK)

        # Enforce rate-limit: 1 reset request per 60s
        recent_token = (
            PasswordResetToken.objects.filter(
                user=user,
                created_at__gte=timezone.now() - timedelta(seconds=60),
            )
            .order_by("-created_at")
            .first()
        )

        if recent_token:
            return Response(
                {"detail": "Please wait a moment before requesting another password reset email."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        token_instance, raw_token = PasswordResetToken.create_for_user(user)
        EmailService.send_password_reset_email(user, raw_token)

        AuditEvent.log_event(
            event_type="PASSWORD_RESET_REQUESTED",
            request=request,
            user=user,
        )

        return Response(standard_response, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """
    Validates reset token, updates password, and revokes all existing sessions across devices.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        raw_token = serializer.validated_data["token"]
        new_password = serializer.validated_data["password"]
        token_hash = hash_token(raw_token)

        token_record = (
            PasswordResetToken.objects.filter(token_hash=token_hash)
            .select_related("user")
            .first()
        )

        if not token_record:
            return Response(
                {"detail": "Invalid password reset token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if token_record.is_used:
            return Response(
                {"detail": "This password reset token has already been used."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.now() >= token_record.expires_at:
            return Response(
                {"detail": "This password reset token has expired. Please request a new link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = token_record.user

        with transaction.atomic():
            # Mark token used
            token_record.is_used = True
            token_record.used_at = timezone.now()
            token_record.save(update_fields=["is_used", "used_at"])

            # Set new password
            user.set_password(new_password)
            user.save(update_fields=["password"])

            # Invalidate all active sessions for this user across all devices
            user_id_str = str(user.id)
            for session in Session.objects.filter(expire_date__gte=timezone.now()):
                data = session.get_decoded()
                if str(data.get("_auth_user_id")) == user_id_str:
                    session.delete()

            AuditEvent.log_event(
                event_type="PASSWORD_RESET_COMPLETED",
                request=request,
                user=user,
                details={"revoked_sessions": True},
            )

        return Response(
            {"message": "Password has been reset successfully. Please sign in with your new password."},
            status=status.HTTP_200_OK,
        )


class CurrentUserView(APIView):
    """
    Returns the authenticated user's profile and active organization/store memberships.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    """
    Allows authenticated users (Owners, Managers, Employees) to voluntarily change their password.
    Validates current password and enforces Django password validation on the new password.
    Updates the session authentication hash so the current session remains authenticated.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        current_password = serializer.validated_data["current_password"]
        new_password = serializer.validated_data["new_password"]

        if not user.check_password(current_password):
            return Response(
                {"current_password": ["Current password is incorrect."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if current_password == new_password:
            return Response(
                {"new_password": ["New password cannot be the same as your current password."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as e:
            return Response(
                {"new_password": list(e.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            user.set_password(new_password)
            user.must_change_password = False
            user.save(update_fields=["password", "must_change_password", "updated_at"])

            # Rotate session auth hash so current session remains valid
            update_session_auth_hash(request, user)

            AuditEvent.log_event(
                event_type="AUTH_PASSWORD_CHANGED",
                request=request,
                user=user,
                details={"action": "User voluntarily changed account password"},
            )

        return Response(
            {"message": "Password updated successfully."},
            status=status.HTTP_200_OK,
        )


class SwitchOrganizationView(APIView):
    """
    Allows an authenticated customer pharmacy user who holds active memberships
    in multiple active organizations (under the current partner/platform context)
    to switch their session's authoritative active_organization_id.
    Partner Owners cannot switch into customer operational organizations.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if getattr(request, "active_partner", None):
            return Response(
                {"detail": "Partner administrators cannot switch into customer pharmacy operations."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SwitchOrganizationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        org_id = serializer.validated_data["organization_id"]
        qs = Organization.objects.filter(id=org_id, is_active=True)
        if getattr(request, "domain_category", None) == "partner" and getattr(request, "bound_partner", None):
            qs = qs.filter(partner=request.bound_partner)
        elif getattr(request, "domain_category", None) == "client" and getattr(request, "bound_organization", None):
            qs = qs.filter(id=request.bound_organization.id)

        target_org = qs.first()
        if not target_org:
            return Response(
                {"detail": "Target pharmacy organization was not found or is inactive."},
                status=status.HTTP_404_NOT_FOUND,
            )

        has_access = (
            OrganizationMembership.objects.filter(
                organization=target_org, user=request.user, is_active=True
            ).exists()
            or StoreMembership.objects.filter(
                store__organization=target_org, user=request.user, is_active=True
            ).exists()
        )
        if not has_access:
            return Response(
                {"detail": "You do not hold an active membership in this organization."},
                status=status.HTTP_403_FORBIDDEN,
            )

        request.session["active_organization_id"] = str(target_org.id)
        request.active_organization = target_org

        return Response(
            {
                "message": f"Switched workspace to {target_org.name}.",
                "user": UserProfileSerializer(request.user, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )

