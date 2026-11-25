from django.urls import path
from apps.authentication.views import (
    CsrfTokenView,
    PublicRegistrationStatusView,
    OwnerRegistrationView,
    EmailVerificationView,
    ResendVerificationView,
    LoginView,
    LogoutView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    CurrentUserView,
    ChangePasswordView,
    SwitchOrganizationView,
)

urlpatterns = [
    path("csrf/", CsrfTokenView.as_view(), name="auth-csrf"),
    path("registration-status/", PublicRegistrationStatusView.as_view(), name="auth-registration-status"),
    path("register/owner/", OwnerRegistrationView.as_view(), name="auth-register-owner"),
    path("verify-email/", EmailVerificationView.as_view(), name="auth-verify-email"),
    path("resend-verification/", ResendVerificationView.as_view(), name="auth-resend-verification"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("password-reset/request/", PasswordResetRequestView.as_view(), name="auth-password-reset-request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("switch-organization/", SwitchOrganizationView.as_view(), name="auth-switch-organization"),
    path("me/", CurrentUserView.as_view(), name="auth-me"),
]

