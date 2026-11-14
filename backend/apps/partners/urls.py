from django.urls import path
from apps.partners.views import (
    PartnerOverviewView,
    PartnerPharmacyListCreateView,
    PartnerPharmacyDetailView,
    PartnerPharmacyStatusView,
    PartnerStoreListCreateView,
    PartnerStoreDetailView,
    PartnerStoreStatusView,
    PartnerManagerListCreateView,
    PartnerManagerAssignStoresView,
    PartnerManagerResetPasswordView,
    PartnerManagerStatusView,
    PartnerOrganizationProfileView,
    PartnerLogoUploadView,
    PartnerBrandingView,
)

urlpatterns = [
    path("overview/", PartnerOverviewView.as_view(), name="partner-overview"),
    path("profile/", PartnerOrganizationProfileView.as_view(), name="partner-organization-profile"),
    path("profile/logo/", PartnerLogoUploadView.as_view(), name="partner-organization-logo"),
    path("branding/", PartnerBrandingView.as_view(), name="partner-branding"),
    path("pharmacies/", PartnerPharmacyListCreateView.as_view(), name="partner-pharmacies-list-create"),
    path("pharmacies/<uuid:org_id>/", PartnerPharmacyDetailView.as_view(), name="partner-pharmacies-detail"),
    path("pharmacies/<uuid:org_id>/status/", PartnerPharmacyStatusView.as_view(), name="partner-pharmacies-status"),
    path("stores/", PartnerStoreListCreateView.as_view(), name="partner-stores-list-create"),
    path("stores/<uuid:store_id>/", PartnerStoreDetailView.as_view(), name="partner-stores-detail"),
    path("stores/<uuid:store_id>/status/", PartnerStoreStatusView.as_view(), name="partner-stores-status"),
    path("managers/", PartnerManagerListCreateView.as_view(), name="partner-managers-list-create"),
    path("managers/<uuid:user_id>/assign-stores/", PartnerManagerAssignStoresView.as_view(), name="partner-managers-assign-stores"),
    path("managers/<uuid:user_id>/reset-password/", PartnerManagerResetPasswordView.as_view(), name="partner-managers-reset-password"),
    path("managers/<uuid:user_id>/status/", PartnerManagerStatusView.as_view(), name="partner-managers-status"),
]
