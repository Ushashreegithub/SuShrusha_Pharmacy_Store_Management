from django.urls import path
from apps.platform.views import (
    PlatformOverviewView,
    PlatformOrganizationListView,
    PlatformOrganizationDetailView,
    PlatformOrganizationStatusView,
    PlatformUserListView,
    PlatformUserDetailView,
    PlatformUserStatusView,
    PlatformUserTemporaryPasswordView,
    PlatformUserRevokeSessionsView,
    PlatformDomainListCreateView,
    PlatformDomainDetailView,
    PlatformDomainVerifyView,
    PlatformDomainStatusView,
    PlatformLoginActivityView,
    PlatformAuditView,
    PlatformHostInfoView,
    PlatformRegistrationSettingsView,
)

urlpatterns = [
    # Host info & Registration settings
    path("host-info/", PlatformHostInfoView.as_view(), name="platform-host-info"),
    path("registration-settings/", PlatformRegistrationSettingsView.as_view(), name="platform-registration-settings"),

    # Overview
    path("overview/", PlatformOverviewView.as_view(), name="platform-overview"),

    # Organizations
    path("organizations/", PlatformOrganizationListView.as_view(), name="platform-orgs-list"),
    path("organizations/<uuid:org_id>/", PlatformOrganizationDetailView.as_view(), name="platform-orgs-detail"),
    path("organizations/<uuid:org_id>/status/", PlatformOrganizationStatusView.as_view(), name="platform-orgs-status"),

    # Users
    path("users/", PlatformUserListView.as_view(), name="platform-users-list"),
    path("users/<uuid:user_id>/", PlatformUserDetailView.as_view(), name="platform-users-detail"),
    path("users/<uuid:user_id>/status/", PlatformUserStatusView.as_view(), name="platform-users-status"),
    path("users/<uuid:user_id>/temporary-password/", PlatformUserTemporaryPasswordView.as_view(), name="platform-users-temp-password"),
    path("users/<uuid:user_id>/revoke-sessions/", PlatformUserRevokeSessionsView.as_view(), name="platform-users-revoke-sessions"),

    # Domains
    path("domains/", PlatformDomainListCreateView.as_view(), name="platform-domains-list-create"),
    path("domains/<uuid:domain_id>/", PlatformDomainDetailView.as_view(), name="platform-domains-detail"),
    path("domains/<uuid:domain_id>/verify/", PlatformDomainVerifyView.as_view(), name="platform-domains-verify"),
    path("domains/<uuid:domain_id>/status/", PlatformDomainStatusView.as_view(), name="platform-domains-status"),

    # Login Activity & Audit
    path("login-activity/", PlatformLoginActivityView.as_view(), name="platform-login-activity"),
    path("audit/", PlatformAuditView.as_view(), name="platform-audit"),
]
