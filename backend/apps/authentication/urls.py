from django.urls import path
from apps.authentication.views import (
    CsrfTokenView,
    OwnerRegistrationView,
    EmailVerificationView,
    ResendVerificationView,
    LoginView,
    LogoutView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    CurrentUserView,
    ChangePasswordView,
)

urlpatterns = [
    path("csrf/", CsrfTokenView.as_view(), name="auth-csrf"),
    path("register/owner/", OwnerRegistrationView.as_view(), name="auth-register-owner"),
    path("verify-email/", EmailVerificationView.as_view(), name="auth-verify-email"),
    path("resend-verification/", ResendVerificationView.as_view(), name="auth-resend-verification"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("password-reset/request/", PasswordResetRequestView.as_view(), name="auth-password-reset-request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("me/", CurrentUserView.as_view(), name="auth-me"),
]

