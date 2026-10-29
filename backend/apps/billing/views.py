import uuid
from decimal import Decimal
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.core.paginator import Paginator, EmptyPage
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.organizations.models import Store
from apps.products.models import Product
from apps.products.permissions import get_user_organization
from apps.billing.models import (
    Customer,
    SaleDraft,
    SaleDraftItem,
    DiscountApprovalRequest,
    CheckoutAttempt,
    Payment,
    Invoice,
)
from apps.billing.permissions import (
    CanAccessBilling,
    CanApproveDiscount,
    CanAuthorizePrescription,
    get_user_store_role,
)
from apps.billing.serializers import (
    CustomerSerializer,
    POSProductSearchSerializer,
    SaleDraftSerializer,
    SaleDraftItemSerializer,
    DiscountApprovalRequestSerializer,
    PaymentSerializer,
    CheckoutAttemptSerializer,
    InvoiceSerializer,
)
from apps.billing.services import (
    DraftBillingService,
    BillingCalculator,
    CheckoutService,
)


class POSProductSearchView(APIView):
    """
    GET: Fast cashier medicine search across name, brand, generic, SKU, and barcode.
    Returns product catalog details with live store availability and batch MRPs.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def get(self, request, store_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        query = request.query_params.get("q", "").strip()
        qs = Product.objects.filter(
            organization=store.organization,
            is_active=True
        )

        if query:
            # Barcode exact match priority or text match
            qs = qs.filter(
                Q(barcode__iexact=query) |
                Q(name__icontains=query) |
                Q(brand_name__icontains=query) |
                Q(generic_name__icontains=query) |
                Q(sku__iexact=query)
            )

        products = list(qs.order_by("name")[:25])
        serializer = POSProductSearchSerializer(products, many=True, context={"request": request, "store": store})
        return Response(serializer.data, status=status.HTTP_200_OK)


class CustomerListCreateView(APIView):
    """
    GET: Search existing registered customers by phone number or name.
    POST: Quickly register a new retail customer.
    Supports both /api/billing/stores/<store_id>/customers/ and /api/billing/customers/
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def _get_organization(self, request, store_id=None):
        if store_id:
            store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
            self.check_object_permissions(request, store)
            return store.organization

        org = get_user_organization(request.user)
        return org

    def get(self, request, store_id=None):
        organization = self._get_organization(request, store_id)
        if not organization:
            return Response(
                {"detail": "Active organization could not be resolved for customer search."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        search = request.query_params.get("search", "").strip()
        qs = Customer.objects.filter(organization=organization)

        if search:
            qs = qs.filter(
                Q(phone_number__icontains=search) |
                Q(name__icontains=search)
            )

        customers = qs.order_by("-created_at")[:20]
        serializer = CustomerSerializer(customers, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, store_id=None):
        organization = self._get_organization(request, store_id)
        if not organization:
            return Response(
                {"detail": "Active organization could not be resolved to register customer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CustomerSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Check existing customer by phone in organization
        phone = serializer.validated_data["phone_number"].strip()
        existing = Customer.objects.filter(
            organization=organization,
            phone_number=phone
        ).first()

        if existing:
            # Update customer details if provided
            existing.name = serializer.validated_data["name"]
            if serializer.validated_data.get("email"):
                existing.email = serializer.validated_data["email"]
            if serializer.validated_data.get("address"):
                existing.address = serializer.validated_data["address"]
            if serializer.validated_data.get("doctor_name"):
                existing.doctor_name = serializer.validated_data["doctor_name"]
            if serializer.validated_data.get("doctor_registration_number"):
                existing.doctor_registration_number = serializer.validated_data["doctor_registration_number"]
            existing.save()
            return Response(CustomerSerializer(existing).data, status=status.HTTP_200_OK)

        customer = serializer.save(organization=organization)
        return Response(CustomerSerializer(customer).data, status=status.HTTP_201_CREATED)


class ActiveSaleDraftView(APIView):
    """
    GET: Retrieve or initialize the active cashier draft for the current store.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def get(self, request, store_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft = DraftBillingService.get_or_create_draft(store=store, cashier=request.user)
        serializer = SaleDraftSerializer(draft, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class HeldDraftListView(APIView):
    """
    GET: List all parked / held bills at this store counter.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def get(self, request, store_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        held_drafts = SaleDraft.objects.filter(
            store=store,
            status="HELD"
        ).select_related("cashier", "customer").prefetch_related("items").order_by("-updated_at")

        serializer = SaleDraftSerializer(held_drafts, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class SaleDraftDetailView(APIView):
    """
    GET: Retrieve details and pricing preview of a specific draft.
    DELETE: Cancel / discard an active draft.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def get(self, request, store_id, draft_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft = get_object_or_404(SaleDraft, id=draft_id, store=store)
        serializer = SaleDraftSerializer(draft, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, store_id, draft_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft = get_object_or_404(SaleDraft, id=draft_id, store=store)
        draft.status = "CANCELLED"
        draft.save(update_fields=["status", "updated_at"])
        return Response({"status": "success", "message": f"Draft {draft.draft_number} cancelled."}, status=status.HTTP_200_OK)


class SaleDraftItemView(APIView):
    """
    POST: Add or update medicine in draft cart.
    DELETE: Remove line item from cart.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def post(self, request, store_id, draft_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft = get_object_or_404(SaleDraft, id=draft_id, store=store)
        if draft.status == "CONVERTED":
            return Response({"detail": "This draft has already been converted to an invoice."}, status=status.HTTP_400_BAD_REQUEST)

        product_id = request.data.get("product_id")
        quantity = int(request.data.get("quantity", 1))
        unit_type = request.data.get("unit_type", "SALE_UNIT")
        batch_id = request.data.get("batch_id")

        product = get_object_or_404(Product, id=product_id, organization=store.organization)

        try:
            DraftBillingService.add_or_update_item(
                draft=draft,
                product=product,
                quantity=quantity,
                unit_type=unit_type,
                selected_batch_id=batch_id,
            )
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        draft.refresh_from_db()
        return Response(SaleDraftSerializer(draft, context={"request": request}).data, status=status.HTTP_200_OK)

    def delete(self, request, store_id, draft_id, item_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft = get_object_or_404(SaleDraft, id=draft_id, store=store)
        DraftBillingService.remove_item(draft=draft, item_id=item_id)
        draft.refresh_from_db()
        return Response(SaleDraftSerializer(draft, context={"request": request}).data, status=status.HTTP_200_OK)


class SaleDraftCustomerView(APIView):
    """
    PATCH / POST: Associate or clear customer for a sale draft.
    Validates draft editability, customer existence, and organization tenancy.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def patch(self, request, store_id, draft_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft = get_object_or_404(SaleDraft, id=draft_id, store=store)
        if draft.status in ["COMPLETED", "CANCELLED"]:
            return Response(
                {"detail": f"Cannot modify customer on a {draft.status.lower()} draft."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        customer_id = request.data.get("customer_id")

        if customer_id:
            try:
                customer_uuid = uuid.UUID(str(customer_id).strip())
            except (ValueError, AttributeError):
                return Response(
                    {"detail": f"Invalid customer ID format: {customer_id}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            customer = Customer.objects.filter(
                id=customer_uuid,
                organization=store.organization
            ).first()

            if not customer:
                # Check for cross-tenant breach attempt
                if Customer.objects.filter(id=customer_uuid).exists():
                    return Response(
                        {"detail": "Customer belongs to a different organization and cannot be linked."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                return Response(
                    {"detail": f"Customer with ID '{customer_id}' was not found in this organization."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            draft.customer = customer
        else:
            draft.customer = None

        draft.save(update_fields=["customer", "updated_at"])
        return Response(SaleDraftSerializer(draft, context={"request": request}).data, status=status.HTTP_200_OK)

    # Support POST as an alias to avoid 405 Method Not Allowed while PATCH remains canonical
    post = patch


class SaleDraftHoldView(APIView):
    """
    POST: Park / hold current draft bill.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def post(self, request, store_id, draft_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft = get_object_or_404(SaleDraft, id=draft_id, store=store)
        notes = request.data.get("notes", "")

        try:
            DraftBillingService.hold_draft(draft, notes=notes)
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(SaleDraftSerializer(draft, context={"request": request}).data, status=status.HTTP_200_OK)


class SaleDraftResumeView(APIView):
    """
    POST: Resume parked draft with full stock and price revalidation.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def post(self, request, store_id, draft_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft = get_object_or_404(SaleDraft, id=draft_id, store=store)
        draft, warnings = DraftBillingService.resume_draft(draft)

        res_data = SaleDraftSerializer(draft, context={"request": request}).data
        res_data["warnings"] = warnings
        return Response(res_data, status=status.HTTP_200_OK)


class DiscountRequestView(APIView):
    """
    POST: Cashier submits a manual discount request for store manager approval.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def post(self, request, store_id, draft_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft = get_object_or_404(SaleDraft, id=draft_id, store=store)
        discount_type = request.data.get("discount_type", "PERCENTAGE")
        discount_value = Decimal(str(request.data.get("discount_value", "0.00")))
        reason = request.data.get("reason", "")

        try:
            req = DraftBillingService.request_discount(
                draft=draft,
                cashier=request.user,
                discount_type=discount_type,
                discount_value=discount_value,
                reason=reason
            )
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(DiscountApprovalRequestSerializer(req).data, status=status.HTTP_201_CREATED)


class DiscountReviewView(APIView):
    """
    POST: Store Manager or Organization Owner approves or rejects a manual discount.
    """
    permission_classes = [IsAuthenticated, CanApproveDiscount]

    def post(self, request, store_id, request_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        req = get_object_or_404(DiscountApprovalRequest, id=request_id, draft__store=store)
        approved = bool(request.data.get("approved", False))
        rejection_reason = request.data.get("rejection_reason", "")

        try:
            req = DraftBillingService.review_discount(
                discount_request=req,
                reviewer=request.user,
                approved=approved,
                rejection_reason=rejection_reason
            )
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        draft = req.draft
        return Response(SaleDraftSerializer(draft, context={"request": request}).data, status=status.HTTP_200_OK)


class PrescriptionVerifyView(APIView):
    """
    POST: Pharmacist signs off on prescription medicines.
    """
    permission_classes = [IsAuthenticated, CanAuthorizePrescription]

    def post(self, request, store_id, draft_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft = get_object_or_404(SaleDraft, id=draft_id, store=store)
        rx_num = request.data.get("prescription_number", "")
        doc_name = request.data.get("doctor_name", "")

        try:
            draft = DraftBillingService.verify_prescription(
                draft=draft,
                pharmacist_user=request.user,
                prescription_number=rx_num,
                doctor_name=doc_name
            )
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(SaleDraftSerializer(draft, context={"request": request}).data, status=status.HTTP_200_OK)


class CheckoutInitiateView(APIView):
    """
    POST: Phase 2 Step 1 - Initiates a CheckoutAttempt for a draft bill.
    Freezes cart revision, snapshots financial totals, pre-validates FEFO stock availability.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def post(self, request, store_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft_id = request.data.get("draft_id")
        customer_data = request.data.get("customer")
        idempotency_key = request.headers.get("Idempotency-Key") or request.data.get("idempotency_key")

        if not draft_id:
            return Response({"detail": "Draft ID is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not customer_data:
            return Response({"detail": "Customer details are mandatory for initiating checkout."}, status=status.HTTP_400_BAD_REQUEST)
        if not idempotency_key:
            return Response({"detail": "Idempotency-Key header is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            attempt = CheckoutService.initiate_checkout(
                store=store,
                cashier=request.user,
                draft_id=draft_id,
                customer_id_or_data=customer_data,
                idempotency_key=str(idempotency_key).strip(),
            )
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CheckoutAttemptSerializer(attempt)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CheckoutPaymentView(APIView):
    """
    POST: Phase 2 Step 2 - Records payment against an active CheckoutAttempt.
    Cash is marked CONFIRMED immediately; UPI/Card is set to REQUIRES_VERIFICATION.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def post(self, request, store_id, attempt_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        payment_data = request.data
        if not payment_data or not payment_data.get("method"):
            return Response({"detail": "Payment method and details are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payment, attempt = CheckoutService.record_payment(
                store=store,
                user=request.user,
                attempt_id=attempt_id,
                payment_data=payment_data,
            )
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "payment": PaymentSerializer(payment).data,
            "checkout_attempt": CheckoutAttemptSerializer(attempt).data,
        }, status=status.HTTP_201_CREATED)


class CheckoutPaymentVerifyView(APIView):
    """
    POST: Phase 2 Step 2b - Store Manager / Org Owner manually verifies external payment.
    Cashier self-verification is strictly prohibited!
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def post(self, request, store_id, attempt_id, payment_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        approved = request.data.get("approved", True)
        if isinstance(approved, str):
            approved = approved.lower() in ["true", "1", "yes"]
        notes = request.data.get("verification_notes", "")

        try:
            payment, attempt = CheckoutService.verify_payment(
                store=store,
                verifier_user=request.user,
                attempt_id=attempt_id,
                payment_id=payment_id,
                approved=approved,
                verification_notes=notes,
            )
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "payment": PaymentSerializer(payment).data,
            "checkout_attempt": CheckoutAttemptSerializer(attempt).data,
        }, status=status.HTTP_200_OK)


class CheckoutFinalizeView(APIView):
    """
    POST: Phase 2 Step 3 - Atomically finalizes the invoice and posts stock deductions
    via canonical StockLedgerService.post_sale_dispense.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def post(self, request, store_id, attempt_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        idempotency_key = request.headers.get("Idempotency-Key") or request.data.get("idempotency_key")

        try:
            invoice, is_new = CheckoutService.finalize_checkout(
                store=store,
                user=request.user,
                attempt_id=attempt_id,
                idempotency_key=str(idempotency_key).strip() if idempotency_key else None,
            )
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "status": "success",
            "is_newly_created": is_new,
            "invoice": InvoiceSerializer(invoice, context={"request": request}).data,
        }, status=status.HTTP_201_CREATED if is_new else status.HTTP_200_OK)


class CheckoutAttemptDetailView(APIView):
    """
    GET: Retrieves the live status and payment breakdown of a CheckoutAttempt.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def get(self, request, store_id, attempt_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        attempt = get_object_or_404(
            CheckoutAttempt.objects.select_related("draft", "cashier", "customer", "store", "invoice").prefetch_related("payments"),
            id=attempt_id,
            store=store
        )
        serializer = CheckoutAttemptSerializer(attempt)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CheckoutView(APIView):
    """
    POST: Final transaction-safe checkout.
    - Revalidates stock, discounts, customer, and prescription.
    - Decrements StoreBatchStock.
    - Writes StockMovement.
    - Records Payments and issues Invoice.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def post(self, request, store_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        draft_id = request.data.get("draft_id")
        customer_data = request.data.get("customer")
        payments_data = request.data.get("payments", [])
        idempotency_key = request.headers.get("Idempotency-Key") or request.data.get("idempotency_key")

        if not draft_id:
            return Response({"detail": "Draft ID is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not customer_data:
            return Response({"detail": "Customer details are mandatory for issuing an invoice."}, status=status.HTTP_400_BAD_REQUEST)
        if not payments_data:
            return Response({"detail": "At least one payment method allocation is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not idempotency_key:
            return Response({"detail": "Idempotency-Key header is required for checkout."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invoice, is_new = CheckoutService.execute_checkout(
                store=store,
                cashier=request.user,
                draft_id=draft_id,
                customer_id_or_data=customer_data,
                payments_data=payments_data,
                idempotency_key=str(idempotency_key).strip(),
            )
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = InvoiceSerializer(invoice, context={"request": request})
        return Response(
            {
                "status": "success",
                "is_newly_created": is_new,
                "invoice": serializer.data,
            },
            status=status.HTTP_201_CREATED if is_new else status.HTTP_200_OK
        )


class InvoiceListView(APIView):
    """
    GET: List completed invoices with search and date filters.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def get(self, request, store_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        qs = Invoice.objects.filter(store=store).select_related(
            "cashier", "customer", "store", "organization"
        ).prefetch_related("items", "payments")

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(invoice_number__icontains=search) |
                Q(customer_name__icontains=search) |
                Q(customer_phone__icontains=search)
            )

        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter:
            qs = qs.filter(status=status_filter)

        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 20))), 100)

        paginator = Paginator(qs.order_by("-invoice_date"), page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []
        serializer = InvoiceSerializer(items, many=True, context={"request": request})

        return Response({
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": serializer.data,
        }, status=status.HTTP_200_OK)


class InvoiceDetailView(APIView):
    """
    GET: Retrieve full digital invoice details.
    """
    permission_classes = [IsAuthenticated, CanAccessBilling]

    def get(self, request, store_id, invoice_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        invoice = get_object_or_404(
            Invoice.objects.select_related("cashier", "customer", "store", "organization").prefetch_related("items", "items__batch_allocations", "payments"),
            id=invoice_id,
            store=store
        )
        serializer = InvoiceSerializer(invoice, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)
