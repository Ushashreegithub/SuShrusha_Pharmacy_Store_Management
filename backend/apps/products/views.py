from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.paginator import Paginator, EmptyPage
from django.db.models import Q
from django.shortcuts import get_object_or_404

from apps.products.models import Product
from apps.products.serializers import (
    ProductListSerializer,
    ProductDetailSerializer,
    ProductCreateUpdateSerializer,
)
from apps.products.permissions import CanManageProducts, get_user_organization
from apps.audit.models import AuditEvent


class ProductMetadataView(APIView):
    """
    Returns choice definitions for categories, item types, dosage forms,
    prescription classes, units, and storage conditions for frontend dropdowns.
    """
    permission_classes = [IsAuthenticated, CanManageProducts]

    def get(self, request):
        return Response(
            {
                "categories": [{"value": k, "label": v} for k, v in Product.CATEGORY_CHOICES],
                "item_types": [{"value": k, "label": v} for k, v in Product.ITEM_TYPE_CHOICES],
                "dosage_forms": [{"value": k, "label": v} for k, v in Product.DOSAGE_FORM_CHOICES],
                "prescription_classes": [{"value": k, "label": v} for k, v in Product.PRESCRIPTION_CLASS_CHOICES],
                "units": [{"value": k, "label": v} for k, v in Product.UNIT_CHOICES],
                "storage_conditions": [{"value": k, "label": v} for k, v in Product.STORAGE_CHOICES],
            },
            status=status.HTTP_200_OK,
        )


class ProductListCreateView(APIView):
    """
    GET: List products for caller's organization with search, filtering, and pagination.
    POST: Create a new product scoped to caller's organization (Owner and Store Managers only).
    """
    permission_classes = [IsAuthenticated, CanManageProducts]

    def get(self, request):
        org = get_user_organization(request.user)
        if not org:
            return Response(
                {"detail": "No active pharmacy organization found for this account."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = Product.objects.filter(organization=org)

        # Filters
        status_filter = request.query_params.get("status", "active").strip().lower()
        if status_filter == "active":
            qs = qs.filter(is_active=True)
        elif status_filter == "archived":
            qs = qs.filter(is_active=False)
        # "all" does not filter by is_active

        category = request.query_params.get("category", "").strip()
        if category and category != "all":
            qs = qs.filter(category=category)

        item_type = request.query_params.get("item_type", "").strip()
        if item_type and item_type != "all":
            qs = qs.filter(item_type=item_type)

        dosage_form = request.query_params.get("dosage_form", "").strip()
        if dosage_form and dosage_form != "all":
            qs = qs.filter(dosage_form=dosage_form)

        prescription_class = request.query_params.get("prescription_class", "").strip()
        if prescription_class and prescription_class != "all":
            qs = qs.filter(prescription_class=prescription_class)

        # Search query across core fields
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(brand_name__icontains=search)
                | Q(generic_name__icontains=search)
                | Q(sku__icontains=search)
                | Q(barcode__icontains=search)
                | Q(manufacturer__icontains=search)
            )

        # Ordering
        ordering = request.query_params.get("ordering", "name").strip()
        allowed_orderings = ["name", "-name", "sku", "-sku", "created_at", "-created_at", "category", "-category"]
        if ordering in allowed_orderings:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("name")

        # Pagination
        try:
            page_size = min(max(int(request.query_params.get("page_size", 20)), 1), 100)
        except (ValueError, TypeError):
            page_size = 20

        try:
            page_number = max(int(request.query_params.get("page", 1)), 1)
        except (ValueError, TypeError):
            page_number = 1

        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page_number)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages if paginator.num_pages > 0 else 1)

        serializer = ProductListSerializer(page_obj.object_list, many=True)

        return Response(
            {
                "count": paginator.count,
                "total_pages": paginator.num_pages,
                "current_page": page_number,
                "page_size": page_size,
                "results": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        org = get_user_organization(request.user)
        if not org:
            return Response(
                {"detail": "No active pharmacy organization found for this account."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ProductCreateUpdateSerializer(
            data=request.data,
            context={"organization": org, "user": request.user}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        product = serializer.save()

        # Audit Event logging
        AuditEvent.log_event(
            event_type="PRODUCT_CREATED",
            request=request,
            user=request.user,
            organization=org,
            details={
                "product_id": str(product.id),
                "name": product.name,
                "sku": product.sku,
                "category": product.category,
                "item_type": product.item_type,
            },
        )

        return Response(ProductDetailSerializer(product).data, status=status.HTTP_201_CREATED)


class ProductDetailView(APIView):
    """
    GET: Retrieve full product details.
    PATCH: Update product attributes (Owner and Store Managers only).
    """
    permission_classes = [IsAuthenticated, CanManageProducts]

    def get_object(self, pk, organization):
        return get_object_or_404(Product, pk=pk, organization=organization)

    def get(self, request, pk):
        org = get_user_organization(request.user)
        if not org:
            return Response(
                {"detail": "No active pharmacy organization found for this account."},
                status=status.HTTP_403_FORBIDDEN,
            )

        product = self.get_object(pk, org)
        return Response(ProductDetailSerializer(product).data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        org = get_user_organization(request.user)
        if not org:
            return Response(
                {"detail": "No active pharmacy organization found for this account."},
                status=status.HTTP_403_FORBIDDEN,
            )

        product = self.get_object(pk, org)
        serializer = ProductCreateUpdateSerializer(
            instance=product,
            data=request.data,
            partial=True,
            context={"organization": org, "user": request.user}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated_product = serializer.save()

        AuditEvent.log_event(
            event_type="PRODUCT_UPDATED",
            request=request,
            user=request.user,
            organization=org,
            details={
                "product_id": str(updated_product.id),
                "name": updated_product.name,
                "sku": updated_product.sku,
                "updated_fields": list(request.data.keys()),
            },
        )

        return Response(ProductDetailSerializer(updated_product).data, status=status.HTTP_200_OK)


class ProductArchiveView(APIView):
    """
    POST: Archive / deactivate a product from active dispensing catalog.
    """
    permission_classes = [IsAuthenticated, CanManageProducts]

    def post(self, request, pk):
        org = get_user_organization(request.user)
        if not org:
            return Response(
                {"detail": "No active pharmacy organization found for this account."},
                status=status.HTTP_403_FORBIDDEN,
            )

        product = get_object_or_404(Product, pk=pk, organization=org)
        product.is_active = False
        product.updated_by = request.user
        product.save(update_fields=["is_active", "updated_by", "updated_at"])

        AuditEvent.log_event(
            event_type="PRODUCT_ARCHIVED",
            request=request,
            user=request.user,
            organization=org,
            details={"product_id": str(product.id), "name": product.name, "sku": product.sku},
        )

        return Response(
            {
                "message": f"Product '{product.name}' has been archived.",
                "id": str(product.id),
                "is_active": False,
            },
            status=status.HTTP_200_OK,
        )


class ProductReactivateView(APIView):
    """
    POST: Reactivate an archived product back into the active catalog.
    """
    permission_classes = [IsAuthenticated, CanManageProducts]

    def post(self, request, pk):
        org = get_user_organization(request.user)
        if not org:
            return Response(
                {"detail": "No active pharmacy organization found for this account."},
                status=status.HTTP_403_FORBIDDEN,
            )

        product = get_object_or_404(Product, pk=pk, organization=org)
        product.is_active = True
        product.updated_by = request.user
        product.save(update_fields=["is_active", "updated_by", "updated_at"])

        AuditEvent.log_event(
            event_type="PRODUCT_REACTIVATED",
            request=request,
            user=request.user,
            organization=org,
            details={"product_id": str(product.id), "name": product.name, "sku": product.sku},
        )

        return Response(
            {
                "message": f"Product '{product.name}' has been reactivated.",
                "id": str(product.id),
                "is_active": True,
            },
            status=status.HTTP_200_OK,
        )

