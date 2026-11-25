from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.organizations.models import OrganizationMembership
from apps.audit.models import AuditEvent
from apps.audit.serializers import AuditEventSerializer
from apps.organizations.tenant_context import get_authoritative_organization


class AuditListView(APIView):
    """
    GET: Returns organization audit activity.
    Restricted to organization owners within their authorized organization.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        active_org = get_authoritative_organization(request)
        if not active_org:
            return Response(
                {"detail": "No active organization found for this request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        owner_membership = OrganizationMembership.objects.filter(
            organization=active_org, user=user, role="owner", is_active=True
        ).exists()

        if not owner_membership:
            return Response(
                {"detail": "Only organization owners can access organization audit logs."},
                status=status.HTTP_403_FORBIDDEN,
            )

        event_type = request.query_params.get("event_type", "").strip()
        limit = int(request.query_params.get("limit", 50))

        qs = AuditEvent.objects.filter(
            organization=active_org
        ).select_related("user").order_by("-created_at")

        if event_type:
            qs = qs.filter(event_type=event_type)

        events = qs[:limit]
        serializer = AuditEventSerializer(events, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
