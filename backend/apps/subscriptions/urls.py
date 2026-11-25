from django.urls import path
from apps.subscriptions.views import (
    PartnerSubscriptionListView,
    PartnerSubscriptionDetailView,
    PartnerSubscriptionConfirmPaymentView,
    PartnerSubscriptionRenewView,
    PartnerSubscriptionMetricsView,
)

urlpatterns = [
    path("", PartnerSubscriptionListView.as_view(), name="partner-subscriptions-list"),
    path("metrics/", PartnerSubscriptionMetricsView.as_view(), name="partner-subscriptions-metrics"),
    path("<int:subscription_id>/", PartnerSubscriptionDetailView.as_view(), name="partner-subscriptions-detail"),
    path("<int:subscription_id>/confirm-payment/", PartnerSubscriptionConfirmPaymentView.as_view(), name="partner-subscriptions-confirm-payment"),
    path("<int:subscription_id>/renew/", PartnerSubscriptionRenewView.as_view(), name="partner-subscriptions-renew"),
]
