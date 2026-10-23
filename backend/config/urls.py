from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def health_check(request):
    return JsonResponse(
        {
            "status": "healthy",
            "service": "Sushrusha Pharmacy Store Management API",
            "version": "1.0.0",
        }
    )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="api-health"),
    path("api/auth/", include("apps.authentication.urls")),
    path("api/organizations/", include("apps.organizations.urls")),
    path("api/audit/", include("apps.audit.urls")),
]
