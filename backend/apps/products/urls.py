from django.urls import path
from apps.products.views import (
    ProductListCreateView,
    ProductDetailView,
    ProductArchiveView,
    ProductReactivateView,
    ProductMetadataView,
)

urlpatterns = [
    path("", ProductListCreateView.as_view(), name="product-list-create"),
    path("metadata/", ProductMetadataView.as_view(), name="product-metadata"),
    path("<uuid:pk>/", ProductDetailView.as_view(), name="product-detail"),
    path("<uuid:pk>/archive/", ProductArchiveView.as_view(), name="product-archive"),
    path("<uuid:pk>/reactivate/", ProductReactivateView.as_view(), name="product-reactivate"),
]

