from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from apps.organizations.models import OrganizationMembership
from apps.organizations.tenant_context import get_authoritative_organization
from apps.subscriptions.models import OrganizationSubscription
from apps.subscriptions.permissions import IsJanjeevanPartnerOwner
from apps.subscriptions.serializers import (
    OrganizationSubscriptionListSerializer,
    OrganizationSubscriptionDetailSerializer,
    SubscriptionPaymentSerializer,
    ManualPaymentConfirmSerializer,
    SubscriptionRenewalSerializer,
    CustomerSubscriptionSerializer,
)
from apps.subscriptions.services import (
    confirm_manual_payment,
    renew_subscription_365_days,
    get_subscription_metrics,
)


class StandardSubscriptionPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class PartnerSubscriptionListView(APIView):
    """
    GET: List all linked customer pharmacy subscriptions for Janjeevan Partner.
    Supports search, status filtering, and pagination.
    """
    permission_classes = [IsJanjeevanPartnerOwner]

    def get(self, request):
        partner = request.bound_partner
        search = request.query_params.get("search", "").strip()
        status_filter = request.query_params.get("status", "").strip().lower()

        now = timezone.now()
        qs = (
            OrganizationSubscription.objects.filter(partner=partner)
            .select_related("organization", "organization__owner")
            .prefetch_related("payments")
            .order_by("-created_at")
        )

        if search:
            qs = qs.filter(
                Q(organization__name__icontains=search)
                | Q(organization__slug__icontains=search)
                | Q(organization__owner__email__icontains=search)
                | Q(organization__owner__full_name__icontains=search)
            )

        if status_filter == "active":
            qs = qs.filter(
                status=OrganizationSubscription.Status.ACTIVE,
                current_period_end__gte=now,
            )
        elif status_filter == "trialing":
            qs = qs.filter(
                status=OrganizationSubscription.Status.TRIALING,
                current_period_end__gte=now,
            )
        elif status_filter == "expired":
            qs = qs.filter(
                Q(status=OrganizationSubscription.Status.EXPIRED)
                | Q(
                    status__in=[
                        OrganizationSubscription.Status.ACTIVE,
                        OrganizationSubscription.Status.TRIALING,
                    ],
                    current_period_end__lt=now,
                )
            )
        elif status_filter == "not_started":
            qs = qs.filter(status=OrganizationSubscription.Status.NOT_STARTED)
        elif status_filter == "grandfathered":
            qs = qs.filter(status=OrganizationSubscription.Status.GRANDFATHERED)

        paginator = StandardSubscriptionPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = OrganizationSubscriptionListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PartnerSubscriptionDetailView(APIView):
    """
    GET: Retrieve subscription details including complete payment history.
    """
    permission_classes = [IsJanjeevanPartnerOwner]

    def get(self, request, subscription_id):
        partner = request.bound_partner
        sub = get_object_or_404(
            OrganizationSubscription.objects.select_related(
                "organization", "organization__owner"
            ).prefetch_related("payments", "payments__confirmed_by"),
            id=subscription_id,
            partner=partner,
        )
        serializer = OrganizationSubscriptionDetailSerializer(sub)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PartnerSubscriptionConfirmPaymentView(APIView):
    """
    POST: Record manual payment and extend subscription validity by 365 days.
    """
    permission_classes = [IsJanjeevanPartnerOwner]

    def post(self, request, subscription_id):
        partner = request.bound_partner
        sub = get_object_or_404(
            OrganizationSubscription.objects.select_related("organization", "partner"),
            id=subscription_id,
            partner=partner,
        )

        serializer = ManualPaymentConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        try:
            payment, updated_sub = confirm_manual_payment(
                subscription=sub,
                amount=data["amount"],
                confirmed_by=request.user,
                currency=data.get("currency", "INR"),
                payment_reference=data.get("payment_reference", ""),
                notes=data.get("notes", ""),
            )
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "message": "Payment confirmed and subscription extended by 365 days.",
                "subscription": OrganizationSubscriptionListSerializer(updated_sub).data,
                "payment": SubscriptionPaymentSerializer(payment).data,
            },
            status=status.HTTP_200_OK,
        )


class PartnerSubscriptionRenewView(APIView):
    """
    POST: Renew a subscription for 365 days.
    """
    permission_classes = [IsJanjeevanPartnerOwner]

    def post(self, request, subscription_id):
        partner = request.bound_partner
        sub = get_object_or_404(
            OrganizationSubscription.objects.select_related("organization", "partner"),
            id=subscription_id,
            partner=partner,
        )

        serializer = SubscriptionRenewalSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        try:
            payment, updated_sub = renew_subscription_365_days(
                subscription=sub,
                user=request.user,
                notes=data.get("notes", ""),
                payment_reference=data.get("payment_reference", ""),
                amount=data.get("amount", 0),
                currency=data.get("currency", "INR"),
            )
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "message": "Subscription successfully renewed for 365 days.",
                "subscription": OrganizationSubscriptionListSerializer(updated_sub).data,
                "payment": SubscriptionPaymentSerializer(payment).data,
            },
            status=status.HTTP_200_OK,
        )


class PartnerSubscriptionMetricsView(APIView):
    """
    GET: Summary counts for partner subscriptions.
    """
    permission_classes = [IsJanjeevanPartnerOwner]

    def get(self, request):
        partner = request.bound_partner
        metrics = get_subscription_metrics(partner)
        return Response(metrics, status=status.HTTP_200_OK)


class CustomerSubscriptionView(APIView):
    """
    GET: Retrieve the active pharmacy organization's own subscription,
    including partner contact information and read-only payment history.
    Strictly read-only; payment confirmation and renewal are restricted
    to the Janjeevan Partner Owner.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        # Partner owners belong to the partner administration portal
        from apps.partners.models import PartnerMembership
        if (
            getattr(request, "active_partner", None)
            or PartnerMembership.objects.filter(user=user, role="partner_owner", is_active=True).exists()
        ):
            return Response(
                {"detail": "Partner owners manage subscriptions via the Partner Portal."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Resolve authoritative organization
        org = getattr(request, "active_organization", None)
        if not org:
            org = get_authoritative_organization(user, request=request)

        if not org:
            return Response(
                {"detail": "No active pharmacy organization found for this session."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Ensure user has valid active membership in this organization
        is_member = (
            org.owner_id == user.id
            or OrganizationMembership.objects.filter(
                organization=org, user=user, is_active=True
            ).exists()
        )
        if not is_member:
            return Response(
                {"detail": "You do not have active membership in this organization."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check for subscription
        sub = getattr(org, "subscription", None)
        if sub is None:
            sub = (
                OrganizationSubscription.objects.filter(organization=org)
                .select_related("partner", "organization")
                .prefetch_related("payments", "payments__confirmed_by")
                .first()
            )

        # Direct PharmaPro organisation or no partner subscription
        if not sub:
            return Response(
                {
                    "has_subscription": False,
                    "is_managed_by_partner": False,
                    "organization_id": str(org.id),
                    "organization_name": org.name,
                    "organization_slug": org.slug,
                    "message": "This organization operates on a direct PharmaPro platform license.",
                },
                status=status.HTTP_200_OK,
            )

        serializer = CustomerSubscriptionSerializer(sub)
        data = {
            "has_subscription": True,
            "is_managed_by_partner": True,
            **serializer.data,
        }
        return Response(data, status=status.HTTP_200_OK)
