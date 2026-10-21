import logging
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


class EmailService:
    """
    Reusable, environment-driven email service layer for Sushrusha Pharmacy.
    Works transparently with Django's console email backend in development
    and genuine SMTP providers in production.
    """

    @classmethod
    def get_frontend_url(cls) -> str:
        return getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")

    @classmethod
    def get_from_email(cls) -> str:
        return getattr(
            settings,
            "DEFAULT_FROM_EMAIL",
            "Sushrusha Pharmacy <no-reply@sushrusha.local>",
        )

    @classmethod
    def send_verification_email(cls, user, raw_token: str) -> bool:
        """
        Dispatches email verification token.
        In local development with console backend, prints the full clickable link in terminal.
        """
        frontend_url = cls.get_frontend_url()
        verify_url = f"{frontend_url}/verify-email?token={raw_token}&email={user.email}"

        subject = "Verify Your Sushrusha Pharmacy Account"
        message = (
            f"Hello {user.full_name},\n\n"
            f"Thank you for registering your pharmacy business on the Sushrusha Pharmacy Store Management System.\n\n"
            f"Please verify your corporate email address by clicking the link below:\n\n"
            f"  {verify_url}\n\n"
            f"This link is valid for 24 hours and can only be used once.\n\n"
            f"If you did not register for this account, please disregard this email.\n\n"
            f"— The Sushrusha Pharmacy Team"
        )

        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=cls.get_from_email(),
                recipient_list=[user.email],
                fail_silently=False,
            )
            # Log local development guidance for clarity
            if "console" in getattr(settings, "EMAIL_BACKEND", "").lower():
                print("\n" + "=" * 80)
                print("[LOCAL DEV CONSOLE EMAIL — EMAIL VERIFICATION]")
                print(f"Recipient: {user.email} ({user.full_name})")
                print(f"Direct Verification URL: {verify_url}")
                print("=" * 80 + "\n")
            return True
        except Exception as e:
            logger.error(f"Failed to dispatch verification email to {user.email}: {e}")
            return False

    @classmethod
    def send_password_reset_email(cls, user, raw_token: str) -> bool:
        """
        Dispatches password reset token.
        In local development with console backend, prints the full clickable link in terminal.
        """
        frontend_url = cls.get_frontend_url()
        reset_url = f"{frontend_url}/reset-password?token={raw_token}"

        subject = "Reset Your Sushrusha Pharmacy Password"
        message = (
            f"Hello {user.full_name},\n\n"
            f"We received a request to reset the password for your Sushrusha Pharmacy account ({user.email}).\n\n"
            f"Click the link below to set a new password:\n\n"
            f"  {reset_url}\n\n"
            f"This link expires in 2 hours and can only be used once.\n"
            f"For your security, existing active sessions will be terminated upon password change.\n\n"
            f"If you did not request this password reset, please ignore this email.\n\n"
            f"— The Sushrusha Pharmacy Team"
        )

        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=cls.get_from_email(),
                recipient_list=[user.email],
                fail_silently=False,
            )
            if "console" in getattr(settings, "EMAIL_BACKEND", "").lower():
                print("\n" + "=" * 80)
                print("[LOCAL DEV CONSOLE EMAIL — PASSWORD RESET]")
                print(f"Recipient: {user.email}")
                print(f"Direct Password Reset URL: {reset_url}")
                print("=" * 80 + "\n")
            return True
        except Exception as e:
            logger.error(f"Failed to dispatch password reset email to {user.email}: {e}")
            return False

    @classmethod
    def send_invitation_email(cls, invitation, raw_token: str) -> bool:
        """
        Dispatches staff/manager onboarding invitation.
        """
        frontend_url = cls.get_frontend_url()
        invite_url = f"{frontend_url}/invite-setup?token={raw_token}"

        store_name = invitation.store.name
        org_name = invitation.organization.name
        role_label = dict(invitation.ROLE_CHOICES).get(invitation.role, invitation.role)

        subject = f"You are invited to join {store_name} ({org_name})"
        message = (
            f"Hello,\n\n"
            f"You have been invited to join {store_name} at {org_name} as a {role_label}.\n\n"
            f"Accept your invitation and configure your account password using this link:\n\n"
            f"  {invite_url}\n\n"
            f"This invitation link expires in 24 hours.\n\n"
            f"— The Sushrusha Pharmacy Team"
        )

        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=cls.get_from_email(),
                recipient_list=[invitation.email],
                fail_silently=False,
            )
            if "console" in getattr(settings, "EMAIL_BACKEND", "").lower():
                print("\n" + "=" * 80)
                print("[LOCAL DEV CONSOLE EMAIL — EMPLOYEE INVITATION]")
                print(f"Recipient: {invitation.email}")
                print(f"Role: {role_label} at {store_name}")
                print(f"Direct Invitation Setup URL: {invite_url}")
                print("=" * 80 + "\n")
            return True
        except Exception as e:
            logger.error(f"Failed to dispatch invitation email to {invitation.email}: {e}")
            return False

