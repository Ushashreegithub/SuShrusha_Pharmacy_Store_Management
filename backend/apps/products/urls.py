from django.urls import path
from apps.products.views import (
    ProductListCreateView,
    ProductDetailView,
    ProductArchiveView,
    ProductReactivateView,
    ProductMetadataView,
    ProductImportTemplateView,
    ProductImportPreviewView,
    ProductImportConfirmView,
    ProductImportErrorReportView,
)

urlpatterns = [
    path("", ProductListCreateView.as_view(), name="product-list-create"),
    path("metadata/", ProductMetadataView.as_view(), name="product-metadata"),
    path("import/template/", ProductImportTemplateView.as_view(), name="product-import-template"),
    path("import/preview/", ProductImportPreviewView.as_view(), name="product-import-preview"),
    path("import/confirm/", ProductImportConfirmView.as_view(), name="product-import-confirm"),
    path("import/<uuid:batch_id>/error-report/", ProductImportErrorReportView.as_view(), name="product-import-error-report"),
    path("<uuid:pk>/", ProductDetailView.as_view(), name="product-detail"),
    path("<uuid:pk>/archive/", ProductArchiveView.as_view(), name="product-archive"),
    path("<uuid:pk>/reactivate/", ProductReactivateView.as_view(), name="product-reactivate"),
]

