from rest_framework import serializers
from apps.audit.models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    user_email = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "event_type",
            "user",
            "user_email",
            "user_name",
            "ip_address",
            "details",
            "created_at",
        ]
        read_only_fields = fields

    def get_user_email(self, obj):
        return obj.user.email if obj.user else "System"

    def get_user_name(self, obj):
        return obj.user.full_name if obj.user else "System Operation"

