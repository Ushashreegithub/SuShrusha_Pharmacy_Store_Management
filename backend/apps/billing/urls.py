from django.urls import path
from apps.billing.views import (
    POSProductSearchView,
    CustomerListCreateView,
    ActiveSaleDraftView,
    HeldDraftListView,
    SaleDraftDetailView,
    SaleDraftItemView,
    SaleDraftCustomerView,
    SaleDraftHoldView,
    SaleDraftResumeView,
    DiscountRequestView,
    DiscountReviewView,
    PrescriptionVerifyView,
    CheckoutInitiateView,
    CheckoutPaymentView,
    CheckoutPaymentVerifyView,
    CheckoutFinalizeView,
    CheckoutAttemptDetailView,
    CheckoutView,
    InvoiceListView,
    InvoiceDetailView,
)

urlpatterns = [
    # Medicine search & barcode lookup
    path("stores/<uuid:store_id>/products/search/", POSProductSearchView.as_view(), name="billing-product-search"),

    # Customer management (both organization-scoped and store-scoped)
    path("customers/", CustomerListCreateView.as_view(), name="billing-customers-org"),
    path("stores/<uuid:store_id>/customers/", CustomerListCreateView.as_view(), name="billing-customers"),

    # Sale draft operations
    path("stores/<uuid:store_id>/drafts/active/", ActiveSaleDraftView.as_view(), name="billing-draft-active"),
    path("stores/<uuid:store_id>/drafts/held/", HeldDraftListView.as_view(), name="billing-drafts-held"),
    path("stores/<uuid:store_id>/drafts/<uuid:draft_id>/", SaleDraftDetailView.as_view(), name="billing-draft-detail"),
    path("stores/<uuid:store_id>/drafts/<uuid:draft_id>/items/", SaleDraftItemView.as_view(), name="billing-draft-items"),
    path("stores/<uuid:store_id>/drafts/<uuid:draft_id>/items/<uuid:item_id>/", SaleDraftItemView.as_view(), name="billing-draft-item-detail"),
    path("stores/<uuid:store_id>/drafts/<uuid:draft_id>/customer/", SaleDraftCustomerView.as_view(), name="billing-draft-customer"),
    path("stores/<uuid:store_id>/drafts/<uuid:draft_id>/hold/", SaleDraftHoldView.as_view(), name="billing-draft-hold"),
    path("stores/<uuid:store_id>/drafts/<uuid:draft_id>/resume/", SaleDraftResumeView.as_view(), name="billing-draft-resume"),

    # Discount approval workflow
    path("stores/<uuid:store_id>/drafts/<uuid:draft_id>/discount-request/", DiscountRequestView.as_view(), name="billing-discount-request"),
    path("stores/<uuid:store_id>/discount-requests/<uuid:request_id>/review/", DiscountReviewView.as_view(), name="billing-discount-review"),

    # Prescription authorization
    path("stores/<uuid:store_id>/drafts/<uuid:draft_id>/verify-prescription/", PrescriptionVerifyView.as_view(), name="billing-prescription-verify"),

    # Phase 2 Two-Stage Durable Checkout Lifecycle (canonical RESTful routes)
    path("stores/<uuid:store_id>/checkout/initiate/", CheckoutInitiateView.as_view(), name="billing-checkout-initiate"),
    path("stores/<uuid:store_id>/checkout/<uuid:attempt_id>/payments/", CheckoutPaymentView.as_view(), name="billing-checkout-payment"),
    path("stores/<uuid:store_id>/checkout/<uuid:attempt_id>/payments/<uuid:payment_id>/verify/", CheckoutPaymentVerifyView.as_view(), name="billing-checkout-payment-verify"),
    path("stores/<uuid:store_id>/checkout/<uuid:attempt_id>/finalize/", CheckoutFinalizeView.as_view(), name="billing-checkout-finalize"),
    path("stores/<uuid:store_id>/checkout/<uuid:attempt_id>/", CheckoutAttemptDetailView.as_view(), name="billing-checkout-attempt-detail"),

    # Aliases for hyphenated endpoints
    path("stores/<uuid:store_id>/checkout-initiate/", CheckoutInitiateView.as_view(), name="billing-checkout-initiate-alias"),
    path("stores/<uuid:store_id>/checkout-attempts/<uuid:attempt_id>/payments/", CheckoutPaymentView.as_view(), name="billing-checkout-payment-alias"),
    path("stores/<uuid:store_id>/checkout-attempts/<uuid:attempt_id>/payments/<uuid:payment_id>/verify/", CheckoutPaymentVerifyView.as_view(), name="billing-checkout-payment-verify-alias"),
    path("stores/<uuid:store_id>/checkout-attempts/<uuid:attempt_id>/finalize/", CheckoutFinalizeView.as_view(), name="billing-checkout-finalize-alias"),
    path("stores/<uuid:store_id>/checkout-attempts/<uuid:attempt_id>/status/", CheckoutAttemptDetailView.as_view(), name="billing-checkout-attempt-status-alias"),

    # Single-step transactional checkout (backward compatibility / direct settlement)
    path("stores/<uuid:store_id>/checkout/", CheckoutView.as_view(), name="billing-checkout"),

    # Completed invoices
    path("stores/<uuid:store_id>/invoices/", InvoiceListView.as_view(), name="billing-invoice-list"),
    path("stores/<uuid:store_id>/invoices/<uuid:invoice_id>/", InvoiceDetailView.as_view(), name="billing-invoice-detail"),
]

