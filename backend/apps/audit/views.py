from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.organizations.models import OrganizationMembership
from apps.audit.models import AuditEvent
from apps.audit.serializers import AuditEventSerializer


class AuditListView(APIView):
    """
    GET: Returns organization audit activity.
    Restricted to organization owners.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        owner_membership = OrganizationMembership.objects.filter(
            user=user, role="owner", is_active=True
        ).first()

        if not owner_membership:
            return Response(
                {"detail": "Only organization owners can access organization audit logs."},
                status=status.HTTP_403_FORBIDDEN,
            )

        event_type = request.query_params.get("event_type", "").strip()
        limit = int(request.query_params.get("limit", 50))

        qs = AuditEvent.objects.filter(
            organization=owner_membership.organization
        ).select_related("user").order_by("-created_at")

        if event_type:
            qs = qs.filter(event_type=event_type)

        events = qs[:limit]
        serializer = AuditEventSerializer(events, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

