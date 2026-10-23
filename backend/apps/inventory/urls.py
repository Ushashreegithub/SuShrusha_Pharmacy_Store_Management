from django.urls import path
from apps.inventory.views import OpeningStockView, StoreStockListView

urlpatterns = [
    path("stores/<uuid:store_id>/opening-stock/", OpeningStockView.as_view(), name="store-opening-stock"),
    path("stores/<uuid:store_id>/stock/", StoreStockListView.as_view(), name="store-stock-list"),
]

