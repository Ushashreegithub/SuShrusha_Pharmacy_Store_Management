from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny

from apps.authentication.models import User, hash_token
from apps.organizations.models import Store, StoreMembership, OrganizationMembership
from apps.invitations.models import EmployeeInvitation
from apps.audit.models import AuditEvent
from apps.authentication.services.email_service import EmailService
from apps.invitations.serializers import (
    CreateInvitationSerializer,
    InvitationDetailSerializer,
    AcceptInvitationSerializer,
)


class InvitationListCreateView(APIView):
    """
    GET: Returns invitations for organization (Owner) or assigned stores (Manager).
    POST: Issues a secure single-use invitation to a new staff member or manager.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        status_filter = request.query_params.get("status", "").strip()
        store_filter = request.query_params.get("store_id", "").strip()

        # Check Owner Scope
        owner_membership = OrganizationMembership.objects.filter(
            user=user, role="owner", is_active=True
        ).first()

        if owner_membership:
            qs = EmployeeInvitation.objects.filter(
                organization=owner_membership.organization
            ).select_related("store", "organization", "invited_by")

            if status_filter:
                qs = qs.filter(status=status_filter)
            if store_filter:
                qs = qs.filter(store_id=store_filter)

            serializer = InvitationDetailSerializer(qs, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # Check Manager Scope
        managed_stores = Store.objects.filter(
            memberships__user=user,
            memberships__role="manager",
            memberships__is_active=True,
        )

        if managed_stores.exists():
            qs = EmployeeInvitation.objects.filter(
                store__in=managed_stores
            ).select_related("store", "organization", "invited_by")

            if status_filter:
                qs = qs.filter(status=status_filter)
            if store_filter:
                qs = qs.filter(store_id=store_filter)

            serializer = InvitationDetailSerializer(qs, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        return Response(
            {"detail": "You do not have permission to view store invitations."},
            status=status.HTTP_403_FORBIDDEN,
        )

    def post(self, request):
        user = request.user
        serializer = CreateInvitationSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        store = serializer.validated_data["store"]
        org = serializer.validated_data["organization"]
        email = serializer.validated_data["email"]
        role = serializer.validated_data["role"]

        with transaction.atomic():
            invitation, raw_token = EmployeeInvitation.create_invitation(
                organization=org,
                store=store,
                invited_by=user,
                email=email,
                role=role,
                expiry_hours=24,
            )

            # Send email notification
            email_sent = EmailService.send_invitation_email(invitation, raw_token)

            # Audit event
            AuditEvent.log_event(
                event_type="INVITATION_CREATED",
                request=request,
                user=user,
                organization=org,
                details={
                    "invitation_id": str(invitation.id),
                    "recipient_email": email,
                    "store_id": str(store.id),
                    "store_name": store.name,
                    "role": role,
                    "email_dispatched": email_sent,
                },
            )

        resp_data = InvitationDetailSerializer(invitation).data
        resp_data["emailDispatched"] = email_sent
        return Response(resp_data, status=status.HTTP_201_CREATED)


class InvitationResendView(APIView):
    """
    POST: Revokes old token, issues fresh single-use token, resets expiry 24h, and resends email.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, invitation_id):
        user = request.user
        invitation = EmployeeInvitation.objects.filter(id=invitation_id).select_related("store", "organization").first()
        if not invitation:
            return Response({"detail": "Invitation record not found."}, status=status.HTTP_404_NOT_FOUND)

        store = invitation.store
        is_owner = OrganizationMembership.objects.filter(
            organization=store.organization, user=user, role="owner", is_active=True
        ).exists()
        is_mgr = StoreMembership.objects.filter(
            store=store, user=user, role="manager", is_active=True
        ).exists()

        if not is_owner and not is_mgr:
            return Response(
                {"detail": "You do not have permission to resend invitations for this store."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if invitation.status == "accepted":
            return Response(
                {"detail": "Cannot resend an invitation that has already been accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            fresh_invite, raw_token = EmployeeInvitation.create_invitation(
                organization=invitation.organization,
                store=invitation.store,
                invited_by=user,
                email=invitation.email,
                role=invitation.role,
                expiry_hours=24,
            )

            email_sent = EmailService.send_invitation_email(fresh_invite, raw_token)

            AuditEvent.log_event(
                event_type="INVITATION_RESENT",
                request=request,
                user=user,
                organization=store.organization,
                details={
                    "invitation_id": str(fresh_invite.id),
                    "recipient_email": fresh_invite.email,
                    "store_name": store.name,
                    "email_dispatched": email_sent,
                },
            )

        resp_data = InvitationDetailSerializer(fresh_invite).data
        resp_data["emailDispatched"] = email_sent
        return Response(resp_data, status=status.HTTP_200_OK)


class InvitationRevokeView(APIView):
    """
    POST: Revokes an active invitation.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, invitation_id):
        user = request.user
        invitation = EmployeeInvitation.objects.filter(id=invitation_id).select_related("store", "organization").first()
        if not invitation:
            return Response({"detail": "Invitation record not found."}, status=status.HTTP_404_NOT_FOUND)

        store = invitation.store
        is_owner = OrganizationMembership.objects.filter(
            organization=store.organization, user=user, role="owner", is_active=True
        ).exists()
        is_mgr = StoreMembership.objects.filter(
            store=store, user=user, role="manager", is_active=True
        ).exists()

        if not is_owner and not is_mgr:
            return Response(
                {"detail": "You do not have permission to revoke invitations for this store."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if invitation.status == "accepted":
            return Response(
                {"detail": "Cannot revoke an invitation that has already been accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            invitation.status = "revoked"
            invitation.save(update_fields=["status"])

            AuditEvent.log_event(
                event_type="INVITATION_REVOKED",
                request=request,
                user=user,
                organization=store.organization,
                details={
                    "invitation_id": str(invitation.id),
                    "recipient_email": invitation.email,
                    "store_name": store.name,
                },
            )

        return Response({"detail": "Invitation successfully revoked.", "status": "revoked"}, status=status.HTTP_200_OK)


class InvitationVerifyView(APIView):
    """
    GET: Validates an invitation token for the onboarding setup screen.
    Public endpoint.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        raw_token = request.query_params.get("token", "").strip()
        if not raw_token:
            return Response({"detail": "Missing invitation token.", "status": "invalid"}, status=status.HTTP_400_BAD_REQUEST)

        token_hash = hash_token(raw_token)
        invitation = EmployeeInvitation.objects.filter(token_hash=token_hash).select_related("store", "organization").first()

        if not invitation:
            return Response(
                {"detail": "Invalid or unrecognized invitation link.", "status": "invalid"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if invitation.status == "accepted":
            return Response(
                {"detail": "This invitation link has already been used.", "status": "used"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if invitation.status == "revoked":
            return Response(
                {"detail": "This invitation link has been revoked by the store administrator.", "status": "revoked"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.now() >= invitation.expires_at:
            if invitation.status == "pending":
                invitation.status = "expired"
                invitation.save(update_fields=["status"])
            return Response(
                {"detail": "This invitation link has expired (24-hour limit).", "status": "expired"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "status": "valid",
                "email": invitation.email,
                "role": invitation.role,
                "role_display": dict(invitation.ROLE_CHOICES).get(invitation.role, invitation.role),
                "store_name": invitation.store.name,
                "store_code": invitation.store.code,
                "organization_name": invitation.organization.name,
                "expires_at": invitation.expires_at.isoformat(),
            },
            status=status.HTTP_200_OK,
        )


class InvitationAcceptView(APIView):
    """
    POST: Sets password and completes invitation onboarding.
    Creates or updates User, sets email verified, creates StoreMembership, marks invitation accepted.
    Public endpoint.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        raw_token = serializer.validated_data["token"].strip()
        full_name = serializer.validated_data["fullName"].strip()
        password = serializer.validated_data["password"]

        token_hash = hash_token(raw_token)
        invitation = EmployeeInvitation.objects.filter(token_hash=token_hash).select_related("store", "organization").first()

        if not invitation:
            return Response({"detail": "Invalid invitation token."}, status=status.HTTP_404_NOT_FOUND)

        if invitation.status != "pending" or timezone.now() >= invitation.expires_at:
            return Response(
                {"detail": f"This invitation is no longer active (status: {invitation.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Create user or update existing
            user, created = User.objects.get_or_create(
                email=invitation.email,
                defaults={
                    "full_name": full_name,
                    "is_email_verified": True,
                },
            )

            # If user already existed, update password and verify email
            user.set_password(password)
            user.is_email_verified = True
            if full_name:
                user.full_name = full_name
            user.save()

            # Create or activate store membership
            membership, _ = StoreMembership.objects.update_or_create(
                store=invitation.store,
                user=user,
                defaults={"role": invitation.role, "is_active": True},
            )

            # If manager role, assign store manager field as well
            if invitation.role == "manager":
                invitation.store.manager = user
                invitation.store.save(update_fields=["manager", "updated_at"])

            # Mark invitation accepted
            invitation.status = "accepted"
            invitation.accepted_at = timezone.now()
            invitation.save(update_fields=["status", "accepted_at"])

            # Audit event
            AuditEvent.log_event(
                event_type="INVITATION_ACCEPTED",
                request=request,
                user=user,
                organization=invitation.organization,
                details={
                    "invitation_id": str(invitation.id),
                    "user_email": user.email,
                    "store_id": str(invitation.store.id),
                    "store_name": invitation.store.name,
                    "role": invitation.role,
                },
            )

        return Response(
            {
                "message": "Account setup complete. You can now sign in with your credentials.",
                "email": user.email,
                "role": invitation.role,
                "store_name": invitation.store.name,
            },
            status=status.HTTP_200_OK,
        )

