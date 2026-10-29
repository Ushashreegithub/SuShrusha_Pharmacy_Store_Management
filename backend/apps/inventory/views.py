from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Q, F, Sum, Subquery, OuterRef, DecimalField, ExpressionWrapper
from django.utils import timezone
from django.core.paginator import Paginator, EmptyPage
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.organizations.models import Store, StoreMembership
from apps.inventory.models import (
    Batch,
    StoreBatchStock,
    BatchInwardCostLayer,
    Supplier,
    GoodsReceipt,
    GoodsReceiptItem,
    StockTransfer,
    StockTransferItem,
    TransferDiscrepancy,
    AdjustmentApprovalPolicy,
    PhysicalStockCount,
    PhysicalStockCountItem,
    StockAdjustment,
    StoreExpiryPolicy,
    StockQuarantineRecord,
    BatchRecall,
    StockMovement,
)
from apps.inventory.services import StockLedgerService
from apps.inventory.serializers import (
    OpeningStockInputSerializer,
    StoreStockItemSerializer,
    SupplierSerializer,
    GoodsReceiptSerializer,
    GoodsReceiptInputSerializer,
    GoodsReceiptItemSerializer,
    StockTransferInputSerializer,
    StockTransferSerializer,
    StockTransferReceiptInputSerializer,
    TransferDiscrepancyResolutionInputSerializer,
    TransferDiscrepancySerializer,
    StockAdjustmentInputSerializer,
    StockAdjustmentReviewInputSerializer,
    StockAdjustmentSerializer,
    PhysicalStockCountInputSerializer,
    PhysicalStockCountRecordInputSerializer,
    PhysicalStockCountSerializer,
    AdjustmentApprovalPolicySerializer,
    StoreExpiryPolicySerializer,
    StoreExpiryPolicyInputSerializer,
    BatchExpiryMonitoringSerializer,
    StockQuarantineRecordSerializer,
    StockQuarantineInputSerializer,
    StockQuarantineReleaseInputSerializer,
    StockQuarantineDisposeInputSerializer,
    BatchRecallSerializer,
    BatchRecallInputSerializer,
    BatchRecallReleaseInputSerializer,
    BatchRecallDisposeInputSerializer,
    StockMovementSerializer,
)
from apps.inventory.permissions import (
    CanPostStoreOpeningStock,
    CanViewStoreStock,
    CanManageSuppliers,
    CanManageGoodsReceipts,
    CanManageTransfers,
    CanManageAdjustments,
    CanManageStockCounts,
    CanManageQuarantine,
    CanManageRecalls,
    can_user_view_cost_data,
    get_user_organization,
    is_user_org_owner,
    is_user_assigned_store_manager,
    is_user_store_member,
)
from apps.inventory.exceptions import (
    StockLedgerError,
    IdempotencyConflictError,
    IdempotencyPayloadConflictError,
    InvalidQuantityError,
    InvalidCostError,
    DuplicateOpeningStockError,
    BatchValidationError,
    StorePermissionDeniedError,
)


class OpeningStockView(APIView):
    """
    POST: Establishes initial opening stock for a store and batch under strict transaction boundaries.
    Enforces idempotency, cost provenance, integer quantities, and RBAC controls.
    """
    permission_classes = [IsAuthenticated, CanPostStoreOpeningStock]

    def post(self, request, store_id):
        store = get_object_or_404(
            Store.objects.select_related("organization"),
            id=store_id
        )
        self.check_object_permissions(request, store)

        header_key = request.headers.get("Idempotency-Key") or request.META.get("HTTP_IDEMPOTENCY_KEY")
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        body_key = data.get("idempotency_key")

        if header_key and body_key:
            if str(header_key).strip() != str(body_key).strip():
                return Response(
                    {"detail": "Idempotency key in header does not match idempotency_key in request body."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        elif header_key and not body_key:
            data["idempotency_key"] = str(header_key).strip()

        serializer = OpeningStockInputSerializer(
            data=data,
            context={"store": store, "request": request}
        )
        if not serializer.is_valid():
            return Response(
                {"detail": "Validation error", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        validated_data = serializer.validated_data
        idempotency_key = validated_data["idempotency_key"]

        try:
            result_data, is_newly_created = StockLedgerService.post_opening_stock(
                store=store,
                actor=request.user,
                idempotency_key=idempotency_key,
                raw_payload=request.data,
                validated_data=validated_data
            )
            response_status = status.HTTP_201_CREATED if is_newly_created else status.HTTP_200_OK
            return Response(result_data, status=response_status)

        except IdempotencyPayloadConflictError as e:
            return Response(
                {"detail": e.message, "code": e.code},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )
        except IdempotencyConflictError as e:
            return Response(
                {"detail": e.message, "code": e.code},
                status=status.HTTP_409_CONFLICT
            )
        except DuplicateOpeningStockError as e:
            return Response(
                {"detail": e.message, "code": e.code},
                status=status.HTTP_409_CONFLICT
            )
        except StorePermissionDeniedError as e:
            return Response(
                {"detail": e.message, "code": e.code},
                status=status.HTTP_403_FORBIDDEN
            )
        except (InvalidQuantityError, InvalidCostError, BatchValidationError) as e:
            return Response(
                {"detail": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST
            )
        except StockLedgerError as e:
            return Response(
                {"detail": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST
            )


class StoreStockListView(APIView):
    """
    GET: Returns paginated stock listing for a specific store branch.
    Supports multi-field search, status filtering, near-expiry alerts, and deterministic ordering.
    Masks financial cost and valuation metrics for unauthorized staff roles.
    """
    permission_classes = [IsAuthenticated, CanViewStoreStock]

    def get(self, request, store_id):
        store = get_object_or_404(
            Store.objects.select_related("organization"),
            id=store_id
        )
        self.check_object_permissions(request, store)

        # Annotate latest unit_cost from cost layers via Subquery to eliminate N+1 queries
        latest_cost_sub = BatchInwardCostLayer.objects.filter(
            store=store,
            batch=OuterRef("batch_id")
        ).order_by("-created_at").values("unit_cost")[:1]

        qs = StoreBatchStock.objects.filter(
            store=store
        ).select_related(
            "product",
            "batch",
            "batch__packaging_snapshot",
            "store",
            "organization"
        ).annotate(
            latest_unit_cost=Subquery(latest_cost_sub)
        )

        # 1. Search filter
        search_query = request.query_params.get("search", "").strip()
        if search_query:
            qs = qs.filter(
                Q(product__name__icontains=search_query) |
                Q(product__sku__icontains=search_query) |
                Q(product__barcode__icontains=search_query) |
                Q(product__generic_name__icontains=search_query) |
                Q(batch__batch_number__icontains=search_query)
            )

        # 2. Category filter
        category = request.query_params.get("category", "").strip()
        if category:
            qs = qs.filter(product__category=category)

        # 3. Low stock filter
        low_stock = request.query_params.get("low_stock", "").lower()
        if low_stock in ["1", "true", "yes"]:
            qs = qs.filter(quantity_on_hand__lte=F("quantity_quarantined") + F("low_stock_threshold"))

        # 4. Near expiry filter (configurable days_to_expiry horizon, default: 90)
        near_expiry = request.query_params.get("near_expiry", "").lower()
        if near_expiry in ["1", "true", "yes"]:
            try:
                days_horizon = max(1, min(3650, int(request.query_params.get("days_to_expiry", 90))))
            except (ValueError, TypeError):
                days_horizon = 90
            today = timezone.localdate()
            qs = qs.filter(
                batch__expiry_date__gt=today,
                batch__expiry_date__lte=today + timedelta(days=days_horizon)
            )

        # 5. Expired filter
        expired = request.query_params.get("expired", "").lower()
        if expired in ["1", "true", "yes"]:
            qs = qs.filter(batch__expiry_date__lte=timezone.localdate())

        # 6. Deterministic ordering
        qs = qs.order_by("product__name", "batch__expiry_date", "id")

        # 7. Summary metrics calculation
        total_items = qs.count()

        # Compute aggregates in a single SQL query
        aggregates = qs.aggregate(
            total_on_hand=Sum("quantity_on_hand"),
            total_quarantined=Sum("quantity_quarantined")
        )
        total_on_hand = aggregates["total_on_hand"] or 0
        total_quarantined = aggregates["total_quarantined"] or 0

        can_view_cost = can_user_view_cost_data(request.user, store)

        summary = {
            "store_id": str(store.id),
            "store_name": store.name,
            "total_items": total_items,
            "total_on_hand_base_units": total_on_hand,
            "total_quarantined_base_units": total_quarantined,
        }

        # Calculate valuations inside PostgreSQL without loading rows into Python memory
        if can_view_cost:
            cost_agg = qs.aggregate(
                total_cost=Sum(
                    ExpressionWrapper(
                        F("quantity_on_hand") * F("latest_unit_cost"),
                        output_field=DecimalField(max_digits=16, decimal_places=4)
                    )
                ),
                total_retail=Sum(
                    ExpressionWrapper(
                        F("quantity_on_hand") * F("batch__unit_mrp"),
                        output_field=DecimalField(max_digits=16, decimal_places=2)
                    )
                )
            )
            total_val_cost = cost_agg["total_cost"] or Decimal("0.00")
            total_val_retail = cost_agg["total_retail"] or Decimal("0.00")

            summary["total_valuation_cost"] = str(Decimal(str(total_val_cost)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            summary["total_valuation_retail"] = str(Decimal(str(total_val_retail)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        # 8. Pagination
        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 20))), 100)

        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []
        serializer = StoreStockItemSerializer(
            items,
            many=True,
            context={"request": request, "store": store}
        )

        return Response({
            "summary": summary,
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": serializer.data
        }, status=status.HTTP_200_OK)


# =============================================================================
# Milestone 2C.1: Supplier Master Views
# =============================================================================

class SupplierListCreateView(APIView):
    """
    GET: List suppliers belonging to the caller's organization.
    POST: Create a new supplier (restricted to Org Owners and Store Managers).
    """
    permission_classes = [IsAuthenticated, CanManageSuppliers]

    def get(self, request):
        org = get_user_organization(request.user)
        if not org:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        qs = Supplier.objects.filter(organization=org)

        # Filters
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(supplier_code__icontains=search) |
                Q(gstin__icontains=search) |
                Q(contact_person__icontains=search) |
                Q(city__icontains=search)
            )

        is_active = request.query_params.get("is_active", "").lower()
        if is_active in ["1", "true", "yes"]:
            qs = qs.filter(is_active=True)
        elif is_active in ["0", "false", "no"]:
            qs = qs.filter(is_active=False)

        qs = qs.order_by("name")

        # Pagination
        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 20))), 100)
        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []
        serializer = SupplierSerializer(items, many=True, context={"request": request})
        return Response({
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": serializer.data
        }, status=status.HTTP_200_OK)

    def post(self, request):
        org = get_user_organization(request.user)
        if not org:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        serializer = SupplierSerializer(data=request.data, context={"organization": org, "request": request})
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        supplier = serializer.save(organization=org, created_by=request.user)
        return Response(SupplierSerializer(supplier, context={"request": request}).data, status=status.HTTP_201_CREATED)


class SupplierDetailView(APIView):
    """
    GET: Retrieve a single supplier.
    PATCH: Update supplier details.
    """
    permission_classes = [IsAuthenticated, CanManageSuppliers]

    def get_object(self, supplier_id, user):
        org = get_user_organization(user)
        if not org:
            return None
        return get_object_or_404(Supplier, id=supplier_id, organization=org)

    def get(self, request, supplier_id):
        supplier = self.get_object(supplier_id, request.user)
        if not supplier:
            return Response({"detail": "Supplier not found."}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, supplier)
        serializer = SupplierSerializer(supplier, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, supplier_id):
        supplier = self.get_object(supplier_id, request.user)
        if not supplier:
            return Response({"detail": "Supplier not found."}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, supplier)
        serializer = SupplierSerializer(
            supplier,
            data=request.data,
            partial=True,
            context={"organization": supplier.organization, "request": request}
        )
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        updated_supplier = serializer.save()
        return Response(SupplierSerializer(updated_supplier, context={"request": request}).data, status=status.HTTP_200_OK)


class SupplierDeactivateView(APIView):
    """POST: Soft-deactivate a supplier."""
    permission_classes = [IsAuthenticated, CanManageSuppliers]

    def post(self, request, supplier_id):
        org = get_user_organization(request.user)
        supplier = get_object_or_404(Supplier, id=supplier_id, organization=org)
        self.check_object_permissions(request, supplier)

        supplier.is_active = False
        supplier.save(update_fields=["is_active", "updated_at"])
        return Response({"status": "success", "message": f"Supplier '{supplier.name}' deactivated successfully."}, status=status.HTTP_200_OK)


# =============================================================================
# Milestone 2C.1: Goods Receipt (Purchase Inward) Views
# =============================================================================

def generate_grn_number(organization, store):
    """Generates a sequential human-readable GRN number: GRN-YYYYMMDD-XXXX."""
    today_str = timezone.localdate().strftime("%Y%m%d")
    prefix = f"GRN-{today_str}-"
    last_grn = GoodsReceipt.objects.filter(
        organization=organization,
        grn_number__startswith=prefix
    ).order_by("-grn_number").first()

    if last_grn and last_grn.grn_number:
        try:
            seq = int(last_grn.grn_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1

    return f"{prefix}{seq:04d}"


class GoodsReceiptListCreateView(APIView):
    """
    GET: List Goods Receipts for a store branch.
    POST: Create a draft Goods Receipt with line items.
    """
    permission_classes = [IsAuthenticated, CanManageGoodsReceipts]

    def get(self, request, store_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        qs = GoodsReceipt.objects.filter(store=store).select_related(
            "supplier", "store", "received_by", "posted_by"
        ).prefetch_related("items", "items__product", "items__packaging_snapshot")

        # Filters
        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter:
            qs = qs.filter(status=status_filter)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(grn_number__icontains=search) |
                Q(supplier_invoice_number__icontains=search) |
                Q(supplier__name__icontains=search)
            )

        qs = qs.order_by("-created_at")

        # Pagination
        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 20))), 100)
        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []
        serializer = GoodsReceiptSerializer(items, many=True, context={"request": request, "store": store})

        return Response({
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": serializer.data
        }, status=status.HTTP_200_OK)

    def post(self, request, store_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        serializer = GoodsReceiptInputSerializer(
            data=request.data,
            context={"store": store, "request": request}
        )
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        supplier = val["supplier"]
        items_data = val["items"]

        with transaction.atomic():
            grn_number = generate_grn_number(store.organization, store)

            grn = GoodsReceipt.objects.create(
                organization=store.organization,
                store=store,
                supplier=supplier,
                grn_number=grn_number,
                supplier_invoice_number=val["supplier_invoice_number"],
                supplier_invoice_date=val["supplier_invoice_date"],
                receipt_date=val.get("receipt_date") or timezone.localdate(),
                notes=val.get("notes", ""),
                status="DRAFT",
                received_by=request.user
            )

            total_taxable = Decimal("0.00")
            total_tax = Decimal("0.00")
            total_amt = Decimal("0.00")

            for item_dict in items_data:
                product = item_dict["product"]
                snapshot = item_dict["packaging_snapshot"]
                sale_units = item_dict.get("quantity_sale_units", 0) or 0
                loose_units = item_dict.get("quantity_loose_base_units", 0) or 0
                total_base = (sale_units * snapshot.conversion_factor) + loose_units

                purchase_cost = item_dict["purchase_cost_per_sale_unit"]
                mrp = item_dict["mrp"]
                tax_rate = item_dict.get("tax_rate", Decimal("0.00")) or Decimal("0.00")

                unit_cost = (purchase_cost / Decimal(snapshot.conversion_factor)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                unit_mrp = (mrp / Decimal(snapshot.conversion_factor)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

                line_taxable = (Decimal(sale_units) * purchase_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                line_tax = (line_taxable * (tax_rate / Decimal("100.00"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                line_total = line_taxable + line_tax

                total_taxable += line_taxable
                total_tax += line_tax
                total_amt += line_total

                GoodsReceiptItem.objects.create(
                    goods_receipt=grn,
                    product=product,
                    packaging_snapshot=snapshot,
                    batch_number=item_dict["batch_number"],
                    expiry_date=item_dict["expiry_date"],
                    manufacturing_date=item_dict.get("manufacturing_date"),
                    quantity_sale_units=sale_units,
                    quantity_loose_base_units=loose_units,
                    total_base_units=total_base,
                    purchase_cost_per_sale_unit=purchase_cost,
                    unit_cost=unit_cost,
                    mrp=mrp,
                    unit_mrp=unit_mrp,
                    tax_rate=tax_rate,
                    tax_amount=line_tax,
                    total_cost=line_total,
                    intake_status=item_dict.get("intake_status", "VERIFIED"),
                    quarantine_reason=item_dict.get("quarantine_reason", "")
                )

            grn.total_taxable_amount = total_taxable
            grn.total_tax_amount = total_tax
            grn.total_amount = total_amt
            grn.save(update_fields=["total_taxable_amount", "total_tax_amount", "total_amount"])

        out_serializer = GoodsReceiptSerializer(grn, context={"request": request, "store": store})
        return Response(out_serializer.data, status=status.HTTP_201_CREATED)


class GoodsReceiptDetailView(APIView):
    """GET: Retrieve details of a Goods Receipt."""
    permission_classes = [IsAuthenticated, CanManageGoodsReceipts]

    def get(self, request, store_id, grn_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        grn = get_object_or_404(
            GoodsReceipt.objects.select_related("supplier", "store", "received_by", "posted_by").prefetch_related(
                "items", "items__product", "items__packaging_snapshot"
            ),
            id=grn_id,
            store=store
        )
        serializer = GoodsReceiptSerializer(grn, context={"request": request, "store": store})
        return Response(serializer.data, status=status.HTTP_200_OK)


class GoodsReceiptPostView(APIView):
    """
    POST: Atomically post a Goods Receipt to inventory ledger and stock balances.
    Enforces Idempotency-Key header, row locking, and RBAC (Owners / Store Managers only).
    """
    permission_classes = [IsAuthenticated, CanManageGoodsReceipts]

    def post(self, request, store_id, grn_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        # Enforce Owner / Assigned Store Manager authorization for posting
        if not is_user_org_owner(request.user, store.organization) and not is_user_assigned_store_manager(request.user, store):
            return Response(
                {"detail": "Only organization owners and assigned store managers can post goods receipts to inventory."},
                status=status.HTTP_403_FORBIDDEN
            )

        header_key = request.headers.get("Idempotency-Key") or request.META.get("HTTP_IDEMPOTENCY_KEY")
        body_key = request.data.get("idempotency_key") if hasattr(request.data, "get") else None

        if header_key and body_key and str(header_key).strip() != str(body_key).strip():
            return Response(
                {"detail": "Idempotency key in header does not match body."},
                status=status.HTTP_400_BAD_REQUEST
            )

        idempotency_key = header_key or body_key
        if not idempotency_key:
            return Response(
                {"detail": "Idempotency-Key header is required to post a goods receipt."},
                status=status.HTTP_400_BAD_REQUEST
            )

        grn = get_object_or_404(GoodsReceipt, id=grn_id, store=store)

        try:
            result_data, is_newly_created = StockLedgerService.post_goods_receipt(
                goods_receipt=grn,
                actor=request.user,
                idempotency_key=str(idempotency_key).strip(),
                raw_payload={"grn_id": str(grn.id), "store_id": str(store.id), "idempotency_key": str(idempotency_key)}
            )
            response_code = status.HTTP_200_OK if not is_newly_created else status.HTTP_200_OK
            return Response(result_data, status=response_code)

        except IdempotencyPayloadConflictError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except IdempotencyConflictError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_409_CONFLICT)
        except StorePermissionDeniedError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_403_FORBIDDEN)
        except (InvalidQuantityError, InvalidCostError, BatchValidationError) as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class GoodsReceiptCancelView(APIView):
    """POST: Cancel a draft or submitted Goods Receipt."""
    permission_classes = [IsAuthenticated, CanManageGoodsReceipts]

    def post(self, request, store_id, grn_id):
        store = get_object_or_404(Store.objects.select_related("organization"), id=store_id)
        self.check_object_permissions(request, store)

        grn = get_object_or_404(GoodsReceipt, id=grn_id, store=store)
        if grn.status == "POSTED":
            return Response({"detail": "Posted goods receipts cannot be cancelled. Use return procedures."}, status=status.HTTP_400_BAD_REQUEST)

        grn.status = "CANCELLED"
        grn.save(update_fields=["status", "updated_at"])
        return Response({"status": "success", "message": f"Goods receipt {grn.grn_number} cancelled."}, status=status.HTTP_200_OK)


# =============================================================================
# Milestone 2C.2: Inter-Store Stock Transfer Views
# =============================================================================

def generate_transfer_number(organization):
    """Generates a sequential human-readable transfer number: TRF-YYYYMMDD-XXXX."""
    today_str = timezone.localdate().strftime("%Y%m%d")
    prefix = f"TRF-{today_str}-"
    last_trf = StockTransfer.objects.filter(
        organization=organization,
        transfer_number__startswith=prefix
    ).order_by("-transfer_number").first()

    if last_trf and last_trf.transfer_number:
        try:
            seq = int(last_trf.transfer_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1

    return f"{prefix}{seq:04d}"


class StockTransferListCreateView(APIView):
    """
    GET: List stock transfers for the organization or a specific store branch.
    POST: Create a draft / requested stock transfer with items.
    """
    permission_classes = [IsAuthenticated, CanManageTransfers]

    def get(self, request):
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        qs = StockTransfer.objects.filter(organization=org).select_related(
            "source_store", "destination_store", "requested_by", "approved_by", "dispatched_by", "received_by"
        ).prefetch_related(
            "items", "items__product", "items__batch", "items__packaging_snapshot",
            "items__discrepancies", "discrepancies"
        )

        # Store-level filtering
        store_id = request.query_params.get("store_id")
        direction = request.query_params.get("direction", "").strip().lower()

        if store_id:
            store = get_object_or_404(Store, id=store_id, organization=org)
            if not is_user_org_owner(request.user, org) and not is_user_store_member(request.user, store):
                return Response({"detail": "You do not have permission to view transfers for this store."}, status=status.HTTP_403_FORBIDDEN)
            if direction == "in":
                qs = qs.filter(destination_store=store)
            elif direction == "out":
                qs = qs.filter(source_store=store)
            else:
                qs = qs.filter(Q(source_store=store) | Q(destination_store=store))
        else:
            if not is_user_org_owner(request.user, org):
                user_stores = StoreMembership.objects.filter(user=request.user, is_active=True).values_list("store_id", flat=True)
                qs = qs.filter(Q(source_store_id__in=user_stores) | Q(destination_store_id__in=user_stores))

        # Status filter
        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter:
            qs = qs.filter(status=status_filter)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(transfer_number__icontains=search) |
                Q(notes__icontains=search) |
                Q(source_store__name__icontains=search) |
                Q(destination_store__name__icontains=search)
            )

        qs = qs.order_by("-created_at")

        # Pagination
        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 20))), 100)
        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []
        serializer = StockTransferSerializer(items, many=True, context={"request": request})

        return Response({
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": serializer.data
        }, status=status.HTTP_200_OK)

    def post(self, request):
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        serializer = StockTransferInputSerializer(data=request.data, context={"organization": org, "request": request})
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        source_store = val["source_store"]
        dest_store = val["destination_store"]

        # Permission check: user must be member of source_store or org owner to initiate transfer
        if not is_user_org_owner(request.user, org) and not is_user_store_member(request.user, source_store):
            return Response(
                {"detail": "You do not have permission to initiate transfers from the source store."},
                status=status.HTTP_403_FORBIDDEN
            )

        items_data = val["items"]

        with transaction.atomic():
            transfer_number = generate_transfer_number(org)
            transfer = StockTransfer.objects.create(
                organization=org,
                source_store=source_store,
                destination_store=dest_store,
                transfer_number=transfer_number,
                status="SUBMITTED",
                notes=val.get("notes", ""),
                requested_by=request.user
            )

            for item_dict in items_data:
                product = item_dict["product"]
                batch = item_dict["batch"]
                snapshot = item_dict["packaging_snapshot"]
                qty_req = item_dict["quantity_requested"]

                unit_mrp = (batch.mrp / Decimal(snapshot.conversion_factor)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                latest_layer = BatchInwardCostLayer.objects.filter(
                    store=source_store, batch=batch
                ).order_by("-created_at").first()
                unit_cost = latest_layer.unit_cost if latest_layer else Decimal("0.0000")

                StockTransferItem.objects.create(
                    transfer=transfer,
                    product=product,
                    batch=batch,
                    packaging_snapshot=snapshot,
                    quantity_requested=qty_req,
                    quantity_dispatched=0,
                    quantity_received=0,
                    quantity_damaged=0,
                    quantity_missing=0,
                    quantity_excess=0,
                    unit_mrp=unit_mrp,
                    unit_cost=unit_cost,
                    status="PENDING"
                )

        out_serializer = StockTransferSerializer(transfer, context={"request": request})
        return Response(out_serializer.data, status=status.HTTP_201_CREATED)


class StockTransferDetailView(APIView):
    """GET: Retrieve details, line items, and discrepancies of a stock transfer."""
    permission_classes = [IsAuthenticated, CanManageTransfers]

    def get(self, request, transfer_id):
        org = get_user_organization(request.user)
        transfer = get_object_or_404(
            StockTransfer.objects.select_related(
                "source_store", "destination_store", "requested_by", "approved_by", "dispatched_by", "received_by"
            ).prefetch_related(
                "items", "items__product", "items__batch", "items__packaging_snapshot",
                "items__discrepancies", "discrepancies", "discrepancies__reported_by", "discrepancies__reviewed_by"
            ),
            id=transfer_id,
            organization=org
        )
        self.check_object_permissions(request, transfer)
        serializer = StockTransferSerializer(transfer, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class StockTransferDispatchView(APIView):
    """
    POST: Atomically dispatch a stock transfer.
    Deducts stock from source store on-hand balance, enters in-transit custody.
    Requires Idempotency-Key header and source Store Manager / Org Owner role.
    """
    permission_classes = [IsAuthenticated, CanManageTransfers]

    def post(self, request, transfer_id):
        org = get_user_organization(request.user)
        transfer = get_object_or_404(
            StockTransfer.objects.select_related("source_store", "destination_store", "organization"),
            id=transfer_id,
            organization=org
        )
        self.check_object_permissions(request, transfer)

        if not is_user_org_owner(request.user, org) and not is_user_assigned_store_manager(request.user, transfer.source_store):
            return Response(
                {"detail": "Only organization owners and assigned store managers of the source branch can dispatch transfers."},
                status=status.HTTP_403_FORBIDDEN
            )

        header_key = request.headers.get("Idempotency-Key") or request.META.get("HTTP_IDEMPOTENCY_KEY")
        body_key = request.data.get("idempotency_key") if hasattr(request.data, "get") else None

        if header_key and body_key and str(header_key).strip() != str(body_key).strip():
            return Response(
                {"detail": "Idempotency key in header does not match body."},
                status=status.HTTP_400_BAD_REQUEST
            )

        idempotency_key = header_key or body_key
        if not idempotency_key:
            return Response(
                {"detail": "Idempotency-Key header is required to dispatch a stock transfer."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            result_data, is_newly_created = StockLedgerService.dispatch_stock_transfer(
                transfer=transfer,
                actor=request.user,
                idempotency_key=str(idempotency_key).strip(),
                raw_payload={"transfer_id": str(transfer.id), "action": "dispatch", "idempotency_key": str(idempotency_key)}
            )
            return Response(result_data, status=status.HTTP_200_OK)

        except IdempotencyPayloadConflictError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except IdempotencyConflictError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_409_CONFLICT)
        except StorePermissionDeniedError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_403_FORBIDDEN)
        except (InvalidQuantityError, InvalidCostError, BatchValidationError) as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class StockTransferReceiveView(APIView):
    """
    POST: Atomically receive stock at the destination store branch.
    Credits verified stock to destination on-hand balance, generates FIFO cost layers,
    and isolates damaged, missing, or excess units into TransferDiscrepancy holds.
    Requires Idempotency-Key header and destination Store Manager / Org Owner role.
    """
    permission_classes = [IsAuthenticated, CanManageTransfers]

    def post(self, request, transfer_id):
        org = get_user_organization(request.user)
        transfer = get_object_or_404(
            StockTransfer.objects.select_related("source_store", "destination_store", "organization"),
            id=transfer_id,
            organization=org
        )
        self.check_object_permissions(request, transfer)

        if not is_user_org_owner(request.user, org) and not is_user_assigned_store_manager(request.user, transfer.destination_store):
            return Response(
                {"detail": "Only organization owners and assigned store managers of the destination branch can receive transfers."},
                status=status.HTTP_403_FORBIDDEN
            )

        header_key = request.headers.get("Idempotency-Key") or request.META.get("HTTP_IDEMPOTENCY_KEY")
        body_key = request.data.get("idempotency_key") if hasattr(request.data, "get") else None

        if header_key and body_key and str(header_key).strip() != str(body_key).strip():
            return Response(
                {"detail": "Idempotency key in header does not match body."},
                status=status.HTTP_400_BAD_REQUEST
            )

        idempotency_key = header_key or body_key
        if not idempotency_key:
            return Response(
                {"detail": "Idempotency-Key header is required to receive a stock transfer."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = StockTransferReceiptInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        receipt_lines = serializer.validated_data["receipt_lines"]

        try:
            result_data, is_newly_created = StockLedgerService.receive_stock_transfer(
                transfer=transfer,
                actor=request.user,
                idempotency_key=str(idempotency_key).strip(),
                receipt_lines=receipt_lines,
                raw_payload={"transfer_id": str(transfer.id), "receipt_lines": serializer.initial_data.get("receipt_lines", []), "idempotency_key": str(idempotency_key)}
            )
            return Response(result_data, status=status.HTTP_200_OK)

        except IdempotencyPayloadConflictError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except IdempotencyConflictError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_409_CONFLICT)
        except StorePermissionDeniedError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_403_FORBIDDEN)
        except (InvalidQuantityError, InvalidCostError, BatchValidationError) as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class StockTransferCancelView(APIView):
    """
    POST: Cancel a draft or submitted stock transfer before it has been dispatched.
    Once dispatched, transfers cannot be cancelled (must follow receipt / discrepancy process).
    """
    permission_classes = [IsAuthenticated, CanManageTransfers]

    def post(self, request, transfer_id):
        org = get_user_organization(request.user)
        transfer = get_object_or_404(
            StockTransfer.objects.select_related("source_store", "destination_store", "organization"),
            id=transfer_id,
            organization=org
        )
        self.check_object_permissions(request, transfer)

        if not is_user_org_owner(request.user, org) and not is_user_assigned_store_manager(request.user, transfer.source_store):
            return Response(
                {"detail": "Only organization owners and assigned store managers of the source branch can cancel transfers."},
                status=status.HTTP_403_FORBIDDEN
            )

        if transfer.status in ["DISPATCHED", "PARTIALLY_RECEIVED", "COMPLETED", "DISCREPANCY_HOLD"]:
            return Response(
                {"detail": f"Cannot cancel transfer in '{transfer.status}' status. Stock is already in transit or processed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if transfer.status == "CANCELLED":
            return Response({"status": "success", "message": f"Transfer {transfer.transfer_number} is already cancelled."}, status=status.HTTP_200_OK)

        reason = request.data.get("cancellation_reason", "").strip()
        transfer.status = "CANCELLED"
        transfer.cancellation_reason = reason
        transfer.save(update_fields=["status", "cancellation_reason", "updated_at"])

        return Response(
            {"status": "success", "message": f"Transfer {transfer.transfer_number} cancelled successfully."},
            status=status.HTTP_200_OK
        )


class TransferDiscrepancyResolveView(APIView):
    """
    POST: Resolve an in-transit transfer discrepancy.
    Requires resolution_decision and resolution_notes.
    Restricted to Org Owners and assigned Store Managers.
    """
    permission_classes = [IsAuthenticated, CanManageTransfers]

    def post(self, request, discrepancy_id):
        org = get_user_organization(request.user)
        discrepancy = get_object_or_404(
            TransferDiscrepancy.objects.select_related("transfer", "transfer__source_store", "transfer__destination_store"),
            id=discrepancy_id,
            transfer__organization=org
        )
        self.check_object_permissions(request, discrepancy)

        serializer = TransferDiscrepancyResolutionInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        try:
            result = StockLedgerService.resolve_transfer_discrepancy(
                discrepancy=discrepancy,
                actor=request.user,
                resolution_decision=val["resolution_decision"],
                resolution_notes=val["resolution_notes"]
            )
            return Response(result, status=status.HTTP_200_OK)
        except StorePermissionDeniedError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_403_FORBIDDEN)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


# =============================================================================
# Milestone 2C.3: Stock Adjustments & Physical Stock Count Views
# =============================================================================

def generate_adjustment_number(organization):
    """Generates sequential identifier: ADJ-YYYYMMDD-XXXX."""
    today_str = timezone.localdate().strftime("%Y%m%d")
    prefix = f"ADJ-{today_str}-"
    last_adj = StockAdjustment.objects.filter(
        organization=organization,
        adjustment_number__startswith=prefix
    ).order_by("-adjustment_number").first()

    if last_adj and last_adj.adjustment_number:
        try:
            seq = int(last_adj.adjustment_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1

    return f"{prefix}{seq:04d}"


def generate_count_number(organization):
    """Generates sequential identifier: CNT-YYYYMMDD-XXXX."""
    today_str = timezone.localdate().strftime("%Y%m%d")
    prefix = f"CNT-{today_str}-"
    last_cnt = PhysicalStockCount.objects.filter(
        organization=organization,
        count_number__startswith=prefix
    ).order_by("-count_number").first()

    if last_cnt and last_cnt.count_number:
        try:
            seq = int(last_cnt.count_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1

    return f"{prefix}{seq:04d}"


class StockAdjustmentListCreateView(APIView):
    """
    GET: List stock adjustments for the organization or specific store branch.
    POST: Create and submit a stock adjustment request.
    """
    permission_classes = [IsAuthenticated, CanManageAdjustments]

    def get(self, request):
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        qs = StockAdjustment.objects.filter(organization=org).select_related(
            "store", "product", "batch", "packaging_snapshot", "requested_by", "reviewed_by", "posted_by", "stock_movement"
        )

        store_id = request.query_params.get("store_id")
        if store_id:
            store = get_object_or_404(Store, id=store_id, organization=org)
            if not is_user_org_owner(request.user, org) and not is_user_store_member(request.user, store):
                return Response({"detail": "You do not have permission to view adjustments for this store."}, status=status.HTTP_403_FORBIDDEN)
            qs = qs.filter(store=store)
        else:
            if not is_user_org_owner(request.user, org):
                user_stores = StoreMembership.objects.filter(user=request.user, is_active=True).values_list("store_id", flat=True)
                qs = qs.filter(store_id__in=user_stores)

        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter:
            qs = qs.filter(status=status_filter)

        reason_filter = request.query_params.get("reason_code", "").strip().upper()
        if reason_filter:
            qs = qs.filter(reason_code=reason_filter)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(adjustment_number__icontains=search) |
                Q(product__name__icontains=search) |
                Q(batch__batch_number__icontains=search) |
                Q(explanation__icontains=search)
            )

        qs = qs.order_by("-created_at")

        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 20))), 100)
        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []
        serializer = StockAdjustmentSerializer(items, many=True, context={"request": request})

        return Response({
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": serializer.data
        }, status=status.HTTP_200_OK)

    def post(self, request):
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        serializer = StockAdjustmentInputSerializer(data=request.data, context={"organization": org, "request": request})
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        store = val["store"]

        if not is_user_org_owner(request.user, org) and not is_user_store_member(request.user, store):
            return Response({"detail": "You do not have permission to initiate adjustments for this store."}, status=status.HTTP_403_FORBIDDEN)

        product = val["product"]
        batch = val["batch"]
        snapshot = val["packaging_snapshot"]
        adj_qty = val["adjustment_quantity"]

        unit_cost = StockLedgerService.calculate_batch_unit_cost(store, batch)
        calculated_val = (Decimal(abs(adj_qty)) * unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        with transaction.atomic():
            adj_number = generate_adjustment_number(org)
            adjustment = StockAdjustment.objects.create(
                organization=org,
                store=store,
                adjustment_number=adj_number,
                product=product,
                batch=batch,
                packaging_snapshot=snapshot,
                system_quantity_at_request=val["current_on_hand"],
                adjustment_quantity=adj_qty,
                resulting_quantity=val["resulting_quantity"],
                reason_code=val["reason_code"],
                explanation=val["explanation"],
                status="SUBMITTED",
                unit_cost_basis=unit_cost,
                calculated_valuation=calculated_val,
                requested_by=request.user
            )

        out_serializer = StockAdjustmentSerializer(adjustment, context={"request": request})
        return Response(out_serializer.data, status=status.HTTP_201_CREATED)


class StockAdjustmentDetailView(APIView):
    """GET: Retrieve details of a specific stock adjustment."""
    permission_classes = [IsAuthenticated, CanManageAdjustments]

    def get(self, request, adjustment_id):
        org = get_user_organization(request.user)
        adjustment = get_object_or_404(
            StockAdjustment.objects.select_related(
                "store", "product", "batch", "packaging_snapshot", "requested_by", "reviewed_by", "posted_by", "stock_movement"
            ),
            id=adjustment_id,
            organization=org
        )
        self.check_object_permissions(request, adjustment)
        serializer = StockAdjustmentSerializer(adjustment, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class StockAdjustmentReviewView(APIView):
    """
    POST: Approve or reject a submitted stock adjustment.
    Enforces separation of duties and owner-only escalation rules.
    """
    permission_classes = [IsAuthenticated, CanManageAdjustments]

    def post(self, request, adjustment_id):
        org = get_user_organization(request.user)
        adjustment = get_object_or_404(
            StockAdjustment.objects.select_related("store", "organization", "requested_by"),
            id=adjustment_id,
            organization=org
        )
        self.check_object_permissions(request, adjustment)

        serializer = StockAdjustmentReviewInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        try:
            result = StockLedgerService.review_stock_adjustment(
                adjustment=adjustment,
                actor=request.user,
                decision=val["decision"],
                review_notes=val["review_notes"]
            )
            return Response(result, status=status.HTTP_200_OK)
        except StorePermissionDeniedError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_403_FORBIDDEN)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class StockAdjustmentPostView(APIView):
    """
    POST: Atomically post an approved stock adjustment to physical stock balances and ledger.
    Requires Idempotency-Key header and Owner / Store Manager authorization.
    """
    permission_classes = [IsAuthenticated, CanManageAdjustments]

    def post(self, request, adjustment_id):
        org = get_user_organization(request.user)
        adjustment = get_object_or_404(
            StockAdjustment.objects.select_related("store", "batch", "product", "organization"),
            id=adjustment_id,
            organization=org
        )
        self.check_object_permissions(request, adjustment)

        header_key = request.headers.get("Idempotency-Key") or request.META.get("HTTP_IDEMPOTENCY_KEY")
        body_key = request.data.get("idempotency_key") if hasattr(request.data, "get") else None

        if header_key and body_key and str(header_key).strip() != str(body_key).strip():
            return Response({"detail": "Idempotency key in header does not match body."}, status=status.HTTP_400_BAD_REQUEST)

        idempotency_key = header_key or body_key
        if not idempotency_key:
            return Response({"detail": "Idempotency-Key header is required to post a stock adjustment."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result_data, is_newly_created = StockLedgerService.post_stock_adjustment(
                adjustment=adjustment,
                actor=request.user,
                idempotency_key=str(idempotency_key).strip(),
                raw_payload={"adjustment_id": str(adjustment.id), "idempotency_key": str(idempotency_key)}
            )
            return Response(result_data, status=status.HTTP_200_OK)

        except IdempotencyPayloadConflictError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except IdempotencyConflictError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_409_CONFLICT)
        except StorePermissionDeniedError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_403_FORBIDDEN)
        except (InvalidQuantityError, InvalidCostError, BatchValidationError) as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class StockAdjustmentCancelView(APIView):
    """POST: Cancel a draft or submitted stock adjustment before posting."""
    permission_classes = [IsAuthenticated, CanManageAdjustments]

    def post(self, request, adjustment_id):
        org = get_user_organization(request.user)
        adjustment = get_object_or_404(StockAdjustment, id=adjustment_id, organization=org)
        self.check_object_permissions(request, adjustment)

        if not is_user_org_owner(request.user, org) and not is_user_assigned_store_manager(request.user, adjustment.store):
            if adjustment.requested_by_id != request.user.id:
                return Response({"detail": "Only the requester, store manager, or owner can cancel this adjustment."}, status=status.HTTP_403_FORBIDDEN)

        if adjustment.status in ["POSTED", "APPROVED"]:
            return Response({"detail": f"Cannot cancel adjustment with status '{adjustment.status}'."}, status=status.HTTP_400_BAD_REQUEST)

        adjustment.status = "CANCELLED"
        adjustment.save(update_fields=["status", "updated_at"])
        return Response({"status": "success", "message": f"Adjustment {adjustment.adjustment_number} cancelled."}, status=status.HTTP_200_OK)


class PhysicalStockCountListCreateView(APIView):
    """
    GET: List physical stock count sessions.
    POST: Initiate a new physical count session with inventory snapshot.
    """
    permission_classes = [IsAuthenticated, CanManageStockCounts]

    def get(self, request):
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        qs = PhysicalStockCount.objects.filter(organization=org).select_related(
            "store", "initiated_by", "submitted_by", "reviewed_by"
        ).prefetch_related("items", "items__product", "items__batch", "items__packaging_snapshot")

        store_id = request.query_params.get("store_id")
        if store_id:
            store = get_object_or_404(Store, id=store_id, organization=org)
            if not is_user_org_owner(request.user, org) and not is_user_store_member(request.user, store):
                return Response({"detail": "You do not have permission to view counts for this store."}, status=status.HTTP_403_FORBIDDEN)
            qs = qs.filter(store=store)
        else:
            if not is_user_org_owner(request.user, org):
                user_stores = StoreMembership.objects.filter(user=request.user, is_active=True).values_list("store_id", flat=True)
                qs = qs.filter(store_id__in=user_stores)

        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter:
            qs = qs.filter(status=status_filter)

        count_type = request.query_params.get("count_type", "").strip().upper()
        if count_type:
            qs = qs.filter(count_type=count_type)

        qs = qs.order_by("-created_at")

        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 20))), 100)
        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []
        serializer = PhysicalStockCountSerializer(items, many=True)

        return Response({
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": serializer.data
        }, status=status.HTTP_200_OK)

    def post(self, request):
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        serializer = PhysicalStockCountInputSerializer(data=request.data, context={"organization": org, "request": request})
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        store = val["store"]

        if not is_user_org_owner(request.user, org) and not is_user_store_member(request.user, store):
            return Response({"detail": "You do not have permission to initiate count sessions for this store."}, status=status.HTTP_403_FORBIDDEN)

        count_number = generate_count_number(org)
        session = StockLedgerService.start_physical_stock_count(
            store=store,
            actor=request.user,
            count_number=count_number,
            count_type=val["count_type"],
            batch_ids=val.get("batch_ids"),
            notes=val.get("notes", "")
        )

        out_serializer = PhysicalStockCountSerializer(session)
        return Response(out_serializer.data, status=status.HTTP_201_CREATED)


class PhysicalStockCountDetailView(APIView):
    """GET: Retrieve details, line items, and variances of a physical stock count."""
    permission_classes = [IsAuthenticated, CanManageStockCounts]

    def get(self, request, count_id):
        org = get_user_organization(request.user)
        count_session = get_object_or_404(
            PhysicalStockCount.objects.select_related("store", "initiated_by", "submitted_by", "reviewed_by").prefetch_related(
                "items", "items__product", "items__batch", "items__packaging_snapshot", "items__counted_by"
            ),
            id=count_id,
            organization=org
        )
        self.check_object_permissions(request, count_session)
        serializer = PhysicalStockCountSerializer(count_session)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PhysicalStockCountRecordView(APIView):
    """POST: Record counted quantities for items in a count session."""
    permission_classes = [IsAuthenticated, CanManageStockCounts]

    def post(self, request, count_id):
        org = get_user_organization(request.user)
        count_session = get_object_or_404(PhysicalStockCount, id=count_id, organization=org)
        self.check_object_permissions(request, count_session)

        serializer = PhysicalStockCountRecordInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = StockLedgerService.record_count_quantities(
                stock_count=count_session,
                actor=request.user,
                items_data=serializer.validated_data["items"]
            )
            return Response(result, status=status.HTTP_200_OK)
        except (InvalidQuantityError, StockLedgerError) as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class PhysicalStockCountReconcileView(APIView):
    """POST: Reconcile count items against intervening stock movements."""
    permission_classes = [IsAuthenticated, CanManageStockCounts]

    def post(self, request, count_id):
        org = get_user_organization(request.user)
        count_session = get_object_or_404(PhysicalStockCount, id=count_id, organization=org)
        self.check_object_permissions(request, count_session)

        if not is_user_org_owner(request.user, org) and not is_user_assigned_store_manager(request.user, count_session.store):
            return Response({"detail": "Only organization owners and assigned store managers can reconcile count sessions."}, status=status.HTTP_403_FORBIDDEN)

        try:
            result = StockLedgerService.reconcile_physical_stock_count(
                stock_count=count_session,
                actor=request.user
            )
            return Response(result, status=status.HTTP_200_OK)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class PhysicalStockCountGenerateAdjustmentsView(APIView):
    """POST: Generate formal StockAdjustment records for reconciled count variances."""
    permission_classes = [IsAuthenticated, CanManageStockCounts]

    def post(self, request, count_id):
        org = get_user_organization(request.user)
        count_session = get_object_or_404(PhysicalStockCount, id=count_id, organization=org)
        self.check_object_permissions(request, count_session)

        if not is_user_org_owner(request.user, org) and not is_user_assigned_store_manager(request.user, count_session.store):
            return Response({"detail": "Only organization owners and assigned store managers can generate adjustments from counts."}, status=status.HTTP_403_FORBIDDEN)

        try:
            adjustments = StockLedgerService.generate_adjustments_from_count(
                stock_count=count_session,
                actor=request.user
            )
            serializer = StockAdjustmentSerializer(adjustments, many=True, context={"request": request})
            return Response({
                "status": "success",
                "message": f"Generated {len(adjustments)} adjustment requests from count session {count_session.count_number}.",
                "adjustments_count": len(adjustments),
                "adjustments": serializer.data
            }, status=status.HTTP_201_CREATED)
        except StorePermissionDeniedError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_403_FORBIDDEN)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class AdjustmentApprovalPolicyView(APIView):
    """
    GET: Retrieve the active adjustment approval policy for organization or branch.
    POST: Configure approval thresholds (Owner only).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org = get_user_organization(request.user)
        if not org:
            return Response({"detail": "No active organization."}, status=status.HTTP_403_FORBIDDEN)

        store_id = request.query_params.get("store_id")
        policy = None
        if store_id:
            policy = AdjustmentApprovalPolicy.objects.filter(organization=org, store_id=store_id).first()
        if not policy:
            policy = AdjustmentApprovalPolicy.objects.filter(organization=org, store__isnull=True).first()

        if not policy:
            policy, _ = AdjustmentApprovalPolicy.objects.get_or_create(
                organization=org,
                store=None,
                defaults={
                    "require_owner_for_writeoff": True,
                    "is_configured": False
                }
            )

        serializer = AdjustmentApprovalPolicySerializer(policy)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        org = get_user_organization(request.user)
        if not is_user_org_owner(request.user, org):
            return Response({"detail": "Only organization owners can configure approval policies."}, status=status.HTTP_403_FORBIDDEN)

        store_id = request.data.get("store_id")
        store = None
        if store_id:
            store = get_object_or_404(Store, id=store_id, organization=org)

        policy, _ = AdjustmentApprovalPolicy.objects.get_or_create(
            organization=org,
            store=store
        )

        max_val = request.data.get("max_manager_adjustment_value")
        max_qty = request.data.get("max_manager_adjustment_quantity")
        req_writeoff = request.data.get("require_owner_for_writeoff", True)

        policy.max_manager_adjustment_value = Decimal(str(max_val)) if max_val is not None else None
        policy.max_manager_adjustment_quantity = int(max_qty) if max_qty is not None else None
        policy.require_owner_for_writeoff = bool(req_writeoff)
        policy.is_configured = True
        policy.save()

        serializer = AdjustmentApprovalPolicySerializer(policy)
        return Response(serializer.data, status=status.HTTP_200_OK)


# =============================================================================
# Milestone 2C.4: Quarantine, Expiry & Batch Recall Views
# =============================================================================

class StoreExpiryPolicyView(APIView):
    """
    GET: Retrieve the active near-expiry warning policy for store or organization.
    POST: Configure warning and critical threshold days (Owner only).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org = get_user_organization(request.user)
        if not org:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        store_id = request.query_params.get("store_id")
        store = None
        if store_id:
            store = get_object_or_404(Store, id=store_id, organization=org)

        policy = StockLedgerService.get_store_expiry_policy(store=store, organization=org)
        serializer = StoreExpiryPolicySerializer(policy)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        org = get_user_organization(request.user)
        if not is_user_org_owner(request.user, org):
            return Response({"detail": "Only organization owners can configure expiry policies."}, status=status.HTTP_403_FORBIDDEN)

        serializer = StoreExpiryPolicyInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        store_id = val.get("store_id")
        store = None
        if store_id:
            store = get_object_or_404(Store, id=store_id, organization=org)

        policy, _ = StoreExpiryPolicy.objects.get_or_create(
            organization=org,
            store=store,
            defaults={
                "warning_threshold_days": val["warning_threshold_days"],
                "critical_threshold_days": val["critical_threshold_days"],
            }
        )
        policy.warning_threshold_days = val["warning_threshold_days"]
        policy.critical_threshold_days = val["critical_threshold_days"]
        policy.save(update_fields=["warning_threshold_days", "critical_threshold_days", "updated_at"])

        out_serializer = StoreExpiryPolicySerializer(policy)
        return Response(out_serializer.data, status=status.HTTP_200_OK)


class BatchExpiryMonitoringView(APIView):
    """
    GET: List active batches across store(s) with dynamic expiry status computation:
    - 'EXPIRED': expiry_date <= today
    - 'CRITICAL_NEAR_EXPIRY': today < expiry_date <= today + critical_threshold_days
    - 'WARNING_NEAR_EXPIRY': today + critical < expiry_date <= today + warning_threshold_days
    - 'SAFE': expiry_date > today + warning_threshold_days
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        store_id = request.query_params.get("store_id")
        store = None
        if store_id:
            store = get_object_or_404(Store, id=store_id, organization=org)
            if not is_user_org_owner(request.user, org) and not is_user_store_member(request.user, store):
                return Response({"detail": "You do not have permission to view stock for this store."}, status=status.HTTP_403_FORBIDDEN)
            qs = StoreBatchStock.objects.filter(store=store)
        else:
            if is_user_org_owner(request.user, org):
                qs = StoreBatchStock.objects.filter(organization=org)
            else:
                user_stores = StoreMembership.objects.filter(user=request.user, is_active=True).values_list("store_id", flat=True)
                qs = StoreBatchStock.objects.filter(store_id__in=user_stores)

        qs = qs.select_related("store", "product", "batch", "batch__packaging_snapshot")

        # Search filter
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(batch__batch_number__icontains=search) |
                Q(product__name__icontains=search) |
                Q(product__sku__icontains=search)
            )

        # Recalled filter
        is_recalled = request.query_params.get("is_recalled")
        if is_recalled is not None and is_recalled != "":
            recalled_bool = is_recalled.lower() in ["true", "1"]
            qs = qs.filter(batch__is_recalled=recalled_bool)

        today = timezone.localdate()
        policy = StockLedgerService.get_store_expiry_policy(store=store, organization=org)
        warning_days = policy.warning_threshold_days
        critical_days = policy.critical_threshold_days

        status_filter = request.query_params.get("expiry_status", "").strip().upper()

        results = []
        for stock in qs.order_by("batch__expiry_date", "product__name"):
            st_code, days_left = stock.batch.get_expiry_status(
                warning_days=warning_days,
                critical_days=critical_days,
                today=today
            )
            if status_filter and status_filter != "ALL" and st_code != status_filter:
                continue

            results.append({
                "batch_id": str(stock.batch.id),
                "batch_number": stock.batch.batch_number,
                "product_id": str(stock.product.id),
                "product_name": stock.product.name,
                "sku": stock.product.sku,
                "store_id": str(stock.store.id),
                "store_name": stock.store.name,
                "expiry_date": stock.batch.expiry_date,
                "days_until_expiry": days_left,
                "expiry_status": st_code,
                "is_recalled": stock.batch.is_recalled,
                "quantity_on_hand": stock.quantity_on_hand,
                "quantity_quarantined": stock.quantity_quarantined,
                "available_quantity": stock.available_quantity,
                "mrp": stock.batch.mrp,
                "base_unit": stock.batch.packaging_snapshot.base_unit,
            })

        # Pagination
        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 20))), 100)
        paginator = Paginator(results, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []

        return Response({
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": items,
        }, status=status.HTTP_200_OK)


class FEFOBatchListView(APIView):
    """
    GET: Returns eligible candidate batches for a product at a store sorted by FEFO.
    Omits recalled, expired, or quarantine_review batches.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id, product_id):
        org = get_user_organization(request.user)
        store = get_object_or_404(Store, id=store_id, organization=org)
        if not is_user_org_owner(request.user, org) and not is_user_store_member(request.user, store):
            return Response({"detail": "You do not have permission to view stock for this store."}, status=status.HTTP_403_FORBIDDEN)

        required_qty = request.query_params.get("required_quantity")
        req_int = int(required_qty) if required_qty and required_qty.isdigit() else None

        candidates = StockLedgerService.get_fefo_batches_for_product(
            store=store,
            product_id=product_id,
            required_quantity=req_int
        )
        return Response({"results": candidates}, status=status.HTTP_200_OK)


class StockQuarantineListCreateView(APIView):
    """
    GET: List quarantine records for a store or organization.
    POST: Initiate a quarantine hold on on-hand stock.
    """
    permission_classes = [IsAuthenticated, CanManageQuarantine]

    def get(self, request):
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        store_id = request.query_params.get("store_id")
        if store_id:
            store = get_object_or_404(Store, id=store_id, organization=org)
            if not is_user_org_owner(request.user, org) and not is_user_store_member(request.user, store):
                return Response({"detail": "You do not have permission to view quarantine for this store."}, status=status.HTTP_403_FORBIDDEN)
            qs = StockQuarantineRecord.objects.filter(store=store)
        else:
            if is_user_org_owner(request.user, org):
                qs = StockQuarantineRecord.objects.filter(organization=org)
            else:
                user_stores = StoreMembership.objects.filter(user=request.user, is_active=True).values_list("store_id", flat=True)
                qs = StockQuarantineRecord.objects.filter(store_id__in=user_stores)

        qs = qs.select_related(
            "store", "product", "batch", "batch__packaging_snapshot", "quarantined_by", "released_by"
        )

        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter and status_filter != "ALL":
            qs = qs.filter(status=status_filter)

        reason_filter = request.query_params.get("reason_code", "").strip().upper()
        if reason_filter and reason_filter != "ALL":
            qs = qs.filter(reason_code=reason_filter)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(quarantine_number__icontains=search) |
                Q(batch__batch_number__icontains=search) |
                Q(product__name__icontains=search)
            )

        qs = qs.order_by("-quarantined_at")

        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 20))), 100)
        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []
        serializer = StockQuarantineRecordSerializer(items, many=True)

        return Response({
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": serializer.data,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        serializer = StockQuarantineInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        store = get_object_or_404(Store, id=val["store_id"], organization=org)
        batch = get_object_or_404(Batch, id=val["batch_id"], organization=org)

        if not is_user_org_owner(request.user, org) and not is_user_store_member(request.user, store):
            return Response({"detail": "You do not have permission to quarantine stock at this store."}, status=status.HTTP_403_FORBIDDEN)

        header_key = request.headers.get("Idempotency-Key") or request.META.get("HTTP_IDEMPOTENCY_KEY")

        try:
            result_data, is_new = StockLedgerService.quarantine_stock(
                store=store,
                batch=batch,
                quantity=val["quantity"],
                reason_code=val["reason_code"],
                notes=val.get("notes", ""),
                evidence_metadata=val.get("evidence_metadata", {}),
                actor=request.user,
                idempotency_key=str(header_key).strip() if header_key else None,
                raw_payload=request.data
            )
            return Response(result_data, status=status.HTTP_201_CREATED if is_new else status.HTTP_200_OK)
        except IdempotencyPayloadConflictError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except IdempotencyConflictError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_409_CONFLICT)
        except (InvalidQuantityError, BatchValidationError) as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class StockQuarantineDetailView(APIView):
    """GET: Retrieve details of an individual quarantine record."""
    permission_classes = [IsAuthenticated, CanManageQuarantine]

    def get(self, request, quarantine_id):
        org = get_user_organization(request.user)
        quar = get_object_or_404(
            StockQuarantineRecord.objects.select_related(
                "store", "product", "batch", "batch__packaging_snapshot", "quarantined_by", "released_by"
            ),
            id=quarantine_id,
            organization=org
        )
        self.check_object_permissions(request, quar)
        serializer = StockQuarantineRecordSerializer(quar)
        return Response(serializer.data, status=status.HTTP_200_OK)


class StockQuarantineReleaseView(APIView):
    """
    POST: Release quarantined stock back to active inventory.
    Requires Store Manager or Org Owner authorization.
    """
    permission_classes = [IsAuthenticated, CanManageQuarantine]

    def post(self, request, quarantine_id):
        org = get_user_organization(request.user)
        quar = get_object_or_404(
            StockQuarantineRecord.objects.select_related("store", "batch"),
            id=quarantine_id,
            organization=org
        )
        self.check_object_permissions(request, quar)

        if not is_user_org_owner(request.user, org) and not is_user_assigned_store_manager(request.user, quar.store):
            return Response({"detail": "Only organization owners and assigned store managers can release quarantined stock."}, status=status.HTTP_403_FORBIDDEN)

        serializer = StockQuarantineReleaseInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        try:
            result = StockLedgerService.release_quarantine(
                quarantine_record=quar,
                release_quantity=val["release_quantity"],
                release_reason=val["release_reason"],
                actor=request.user
            )
            return Response(result, status=status.HTTP_200_OK)
        except (InvalidQuantityError, BatchValidationError) as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class StockQuarantineDisposeView(APIView):
    """
    POST: Dispose quarantined stock by writing off or returning to supplier.
    Requires Store Manager or Org Owner authorization.
    """
    permission_classes = [IsAuthenticated, CanManageQuarantine]

    def post(self, request, quarantine_id):
        org = get_user_organization(request.user)
        quar = get_object_or_404(
            StockQuarantineRecord.objects.select_related("store", "batch"),
            id=quarantine_id,
            organization=org
        )
        self.check_object_permissions(request, quar)

        if not is_user_org_owner(request.user, org) and not is_user_assigned_store_manager(request.user, quar.store):
            return Response({"detail": "Only organization owners and assigned store managers can dispose quarantined stock."}, status=status.HTTP_403_FORBIDDEN)

        serializer = StockQuarantineDisposeInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        try:
            result = StockLedgerService.dispose_quarantine(
                quarantine_record=quar,
                disposition_type=val["disposition_type"],
                notes=val.get("notes", ""),
                actor=request.user
            )
            return Response(result, status=status.HTTP_200_OK)
        except (InvalidQuantityError, BatchValidationError) as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class BatchRecallListCreateView(APIView):
    """
    GET: List batch recalls for the organization.
    POST: Initiate an organization-wide batch recall (Owner only).
    """
    permission_classes = [IsAuthenticated, CanManageRecalls]

    def get(self, request):
        org = get_user_organization(request.user)
        if not org or not org.is_active:
            return Response({"detail": "User is not associated with an active organization."}, status=status.HTTP_403_FORBIDDEN)

        qs = BatchRecall.objects.filter(organization=org).select_related(
            "batch", "product", "batch__packaging_snapshot", "initiated_by", "closed_by"
        )

        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter and status_filter != "ALL":
            qs = qs.filter(status=status_filter)

        severity_filter = request.query_params.get("severity", "").strip().upper()
        if severity_filter and severity_filter != "ALL":
            qs = qs.filter(severity=severity_filter)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(recall_number__icontains=search) |
                Q(batch__batch_number__icontains=search) |
                Q(product__name__icontains=search) |
                Q(reason__icontains=search)
            )

        qs = qs.order_by("-initiated_at")

        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 20))), 100)
        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []
        serializer = BatchRecallSerializer(items, many=True)

        return Response({
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": serializer.data,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        org = get_user_organization(request.user)
        if not is_user_org_owner(request.user, org):
            return Response({"detail": "Only organization owners can initiate a batch recall."}, status=status.HTTP_403_FORBIDDEN)

        serializer = BatchRecallInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        batch = get_object_or_404(Batch, id=val["batch_id"], organization=org)

        try:
            recall = StockLedgerService.initiate_batch_recall(
                organization=org,
                batch=batch,
                source=val["source"],
                severity=val["severity"],
                reason=val["reason"],
                evidence_references=val.get("evidence_references", {}),
                actor=request.user,
                auto_quarantine_stock=val.get("auto_quarantine_stock", True)
            )
            out_serializer = BatchRecallSerializer(recall)
            return Response(out_serializer.data, status=status.HTTP_201_CREATED)
        except BatchValidationError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class BatchRecallDetailView(APIView):
    """GET: Retrieve detail of a batch recall notice."""
    permission_classes = [IsAuthenticated, CanManageRecalls]

    def get(self, request, recall_id):
        org = get_user_organization(request.user)
        recall = get_object_or_404(
            BatchRecall.objects.select_related(
                "batch", "product", "batch__packaging_snapshot", "initiated_by", "closed_by"
            ),
            id=recall_id,
            organization=org
        )
        self.check_object_permissions(request, recall)
        serializer = BatchRecallSerializer(recall)
        return Response(serializer.data, status=status.HTTP_200_OK)


class BatchRecallReleaseView(APIView):
    """
    POST: Release / lift a batch recall following official clearance.
    Strictly Organization Owner only.
    """
    permission_classes = [IsAuthenticated, CanManageRecalls]

    def post(self, request, recall_id):
        org = get_user_organization(request.user)
        recall = get_object_or_404(BatchRecall, id=recall_id, organization=org)
        self.check_object_permissions(request, recall)

        if not is_user_org_owner(request.user, org):
            return Response({"detail": "Only organization owners can release a batch recall."}, status=status.HTTP_403_FORBIDDEN)

        serializer = BatchRecallReleaseInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        try:
            result = StockLedgerService.release_batch_recall(
                recall=recall,
                resolution_notes=val["resolution_notes"],
                actor=request.user
            )
            return Response(result, status=status.HTTP_200_OK)
        except StorePermissionDeniedError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_403_FORBIDDEN)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)


class BatchRecallDisposeView(APIView):
    """
    POST: Dispose all recalled batch stock across branches.
    Routes to Supplier Return or Destruction Write-off.
    Requires Owner or assigned Store Manager authorization.
    """
    permission_classes = [IsAuthenticated, CanManageRecalls]

    def post(self, request, recall_id):
        org = get_user_organization(request.user)
        recall = get_object_or_404(BatchRecall, id=recall_id, organization=org)
        self.check_object_permissions(request, recall)

        serializer = BatchRecallDisposeInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Validation error", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        try:
            result = StockLedgerService.dispose_batch_recall(
                recall=recall,
                disposition_type=val["disposition_type"],
                notes=val.get("notes", ""),
                actor=request.user
            )
            return Response(result, status=status.HTTP_200_OK)
        except StockLedgerError as e:
            return Response({"detail": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)






# =============================================================================
# Milestone 2C: Stock Ledger & Command Overview Views
# =============================================================================

class StockMovementListView(APIView):
    """
    GET: Query immutable, append-only stock movement ledger transactions.
    Supports filtering by store, movement type, direction, batch, product, search, and date range.
    Enforces server-side cost masking for non-manager roles.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        org = get_user_organization(user)
        if not org:
            return Response(
                {"detail": "User is not associated with an active organization."},
                status=status.HTTP_403_FORBIDDEN
            )

        store_id = request.query_params.get("store_id")
        if store_id:
            store = get_object_or_404(
                Store.objects.select_related("organization"),
                id=store_id,
                organization=org
            )
            if not is_user_store_member(user, store):
                return Response(
                    {"detail": "You do not have permission to view stock for this store branch."},
                    status=status.HTTP_403_FORBIDDEN
                )
            qs = StockMovement.objects.filter(store=store)
        else:
            if is_user_org_owner(user, org):
                qs = StockMovement.objects.filter(organization=org)
            else:
                user_store_ids = StoreMembership.objects.filter(
                    user=user,
                    is_active=True
                ).values_list("store_id", flat=True)
                qs = StockMovement.objects.filter(store_id__in=user_store_ids)

        # Filters
        movement_type = request.query_params.get("movement_type", "").strip()
        if movement_type and movement_type != "ALL":
            qs = qs.filter(movement_type=movement_type)

        direction = request.query_params.get("direction", "").strip()
        if direction and direction != "ALL":
            qs = qs.filter(direction=direction)

        batch_id = request.query_params.get("batch_id", "").strip()
        if batch_id:
            qs = qs.filter(batch_id=batch_id)

        product_id = request.query_params.get("product_id", "").strip()
        if product_id:
            qs = qs.filter(product_id=product_id)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(product__name__icontains=search) |
                Q(product__sku__icontains=search) |
                Q(product__barcode__icontains=search) |
                Q(batch__batch_number__icontains=search) |
                Q(reference_id__icontains=search) |
                Q(reason__icontains=search)
            )

        date_from = request.query_params.get("date_from", "").strip()
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = request.query_params.get("date_to", "").strip()
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        qs = qs.select_related(
            "product",
            "batch",
            "batch__packaging_snapshot",
            "store",
            "actor"
        ).order_by("-created_at", "-id")

        page_num = max(1, int(request.query_params.get("page", 1)))
        page_size = min(max(1, int(request.query_params.get("page_size", 25))), 100)

        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages) if paginator.num_pages > 0 else []

        items = page_obj.object_list if hasattr(page_obj, "object_list") else []
        serializer = StockMovementSerializer(items, many=True, context={"request": request})

        return Response({
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_num,
            "page_size": page_size,
            "results": serializer.data
        }, status=status.HTTP_200_OK)


class InventoryOverviewView(APIView):
    """
    GET: Unified inventory command center overview.
    Aggregates KPIs, real-time stock metrics, action-required alert queues, and recent movements.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        org = get_user_organization(user)
        if not org:
            return Response(
                {"detail": "User is not associated with an active organization."},
                status=status.HTTP_403_FORBIDDEN
            )

        store_id = request.query_params.get("store_id", "").strip()
        if store_id:
            store = get_object_or_404(
                Store.objects.select_related("organization"),
                id=store_id,
                organization=org
            )
            if not is_user_store_member(user, store):
                return Response(
                    {"detail": "You do not have permission to view inventory for this store branch."},
                    status=status.HTTP_403_FORBIDDEN
                )
            stock_qs = StoreBatchStock.objects.filter(store=store)
            movements_qs = StockMovement.objects.filter(store=store)
            transfers_in = StockTransfer.objects.filter(destination_store=store)
            adjustments_qs = StockAdjustment.objects.filter(store=store)
            counts_qs = PhysicalStockCount.objects.filter(store=store)
            quarantine_qs = StockQuarantineRecord.objects.filter(store=store)
            grn_qs = GoodsReceipt.objects.filter(store=store)
        else:
            if is_user_org_owner(user, org):
                stock_qs = StoreBatchStock.objects.filter(organization=org)
                movements_qs = StockMovement.objects.filter(organization=org)
                transfers_in = StockTransfer.objects.filter(destination_store__organization=org)
                adjustments_qs = StockAdjustment.objects.filter(store__organization=org)
                counts_qs = PhysicalStockCount.objects.filter(store__organization=org)
                quarantine_qs = StockQuarantineRecord.objects.filter(store__organization=org)
                grn_qs = GoodsReceipt.objects.filter(store__organization=org)
            else:
                user_store_ids = StoreMembership.objects.filter(
                    user=user,
                    is_active=True
                ).values_list("store_id", flat=True)
                stock_qs = StoreBatchStock.objects.filter(store_id__in=user_store_ids)
                movements_qs = StockMovement.objects.filter(store_id__in=user_store_ids)
                transfers_in = StockTransfer.objects.filter(destination_store_id__in=user_store_ids)
                adjustments_qs = StockAdjustment.objects.filter(store_id__in=user_store_ids)
                counts_qs = PhysicalStockCount.objects.filter(store_id__in=user_store_ids)
                quarantine_qs = StockQuarantineRecord.objects.filter(store_id__in=user_store_ids)
                grn_qs = GoodsReceipt.objects.filter(store_id__in=user_store_ids)

        today = timezone.localdate()
        critical_date = today + timedelta(days=30)
        warning_date = today + timedelta(days=90)

        # 1. Aggregates
        stock_agg = stock_qs.aggregate(
            total_on_hand=Sum("quantity_on_hand"),
            total_quarantined=Sum("quantity_quarantined")
        )
        total_on_hand = stock_agg["total_on_hand"] or 0
        total_quarantined = stock_agg["total_quarantined"] or 0
        available_units = max(0, total_on_hand - total_quarantined)

        total_products = stock_qs.values("product_id").distinct().count()
        active_batches = stock_qs.filter(quantity_on_hand__gt=0).count()

        low_stock_count = stock_qs.filter(
            quantity_on_hand__lte=F("quantity_quarantined") + F("low_stock_threshold"),
            quantity_on_hand__gt=0
        ).count()
        expired_count = stock_qs.filter(
            batch__expiry_date__lte=today,
            quantity_on_hand__gt=0
        ).count()
        critical_near_expiry_count = stock_qs.filter(
            batch__expiry_date__gt=today,
            batch__expiry_date__lte=critical_date,
            quantity_on_hand__gt=0
        ).count()
        warning_near_expiry_count = stock_qs.filter(
            batch__expiry_date__gt=critical_date,
            batch__expiry_date__lte=warning_date,
            quantity_on_hand__gt=0
        ).count()

        active_quarantine_count = quarantine_qs.filter(status="ACTIVE").count()
        active_recalls_count = BatchRecall.objects.filter(
            organization=org,
            status__in=["INITIATED", "QUARANTINED_ALL"]
        ).count()

        pending_grn_count = grn_qs.filter(status__in=["DRAFT", "SUBMITTED"]).count()
        in_transit_transfers_count = transfers_in.filter(
            status__in=["DISPATCHED", "PARTIALLY_RECEIVED"]
        ).count()
        pending_adjustments_count = adjustments_qs.filter(status__in=["DRAFT", "SUBMITTED"]).count()
        active_counts_count = counts_qs.filter(
            status__in=["PLANNED", "IN_PROGRESS", "SUBMITTED", "RECOUNT_REQUIRED"]
        ).count()

        # 2. Action Queue items
        action_queue = []
        if active_recalls_count > 0:
            action_queue.append({
                "type": "RECALL",
                "severity": "CRITICAL",
                "title": f"{active_recalls_count} Active Batch Recall(s) Requiring Attention",
                "description": "Recalled batches must be quarantined or disposed across stores immediately.",
                "action_url": "/dashboard/recalls",
                "count": active_recalls_count,
            })
        if expired_count > 0:
            action_queue.append({
                "type": "EXPIRED",
                "severity": "CRITICAL",
                "title": f"{expired_count} Expired Batches in Store Stock",
                "description": "Stock past expiry cannot be dispensed and must be quarantined or written off.",
                "action_url": "/dashboard/batches?status=EXPIRED",
                "count": expired_count,
            })
        if in_transit_transfers_count > 0:
            action_queue.append({
                "type": "TRANSFER_RECEIPT",
                "severity": "WARNING",
                "title": f"{in_transit_transfers_count} Inward Transfer(s) In-Transit",
                "description": "Dispatched transfers are awaiting physical verification and receipt.",
                "action_url": "/dashboard/transfers",
                "count": in_transit_transfers_count,
            })
        if pending_adjustments_count > 0:
            action_queue.append({
                "type": "ADJUSTMENT_APPROVAL",
                "severity": "WARNING",
                "title": f"{pending_adjustments_count} Stock Adjustment(s) Pending Review",
                "description": "Submitted stock adjustments are waiting for manager or owner sign-off.",
                "action_url": "/dashboard/adjustments",
                "count": pending_adjustments_count,
            })
        if active_counts_count > 0:
            action_queue.append({
                "type": "STOCK_COUNT",
                "severity": "INFO",
                "title": f"{active_counts_count} Active Physical Stock Count Session(s)",
                "description": "Audit counting sessions in progress requiring recount or reconciliation.",
                "action_url": "/dashboard/counts",
                "count": active_counts_count,
            })
        if critical_near_expiry_count > 0:
            action_queue.append({
                "type": "NEAR_EXPIRY",
                "severity": "WARNING",
                "title": f"{critical_near_expiry_count} Batches Expiring Within 30 Days",
                "description": "Prioritize dispensing via FEFO or initiate return to supplier.",
                "action_url": "/dashboard/batches?status=CRITICAL_NEAR_EXPIRY",
                "count": critical_near_expiry_count,
            })
        if pending_grn_count > 0:
            action_queue.append({
                "type": "GRN_PENDING",
                "severity": "INFO",
                "title": f"{pending_grn_count} Goods Receipt Note(s) Pending Posting",
                "description": "Draft or submitted GRNs ready to be posted into inventory ledger.",
                "action_url": "/dashboard/purchases",
                "count": pending_grn_count,
            })

        # 3. Recent movements (last 8)
        recent_movements = movements_qs.select_related(
            "product",
            "batch",
            "batch__packaging_snapshot",
            "store",
            "actor"
        ).order_by("-created_at", "-id")[:8]

        recent_serializer = StockMovementSerializer(
            recent_movements,
            many=True,
            context={"request": request}
        )

        return Response({
            "kpis": {
                "total_products": total_products,
                "active_batches": active_batches,
                "total_on_hand_units": total_on_hand,
                "total_quarantined_units": total_quarantined,
                "available_units": available_units,
                "low_stock_count": low_stock_count,
                "expired_count": expired_count,
                "critical_near_expiry_count": critical_near_expiry_count,
                "warning_near_expiry_count": warning_near_expiry_count,
                "active_quarantine_count": active_quarantine_count,
                "active_recalls_count": active_recalls_count,
                "pending_grn_count": pending_grn_count,
                "in_transit_transfers_count": in_transit_transfers_count,
                "pending_adjustments_count": pending_adjustments_count,
                "active_counts_count": active_counts_count,
            },
            "action_queue": action_queue,
            "recent_movements": recent_serializer.data,
        }, status=status.HTTP_200_OK)
