from django.urls import path
from apps.invitations.views import (
    InvitationListCreateView,
    InvitationResendView,
    InvitationRevokeView,
    InvitationVerifyView,
    InvitationAcceptView,
)

urlpatterns = [
    path("", InvitationListCreateView.as_view(), name="invitation-list-create"),
    path("verify/", InvitationVerifyView.as_view(), name="invitation-verify"),
    path("accept/", InvitationAcceptView.as_view(), name="invitation-accept"),
    path("<uuid:invitation_id>/resend/", InvitationResendView.as_view(), name="invitation-resend"),
    path("<uuid:invitation_id>/revoke/", InvitationRevokeView.as_view(), name="invitation-revoke"),
]

