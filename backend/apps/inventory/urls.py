from django.urls import path
from apps.inventory.views import (
    OpeningStockView,
    StoreStockListView,
    SupplierListCreateView,
    SupplierDetailView,
    SupplierDeactivateView,
    GoodsReceiptListCreateView,
    GoodsReceiptDetailView,
    GoodsReceiptPostView,
    GoodsReceiptCancelView,
    StockTransferListCreateView,
    StockTransferDetailView,
    StockTransferDispatchView,
    StockTransferReceiveView,
    StockTransferCancelView,
    TransferDiscrepancyResolveView,
    StockAdjustmentListCreateView,
    StockAdjustmentDetailView,
    StockAdjustmentReviewView,
    StockAdjustmentPostView,
    StockAdjustmentCancelView,
    PhysicalStockCountListCreateView,
    PhysicalStockCountDetailView,
    PhysicalStockCountRecordView,
    PhysicalStockCountReconcileView,
    PhysicalStockCountGenerateAdjustmentsView,
    AdjustmentApprovalPolicyView,
    StoreExpiryPolicyView,
    BatchExpiryMonitoringView,
    FEFOBatchListView,
    StockQuarantineListCreateView,
    StockQuarantineDetailView,
    StockQuarantineReleaseView,
    StockQuarantineDisposeView,
    BatchRecallListCreateView,
    BatchRecallDetailView,
    BatchRecallReleaseView,
    BatchRecallDisposeView,
    StockMovementListView,
    InventoryOverviewView,
)

urlpatterns = [
    # Store opening stock & listing (Milestone 2B)
    path("stores/<uuid:store_id>/opening-stock/", OpeningStockView.as_view(), name="store-opening-stock"),
    path("stores/<uuid:store_id>/stock/", StoreStockListView.as_view(), name="store-stock-list"),

    # Supplier Master (Milestone 2C.1)
    path("suppliers/", SupplierListCreateView.as_view(), name="supplier-list-create"),
    path("suppliers/<uuid:supplier_id>/", SupplierDetailView.as_view(), name="supplier-detail"),
    path("suppliers/<uuid:supplier_id>/deactivate/", SupplierDeactivateView.as_view(), name="supplier-deactivate"),

    # Goods Receipt / Purchase Inward (Milestone 2C.1)
    path("stores/<uuid:store_id>/goods-receipts/", GoodsReceiptListCreateView.as_view(), name="goods-receipt-list-create"),
    path("stores/<uuid:store_id>/goods-receipts/<uuid:grn_id>/", GoodsReceiptDetailView.as_view(), name="goods-receipt-detail"),
    path("stores/<uuid:store_id>/goods-receipts/<uuid:grn_id>/post/", GoodsReceiptPostView.as_view(), name="goods-receipt-post"),
    path("stores/<uuid:store_id>/goods-receipts/<uuid:grn_id>/cancel/", GoodsReceiptCancelView.as_view(), name="goods-receipt-cancel"),

    # Inter-Store Stock Transfers (Milestone 2C.2)
    path("transfers/", StockTransferListCreateView.as_view(), name="transfer-list-create"),
    path("transfers/<uuid:transfer_id>/", StockTransferDetailView.as_view(), name="transfer-detail"),
    path("transfers/<uuid:transfer_id>/dispatch/", StockTransferDispatchView.as_view(), name="transfer-dispatch"),
    path("transfers/<uuid:transfer_id>/receive/", StockTransferReceiveView.as_view(), name="transfer-receive"),
    path("transfers/<uuid:transfer_id>/cancel/", StockTransferCancelView.as_view(), name="transfer-cancel"),
    path("transfers/discrepancies/<uuid:discrepancy_id>/resolve/", TransferDiscrepancyResolveView.as_view(), name="transfer-discrepancy-resolve"),

    # Stock Adjustments (Milestone 2C.3)
    path("adjustments/", StockAdjustmentListCreateView.as_view(), name="adjustment-list-create"),
    path("adjustments/<uuid:adjustment_id>/", StockAdjustmentDetailView.as_view(), name="adjustment-detail"),
    path("adjustments/<uuid:adjustment_id>/review/", StockAdjustmentReviewView.as_view(), name="adjustment-review"),
    path("adjustments/<uuid:adjustment_id>/post/", StockAdjustmentPostView.as_view(), name="adjustment-post"),
    path("adjustments/<uuid:adjustment_id>/cancel/", StockAdjustmentCancelView.as_view(), name="adjustment-cancel"),
    path("adjustment-policies/", AdjustmentApprovalPolicyView.as_view(), name="adjustment-policy"),

    # Physical Stock Count Sessions (Milestone 2C.3)
    path("stock-counts/", PhysicalStockCountListCreateView.as_view(), name="stock-count-list-create"),
    path("stock-counts/<uuid:count_id>/", PhysicalStockCountDetailView.as_view(), name="stock-count-detail"),
    path("stock-counts/<uuid:count_id>/record/", PhysicalStockCountRecordView.as_view(), name="stock-count-record"),
    path("stock-counts/<uuid:count_id>/reconcile/", PhysicalStockCountReconcileView.as_view(), name="stock-count-reconcile"),
    path("stock-counts/<uuid:count_id>/generate-adjustments/", PhysicalStockCountGenerateAdjustmentsView.as_view(), name="stock-count-generate-adjustments"),

    # Batch Safety, Expiry & FEFO (Milestone 2C.4)
    path("batch-monitoring/", BatchExpiryMonitoringView.as_view(), name="batch-expiry-monitoring"),
    path("stores/<uuid:store_id>/products/<uuid:product_id>/fefo/", FEFOBatchListView.as_view(), name="fefo-batch-list"),
    path("expiry-policies/", StoreExpiryPolicyView.as_view(), name="store-expiry-policy"),

    # Stock Quarantine Management (Milestone 2C.4)
    path("quarantine/", StockQuarantineListCreateView.as_view(), name="quarantine-list-create"),
    path("quarantine/<uuid:quarantine_id>/", StockQuarantineDetailView.as_view(), name="quarantine-detail"),
    path("quarantine/<uuid:quarantine_id>/release/", StockQuarantineReleaseView.as_view(), name="quarantine-release"),
    path("quarantine/<uuid:quarantine_id>/dispose/", StockQuarantineDisposeView.as_view(), name="quarantine-dispose"),

    # Batch Recall Management (Milestone 2C.4)
    path("recalls/", BatchRecallListCreateView.as_view(), name="recall-list-create"),
    path("recalls/<uuid:recall_id>/", BatchRecallDetailView.as_view(), name="recall-detail"),
    path("recalls/<uuid:recall_id>/release/", BatchRecallReleaseView.as_view(), name="recall-release"),
    path("recalls/<uuid:recall_id>/dispose/", BatchRecallDisposeView.as_view(), name="recall-dispose"),

    # Command Center & Stock Ledger (Milestone 2C)
    path("overview/", InventoryOverviewView.as_view(), name="inventory-overview"),
    path("movements/", StockMovementListView.as_view(), name="stock-movement-list"),
    path("ledger/", StockMovementListView.as_view(), name="stock-ledger-list"),
]

