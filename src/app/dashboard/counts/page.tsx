"use client";

import React, { useEffect, useState } from "react";
import {
  ClipboardCheck,
  Plus,
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Package,
  Layers,
  FileText,
  AlertCircle,
  AlertTriangle,
  Check,
  ArrowRight,
  RotateCcw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  PhysicalStockCount,
  PhysicalStockCountItem,
  getPhysicalStockCountsApi,
  getPhysicalStockCountDetailApi,
  startPhysicalStockCountApi,
  recordStockCountQuantitiesApi,
  reconcilePhysicalStockCountApi,
  generateAdjustmentsFromCountApi,
  getStoreStockApi,
  extractList,
} from "@/lib/api";

export default function CountsPage() {
  return (
    <DashboardProvider>
      <CountsContent />
    </DashboardProvider>
  );
}

function CountsContent() {
  const { user, stores, activeStore } = useDashboard();

  // State
  const [counts, setCounts] = useState<PhysicalStockCount[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Modals
  const [selectedCount, setSelectedCount] = useState<PhysicalStockCount | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [startModalOpen, setStartModalOpen] = useState<boolean>(false);

  // Form States
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Start Count Form State
  const [targetStoreId, setTargetStoreId] = useState<string>("");
  const [countType, setCountType] = useState<"FULL_STORE" | "CYCLE_COUNT">("CYCLE_COUNT");
  const [countNotes, setCountNotes] = useState<string>("");
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [availableStock, setAvailableStock] = useState<any[]>([]);
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false);

  // Detail / Count Entry Form State
  const [countInputs, setCountInputs] = useState<Record<string, { counted_quantity: number | ""; notes: string }>>({});

  // Role permissions
  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";
  const canStartOrReconcile = isOwner || isManager;

  useEffect(() => {
    if (activeStore && !targetStoreId) {
      setTargetStoreId(activeStore.id);
    }
  }, [activeStore, targetStoreId]);

  useEffect(() => {
    if (startModalOpen && targetStoreId && countType === "CYCLE_COUNT") {
      fetchStoreStock(targetStoreId);
    }
  }, [startModalOpen, targetStoreId, countType]);

  const fetchStoreStock = async (storeId: string) => {
    setIsLoadingStock(true);
    try {
      const data = await getStoreStockApi(storeId, { page_size: 100 });
      setAvailableStock(extractList(data));
    } catch (err: any) {
      console.error("Failed to load store stock for count selection:", err);
    } finally {
      setIsLoadingStock(false);
    }
  };

  const loadCounts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = {
        page,
        page_size: pageSize,
      };
      if (activeStore) {
        params.store_id = activeStore.id;
      }
      if (statusFilter !== "ALL") {
        params.status = statusFilter;
      }
      if (typeFilter !== "ALL") {
        params.count_type = typeFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await getPhysicalStockCountsApi(params);
      setCounts(extractList(res));
      setTotalCount(res?.count || 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load stock count sessions.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCounts();
  }, [activeStore, statusFilter, typeFilter, page]);

  const handleOpenDetail = async (count: PhysicalStockCount) => {
    try {
      const fullDetail = await getPhysicalStockCountDetailApi(count.id);
      setSelectedCount(fullDetail);

      const initialInputs: Record<string, { counted_quantity: number | ""; notes: string }> = {};
      fullDetail.items.forEach((item) => {
        initialInputs[item.id] = {
          counted_quantity: item.counted_quantity !== null && item.counted_quantity !== undefined ? item.counted_quantity : "",
          notes: item.notes || "",
        };
      });
      setCountInputs(initialInputs);
      setDetailModalOpen(true);
    } catch (err: any) {
      setError(err?.message || "Failed to load count session details.");
    }
  };

  const handleStartCountSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStoreId) {
      setError("Please select a store.");
      return;
    }
    if (countType === "CYCLE_COUNT" && selectedBatchIds.length === 0) {
      setError("Please select at least one batch for a Cycle Count, or select 'Full Store Count'.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await startPhysicalStockCountApi({
        store_id: targetStoreId,
        count_type: countType,
        batch_ids: countType === "CYCLE_COUNT" ? selectedBatchIds : undefined,
        notes: countNotes.trim() || undefined,
      });

      setSuccessMessage("Stock count session initialized. Inventory snapshot captured successfully.");
      setStartModalOpen(false);
      setSelectedBatchIds([]);
      setCountNotes("");
      loadCounts();
    } catch (err: any) {
      setError(err?.message || "Failed to start stock count session.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveFloorCounts = async () => {
    if (!selectedCount) return;

    const itemsPayload: { item_id: string; counted_quantity: number; notes?: string }[] = [];
    for (const item of selectedCount.items) {
      const input = countInputs[item.id];
      if (input && input.counted_quantity !== "" && !isNaN(Number(input.counted_quantity))) {
        itemsPayload.push({
          item_id: item.id,
          counted_quantity: Number(input.counted_quantity),
          notes: input.notes || undefined,
        });
      }
    }

    if (itemsPayload.length === 0) {
      setError("Please enter counted physical quantities before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await recordStockCountQuantitiesApi(selectedCount.id, { items: itemsPayload });
      const refreshed = await getPhysicalStockCountDetailApi(selectedCount.id);
      setSelectedCount(refreshed);
      setSuccessMessage("Floor count quantities recorded successfully. Ready for movement reconciliation.");
      loadCounts();
    } catch (err: any) {
      setError(err?.message || "Failed to record count quantities.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReconcileMovements = async () => {
    if (!selectedCount) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await reconcilePhysicalStockCountApi(selectedCount.id);
      const refreshed = await getPhysicalStockCountDetailApi(selectedCount.id);
      setSelectedCount(refreshed);

      if (res.count_status === "RECOUNT_REQUIRED") {
        setError("Attention: One or more lines flagged with volatile negative balances. Recount required before adjustments can be generated.");
      } else {
        setSuccessMessage("Movement reconciliation completed successfully! Variances calculated against concurrent ledger movements.");
      }
      loadCounts();
    } catch (err: any) {
      setError(err?.message || "Failed to reconcile concurrent movements.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateAdjustments = async () => {
    if (!selectedCount) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await generateAdjustmentsFromCountApi(selectedCount.id);
      const refreshed = await getPhysicalStockCountDetailApi(selectedCount.id);
      setSelectedCount(refreshed);
      setSuccessMessage(
        `Generated ${res.adjustments_count} variance adjustment requests! You can review and approve them in the Stock Adjustments console.`
      );
      loadCounts();
    } catch (err: any) {
      setError(err?.message || "Failed to generate variance adjustments.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PLANNED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-300">Planned</span>;
      case "IN_PROGRESS":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">In Progress</span>;
      case "SUBMITTED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300">Submitted</span>;
      case "RECONCILED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">Reconciled</span>;
      case "COMPLETED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-800 border border-teal-300">Completed</span>;
      case "RECOUNT_REQUIRED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">Recount Req.</span>;
      case "CANCELLED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">Cancelled</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const getItemStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING_COUNT":
        return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">Pending</span>;
      case "COUNTED":
        return <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-medium">Counted</span>;
      case "RECONCILED":
        return <span className="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 font-medium">Reconciled</span>;
      case "ADJUSTED":
        return <span className="px-2 py-0.5 rounded text-xs bg-teal-100 text-teal-700 font-medium">Adjusted</span>;
      case "REJECTED":
        return <span className="px-2 py-0.5 rounded text-xs bg-rose-100 text-rose-700 font-medium">Recount Req</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  return (
    <DashboardLayout
      title="Count & Verify Stock"
      subtitle="Physical inventory audit sessions, assigned shelf counts, and variance reconciliation."
    >
      <div className="space-y-6">
        {/* Alerts */}
        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {successMessage && (
          <Alert variant="success" onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}

        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-[#0F766E]" />
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Stock Counts & Verification
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Audit physical quantities on pharmacy shelves, identify discrepancies, and reconcile balances.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadCounts}
              disabled={isLoading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {canStartOrReconcile && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setStartModalOpen(true)}
                className="flex items-center gap-1.5 bg-[#0F766E] hover:bg-[#115E59]"
              >
                <Plus className="h-4 w-4" />
                Start Count Session
              </Button>
            )}
          </div>
        </div>

        {/* Audit / Reconciliation Banner */}
        <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-teal-100/70 rounded-lg text-teal-800 mt-0.5">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-teal-950">
                Safe Real-Time Movement Reconciliation
              </h3>
              <p className="text-xs text-teal-800 mt-0.5">
                Physical tallies are automatically adjusted for intervening sales and receipts between snapshot time and count time. System inventory records are never blindly overwritten.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-teal-950 bg-white px-3 py-1.5 rounded-lg border border-teal-200 shadow-2xs shrink-0">
            <span className="font-semibold text-teal-900">Formula:</span>
            <code className="bg-teal-50 px-1.5 py-0.5 rounded text-[#0F766E] font-mono">
              Variance = Physical Count - (Snapshot + Net Movements)
            </code>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadCounts()}
                placeholder="Search count # or notes..."
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full py-1.5 px-3 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="SUBMITTED">Submitted (Counts Entered)</option>
                <option value="RECONCILED">Reconciled</option>
                <option value="COMPLETED">Completed</option>
                <option value="RECOUNT_REQUIRED">Recount Required</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full py-1.5 px-3 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                <option value="ALL">All Count Types</option>
                <option value="FULL_STORE">Full Store Count</option>
                <option value="CYCLE_COUNT">Cycle Count (Targeted)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={loadCounts}
                className="w-full text-xs"
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Count Sessions Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3">Session #</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Snapshot Timestamp</th>
                  <th className="px-4 py-3">Initiated By</th>
                  <th className="px-4 py-3 text-center">Items</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-600 mb-2" />
                      Loading count audit sessions...
                    </td>
                  </tr>
                ) : counts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      No stock count sessions found matching criteria.
                    </td>
                  </tr>
                ) : (
                  counts.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-indigo-600 whitespace-nowrap">
                        {c.count_number}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {c.store_name}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.count_type === "FULL_STORE" ? "bg-purple-100 text-purple-800" : "bg-sky-100 text-sky-800"}`}>
                          {c.count_type === "FULL_STORE" ? "Full Store" : "Cycle Count"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {c.snapshot_at ? new Date(c.snapshot_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                        {c.initiated_by_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                        <span className="font-semibold text-gray-800">{c.items_count}</span> items
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getStatusBadge(c.status)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDetail(c)}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Audit / Count
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <div>
              Showing {counts.length} of {totalCount} records
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * pageSize >= totalCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        {/* Start Count Session Modal */}
        {startModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-lg font-bold text-gray-900">
                    Initialize Physical Stock Count Session
                  </h3>
                </div>
                <button
                  onClick={() => setStartModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleStartCountSession} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Store Branch *
                  </label>
                  <select
                    value={targetStoreId}
                    onChange={(e) => setTargetStoreId(e.target.value)}
                    required
                    className="w-full text-sm rounded border border-gray-300 p-2 bg-white"
                  >
                    <option value="">-- Select Store --</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Count Scope *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-2 p-3 rounded border cursor-pointer ${
                        countType === "CYCLE_COUNT"
                          ? "border-indigo-600 bg-indigo-50"
                          : "border-gray-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="count_type"
                        value="CYCLE_COUNT"
                        checked={countType === "CYCLE_COUNT"}
                        onChange={() => setCountType("CYCLE_COUNT")}
                        className="mt-0.5 text-indigo-600"
                      />
                      <div>
                        <div className="text-xs font-bold text-gray-900">Cycle Count (Targeted)</div>
                        <div className="text-xs text-gray-500">
                          Select specific active batches or high-value lots to count.
                        </div>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-2 p-3 rounded border cursor-pointer ${
                        countType === "FULL_STORE"
                          ? "border-indigo-600 bg-indigo-50"
                          : "border-gray-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="count_type"
                        value="FULL_STORE"
                        checked={countType === "FULL_STORE"}
                        onChange={() => setCountType("FULL_STORE")}
                        className="mt-0.5 text-indigo-600"
                      />
                      <div>
                        <div className="text-xs font-bold text-gray-900">Full Store Audit</div>
                        <div className="text-xs text-gray-500">
                          Snapshots all active batches across the selected branch.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {countType === "CYCLE_COUNT" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Select Batches for Cycle Count ({selectedBatchIds.length} selected)
                    </label>
                    {isLoadingStock ? (
                      <div className="p-4 text-center text-xs text-gray-500 border rounded">
                        <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1 text-indigo-600" />
                        Loading branch batches...
                      </div>
                    ) : availableStock.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500 border rounded bg-gray-50">
                        No active stock found for this store.
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded divide-y divide-gray-100 text-xs">
                        {availableStock.map((item) => {
                          const isSelected = selectedBatchIds.includes(item.batch_id);
                          return (
                            <div
                              key={item.batch_id}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedBatchIds(selectedBatchIds.filter((id) => id !== item.batch_id));
                                } else {
                                  setSelectedBatchIds([...selectedBatchIds, item.batch_id]);
                                }
                              }}
                              className={`p-2 flex items-center justify-between cursor-pointer ${
                                isSelected ? "bg-indigo-50 font-medium" : "hover:bg-gray-50"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded text-indigo-600"
                                />
                                <div>
                                  <div className="text-gray-900">{item.product_name}</div>
                                  <div className="text-gray-500 text-[11px]">
                                    Batch: {item.batch_number} • Exp: {item.expiry_date}
                                  </div>
                                </div>
                              </div>
                              <div className="text-gray-700">
                                On-hand: <span className="font-semibold">{item.physical_quantity}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Session Audit Notes
                  </label>
                  <textarea
                    rows={2}
                    value={countNotes}
                    onChange={(e) => setCountNotes(e.target.value)}
                    placeholder="e.g., Monthly narcotics count, annual store inventory verification..."
                    className="w-full text-sm rounded border border-gray-300 p-2"
                  />
                </div>

                <div className="p-3 bg-amber-50 rounded border border-amber-200 text-xs text-amber-800">
                  <div className="font-semibold flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-4 w-4" />
                    Snapshot Freezing Note
                  </div>
                  System stock quantities will be frozen at the exact time of session initialization. Concurrent sales and receipts will be dynamically reconciled when counting completes.
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStartModalOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSubmitting}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {isSubmitting ? "Initializing Snapshot..." : "Initialize Count Session"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Count Session Detail / Count Entry Modal */}
        {detailModalOpen && selectedCount && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-start justify-between border-b pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-gray-900">
                      {selectedCount.count_number}
                    </span>
                    {getStatusBadge(selectedCount.status)}
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                      {selectedCount.count_type === "FULL_STORE" ? "Full Store" : "Cycle Count"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>Store: <strong className="text-gray-700">{selectedCount.store_name}</strong></span>
                    <span>Initiated By: <strong className="text-gray-700">{selectedCount.initiated_by_name || "—"}</strong></span>
                    <span>Snapshot Time: <strong className="text-gray-700">{selectedCount.snapshot_at ? new Date(selectedCount.snapshot_at).toLocaleString() : "—"}</strong></span>
                    {selectedCount.reviewed_at && (
                      <span>Reconciled: <strong className="text-gray-700">{new Date(selectedCount.reviewed_at).toLocaleString()}</strong></span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setDetailModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  &times;
                </button>
              </div>

              {/* Workflow Stepper */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className={`p-2 rounded border ${
                  ["PLANNED", "IN_PROGRESS", "SUBMITTED", "RECONCILED", "COMPLETED"].includes(selectedCount.status)
                    ? "bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold"
                    : "bg-gray-50 border-gray-200 text-gray-500"
                }`}>
                  1. Snapshot Taken
                </div>
                <div className={`p-2 rounded border ${
                  ["SUBMITTED", "RECONCILED", "COMPLETED"].includes(selectedCount.status)
                    ? "bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold"
                    : selectedCount.status === "IN_PROGRESS"
                    ? "bg-blue-50 border-blue-400 text-blue-900 font-bold animate-pulse"
                    : "bg-gray-50 border-gray-200 text-gray-500"
                }`}>
                  2. Floor Counts Entered
                </div>
                <div className={`p-2 rounded border ${
                  ["RECONCILED", "COMPLETED"].includes(selectedCount.status)
                    ? "bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold"
                    : selectedCount.status === "SUBMITTED"
                    ? "bg-indigo-100 border-indigo-400 text-indigo-900 font-bold"
                    : selectedCount.status === "RECOUNT_REQUIRED"
                    ? "bg-amber-100 border-amber-400 text-amber-900 font-bold"
                    : "bg-gray-50 border-gray-200 text-gray-500"
                }`}>
                  3. Reconciled Movements
                </div>
                <div className={`p-2 rounded border ${
                  selectedCount.status === "COMPLETED"
                    ? "bg-teal-50 border-teal-300 text-teal-900 font-semibold"
                    : "bg-gray-50 border-gray-200 text-gray-500"
                }`}>
                  4. Adjustments Posted
                </div>
              </div>

              {/* Status Notes / Alerts */}
              {selectedCount.status === "RECOUNT_REQUIRED" && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                  <div className="font-bold flex items-center gap-1.5 mb-1 text-amber-900">
                    <AlertTriangle className="h-4 w-4" />
                    Recount Required: High-Volatility Or Negative Balance Detected
                  </div>
                  One or more items experienced concurrent movements that would result in negative physical stock if accepted. Please physically re-verify counts for flagged items below and submit revised quantities.
                </div>
              )}

              {/* Count Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                    Count Items & Reconciliation Lines ({selectedCount.items.length})
                  </h4>
                  <div className="text-xs text-gray-500">
                    Snapshot Benchmark: <strong className="text-gray-800">{selectedCount.snapshot_at ? new Date(selectedCount.snapshot_at).toLocaleTimeString() : "—"}</strong>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-72">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500 font-semibold sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Product / Batch</th>
                        <th className="px-3 py-2 text-center">Snapshot Qty</th>
                        <th className="px-3 py-2 text-center">Counted Qty</th>
                        <th className="px-3 py-2 text-center">Intervening Net</th>
                        <th className="px-3 py-2 text-center">Reconciled System</th>
                        <th className="px-3 py-2 text-center">Variance</th>
                        <th className="px-3 py-2 text-center">Status</th>
                        <th className="px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedCount.items.map((item) => {
                        const canEditCount = ["IN_PROGRESS", "RECOUNT_REQUIRED"].includes(selectedCount.status);
                        const variance = item.variance_quantity;
                        const inputVal = countInputs[item.id]?.counted_quantity ?? "";

                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <div className="font-semibold text-gray-900">{item.product_name}</div>
                              <div className="text-[11px] text-gray-500">
                                SKU: {item.sku} • Batch: <span className="font-mono text-indigo-700 font-medium">{item.batch_number}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center font-medium text-gray-800">
                              {item.snapshot_system_quantity}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {canEditCount ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={inputVal}
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? "" : Number(e.target.value);
                                    setCountInputs({
                                      ...countInputs,
                                      [item.id]: {
                                        ...countInputs[item.id],
                                        counted_quantity: val,
                                      },
                                    });
                                  }}
                                  placeholder="Floor qty"
                                  className="w-20 text-center py-1 px-1.5 border border-indigo-300 rounded font-semibold text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                                />
                              ) : (
                                <span className="font-semibold text-gray-900">
                                  {item.counted_quantity !== null ? item.counted_quantity : "—"}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-gray-600">
                              {item.intervening_movement_quantity !== 0 ? (
                                <span className={item.intervening_movement_quantity > 0 ? "text-emerald-700 font-medium" : "text-rose-700 font-medium"}>
                                  {item.intervening_movement_quantity > 0 ? `+${item.intervening_movement_quantity}` : item.intervening_movement_quantity}
                                </span>
                              ) : (
                                "0"
                              )}
                            </td>
                            <td className="px-3 py-2 text-center font-medium text-gray-800">
                              {item.reconciled_system_quantity !== null ? item.reconciled_system_quantity : "—"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {variance !== null && variance !== undefined ? (
                                variance === 0 ? (
                                  <span className="text-gray-400 font-semibold">0 (Exact)</span>
                                ) : variance > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                                    <TrendingUp className="h-3 w-3" />
                                    +{variance}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded">
                                    <TrendingDown className="h-3 w-3" />
                                    {variance}
                                  </span>
                                )
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {getItemStatusBadge(item.status)}
                            </td>
                            <td className="px-3 py-2">
                              {canEditCount ? (
                                <input
                                  type="text"
                                  value={countInputs[item.id]?.notes || ""}
                                  onChange={(e) => {
                                    setCountInputs({
                                      ...countInputs,
                                      [item.id]: {
                                        ...countInputs[item.id],
                                        notes: e.target.value,
                                      },
                                    });
                                  }}
                                  placeholder="Notes..."
                                  className="w-full text-xs py-0.5 px-1.5 border border-gray-200 rounded text-gray-700"
                                />
                              ) : (
                                <span className="text-gray-500 text-[11px]">{item.notes || "—"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t">
                <div className="flex items-center gap-2">
                  {/* Step 2: Record / Save Floor Counts */}
                  {["IN_PROGRESS", "RECOUNT_REQUIRED"].includes(selectedCount.status) && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveFloorCounts}
                      disabled={isSubmitting}
                      className="bg-indigo-600 hover:bg-indigo-700 text-xs flex items-center gap-1"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {isSubmitting ? "Saving..." : "Submit Floor Counts"}
                    </Button>
                  )}

                  {/* Step 3: Reconcile Concurrent Movements */}
                  {["SUBMITTED", "RECOUNT_REQUIRED"].includes(selectedCount.status) && canStartOrReconcile && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleReconcileMovements}
                      disabled={isSubmitting}
                      className="bg-purple-600 hover:bg-purple-700 text-xs flex items-center gap-1"
                    >
                      <RotateCcw className={`h-3.5 w-3.5 ${isSubmitting ? "animate-spin" : ""}`} />
                      {isSubmitting ? "Reconciling..." : "Reconcile Concurrent Movements"}
                    </Button>
                  )}

                  {/* Step 4: Generate Variance Adjustments */}
                  {selectedCount.status === "RECONCILED" && canStartOrReconcile && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleGenerateAdjustments}
                      disabled={isSubmitting}
                      className="bg-teal-600 hover:bg-teal-700 text-xs flex items-center gap-1"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      {isSubmitting ? "Generating..." : "Generate Variance Adjustments"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

