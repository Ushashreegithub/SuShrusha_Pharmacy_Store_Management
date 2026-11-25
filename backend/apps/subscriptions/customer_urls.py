from django.urls import path
from apps.subscriptions.views import CustomerSubscriptionView

urlpatterns = [
    path("my-subscription/", CustomerSubscriptionView.as_view(), name="customer-my-subscription"),
]
