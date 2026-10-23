from django.urls import path
from apps.organizations.views import (
    StoreListView,
    StoreDetailView,
    StoreAssignManagerView,
    StoreMembersView,
    StoreMemberDetailView,
    OrganizationOverviewView,
    OrganizationTeamView,
    TeamMemberDetailView,
    OrganizationSettingsView,
)

urlpatterns = [
    path("overview/", OrganizationOverviewView.as_view(), name="org-overview"),
    path("team/", OrganizationTeamView.as_view(), name="org-team"),
    path("team/<uuid:user_id>/", TeamMemberDetailView.as_view(), name="org-team-member-detail"),
    path("settings/", OrganizationSettingsView.as_view(), name="org-settings"),
    path("stores/", StoreListView.as_view(), name="store-list-create"),
    path("stores/<uuid:store_id>/", StoreDetailView.as_view(), name="store-detail-update"),
    path("stores/<uuid:store_id>/assign-manager/", StoreAssignManagerView.as_view(), name="store-assign-manager"),
    path("stores/<uuid:store_id>/members/", StoreMembersView.as_view(), name="store-members"),
    path("stores/<uuid:store_id>/members/<uuid:membership_id>/", StoreMemberDetailView.as_view(), name="store-member-detail"),
]
