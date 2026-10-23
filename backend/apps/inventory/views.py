from decimal import Decimal
from datetime import timedelta
from django.shortcuts import get_object_or_404
from django.db.models import Q, F, Sum
from django.utils import timezone
from django.core.paginator import Paginator, EmptyPage
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.organizations.models import Store
from apps.inventory.models import StoreBatchStock, BatchInwardCostLayer
from apps.inventory.services import StockLedgerService
from apps.inventory.serializers import OpeningStockInputSerializer, StoreStockItemSerializer
from apps.inventory.permissions import CanPostStoreOpeningStock, CanViewStoreStock, can_user_view_cost_data
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

        serializer = OpeningStockInputSerializer(
            data=request.data,
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

        qs = StoreBatchStock.objects.filter(
            store=store
        ).select_related(
            "product",
            "batch",
            "batch__packaging_snapshot",
            "store",
            "organization"
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
            qs = qs.filter(quantity_on_hand__lte=F("low_stock_threshold"))

        # 4. Near expiry filter (next 90 days)
        near_expiry = request.query_params.get("near_expiry", "").lower()
        if near_expiry in ["1", "true", "yes"]:
            today = timezone.localdate()
            qs = qs.filter(
                batch__expiry_date__gt=today,
                batch__expiry_date__lte=today + timedelta(days=90)
            )

        # 5. Expired filter
        expired = request.query_params.get("expired", "").lower()
        if expired in ["1", "true", "yes"]:
            qs = qs.filter(batch__expiry_date__lte=timezone.localdate())

        # 6. Deterministic ordering
        qs = qs.order_by("product__name", "batch__expiry_date", "id")

        # 7. Summary metrics calculation
        total_items = qs.count()
        today = timezone.localdate()

        # Compute aggregates across store stock
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

        # Calculate valuations if authorized
        if can_view_cost:
            total_val_cost = Decimal("0.00")
            total_val_retail = Decimal("0.00")
            for stock_row in qs:
                total_val_retail += Decimal(stock_row.quantity_on_hand) * stock_row.batch.unit_mrp
                # Match latest cost layer
                layer = BatchInwardCostLayer.objects.filter(
                    store=store,
                    batch=stock_row.batch
                ).order_by("-created_at").first()
                if layer:
                    total_val_cost += Decimal(stock_row.quantity_on_hand) * layer.unit_cost

            summary["total_valuation_cost"] = str(total_val_cost.quantize(Decimal("0.01")))
            summary["total_valuation_retail"] = str(total_val_retail.quantize(Decimal("0.01")))

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

