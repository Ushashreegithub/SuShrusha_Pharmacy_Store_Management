"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
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
  Check,
  Ban,
  ArrowRight,
  TrendingDown,
  Trash2,
  Truck,
  ShieldAlert,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  BatchRecall,
  getBatchRecallsApi,
  getBatchRecallDetailApi,
  initiateBatchRecallApi,
  releaseBatchRecallApi,
  disposeBatchRecallApi,
  getBatchExpiryMonitoringApi,
  extractList,
} from "@/lib/api";

export default function RecallsPage() {
  return (
    <DashboardProvider>
      <RecallsContent />
    </DashboardProvider>
  );
}

function RecallsContent() {
  const { user, stores } = useDashboard();

  // State
  const [recalls, setRecalls] = useState<BatchRecall[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Modals
  const [selectedRecall, setSelectedRecall] = useState<BatchRecall | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [releaseModalOpen, setReleaseModalOpen] = useState<boolean>(false);
  const [disposeModalOpen, setDisposeModalOpen] = useState<boolean>(false);

  // Create Form State
  const [activeBatches, setActiveBatches] = useState<any[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [source, setSource] = useState<string>("REGULATOR");
  const [severity, setSeverity] = useState<string>("CLASS_1_CRITICAL");
  const [reason, setReason] = useState<string>("");
  const [circularRef, setCircularRef] = useState<string>("");
  const [autoQuarantine, setAutoQuarantine] = useState<boolean>(true);

  // Release Form State
  const [resolutionNotes, setResolutionNotes] = useState<string>("");

  // Dispose Form State
  const [dispositionType, setDispositionType] = useState<"SUPPLIER_RETURN" | "DESTRUCTION_WRITEOFF">("SUPPLIER_RETURN");
  const [disposeNotes, setDisposeNotes] = useState<string>("");

  // Submitting flag
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Role permissions
  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";

  const loadRecalls = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = {
        page,
        page_size: pageSize,
      };
      if (statusFilter !== "ALL") {
        params.status = statusFilter;
      }
      if (severityFilter !== "ALL") {
        params.severity = severityFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await getBatchRecallsApi(params);
      setRecalls(extractList(res));
      setTotalCount(res?.count || 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load batch recalls.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecalls();
  }, [statusFilter, severityFilter, page]);

  useEffect(() => {
    if (createModalOpen) {
      fetchAvailableBatches();
    }
  }, [createModalOpen]);

  const fetchAvailableBatches = async () => {
    setIsLoadingBatches(true);
    try {
      const data = await getBatchExpiryMonitoringApi({ page_size: 100 });
      const batchList = extractList(data);
      // Distinct batch list
      const uniqueBatches: any[] = [];
      const seen = new Set();
      batchList.forEach((it) => {
        if (!seen.has(it.batch_id)) {
          seen.add(it.batch_id);
          uniqueBatches.push(it);
        }
      });
      setActiveBatches(uniqueBatches);
    } catch (err: any) {
      console.error("Failed to load candidate batches for recall:", err);
    } finally {
      setIsLoadingBatches(false);
    }
  };

  const handleOpenDetail = async (recall: BatchRecall) => {
    try {
      const fullDetail = await getBatchRecallDetailApi(recall.id);
      setSelectedRecall(fullDetail);
      setResolutionNotes("");
      setDisposeNotes("");
      setDetailModalOpen(true);
    } catch (err: any) {
      setError(err?.message || "Failed to load recall details.");
    }
  };

  const handleInitiateRecall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId) {
      setError("Please select a batch lot to recall.");
      return;
    }
    if (!reason.trim()) {
      setError("Please provide a detailed recall reason.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await initiateBatchRecallApi({
        batch_id: selectedBatchId,
        source,
        severity,
        reason: reason.trim(),
        evidence_references: circularRef.trim() ? { circular_reference: circularRef.trim() } : {},
        auto_quarantine_stock: autoQuarantine,
      });

      setSuccessMessage("Batch recall initiated across the organization. Stock immediately frozen.");
      setCreateModalOpen(false);
      setSelectedBatchId("");
      setReason("");
      setCircularRef("");
      loadRecalls();
    } catch (err: any) {
      setError(err?.message || "Failed to initiate batch recall.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReleaseRecall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecall) return;

    if (!resolutionNotes.trim()) {
      setError("Clearance and withdrawal documentation notes are required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await releaseBatchRecallApi(selectedRecall.id, {
        resolution_notes: resolutionNotes.trim(),
      });
      setSuccessMessage(res.message);
      setReleaseModalOpen(false);
      const updated = await getBatchRecallDetailApi(selectedRecall.id);
      setSelectedRecall(updated);
      loadRecalls();
    } catch (err: any) {
      setError(err?.message || "Failed to release batch recall.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisposeRecall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecall) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await disposeBatchRecallApi(selectedRecall.id, {
        disposition_type: dispositionType,
        notes: disposeNotes.trim() || undefined,
      });
      setSuccessMessage(res.message);
      setDisposeModalOpen(false);
      const updated = await getBatchRecallDetailApi(selectedRecall.id);
      setSelectedRecall(updated);
      loadRecalls();
    } catch (err: any) {
      setError(err?.message || "Failed to dispose recalled stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "CLASS_1_CRITICAL":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-900 border border-red-300">Class I (Critical)</span>;
      case "CLASS_2_MAJOR":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">Class II (Major)</span>;
      case "CLASS_3_MINOR":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-900 border border-blue-300">Class III (Minor)</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">{sev}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "INITIATED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">Active Recall</span>;
      case "QUARANTINED_ALL":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300">All Quarantined</span>;
      case "RELEASED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">Cleared / Lifted</span>;
      case "COMPLETED_DISPOSED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-300">Disposed</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <DashboardLayout
      title="Medicine Safety"
      subtitle="Quarantine safety holds, batch recall tracking, quality investigations, and compliance clearance."
    >
      <div className="space-y-6">
        {/* Navigation Tabs between Quarantine and Recalls */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <Link
            href="/dashboard/quarantine"
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all flex items-center gap-2"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Safety Quarantine Hold
          </Link>
          <Link
            href="/dashboard/recalls"
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-[#0F766E] text-white shadow-xs flex items-center gap-2"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            Batch Recalls
          </Link>
        </div>

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
              <AlertOctagon className="h-6 w-6 text-rose-600" />
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Manufacturer & Regulatory Recalls
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Immediate cross-branch dispensing locks for regulator- or manufacturer-recalled medicine lots.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadRecalls}
              disabled={isLoading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {isOwner && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateModalOpen(true)}
                className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700"
              >
                <Plus className="h-4 w-4" />
                Initiate Batch Recall
              </Button>
            )}
          </div>
        </div>

        {/* High Severity Safety Warning Banner */}
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-100 rounded-lg text-rose-800 mt-0.5">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-rose-900">
                Immediate Organization-Wide Sale & Dispatch Freeze
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Initiating a recall marks the batch as recalled across all branches immediately.
                Dispensing and inter-store transfers are blocked at database transaction level.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-900 bg-white px-3 py-1.5 rounded border border-rose-200 shadow-sm shrink-0">
            <span>Recall Authority:</span>
            <span className="font-bold">Organization Owner Required</span>
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
                onKeyDown={(e) => e.key === "Enter" && loadRecalls()}
                placeholder="Search recall #, batch #, or reason..."
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full py-1.5 px-3 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-rose-500 bg-white"
              >
                <option value="ALL">All Recall Statuses</option>
                <option value="INITIATED">Active Recall</option>
                <option value="QUARANTINED_ALL">All Quarantined</option>
                <option value="RELEASED">Cleared / Lifted</option>
                <option value="COMPLETED_DISPOSED">Disposed</option>
              </select>
            </div>

            <div>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full py-1.5 px-3 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-rose-500 bg-white"
              >
                <option value="ALL">All Severities</option>
                <option value="CLASS_1_CRITICAL">Class I (Critical)</option>
                <option value="CLASS_2_MAJOR">Class II (Major)</option>
                <option value="CLASS_3_MINOR">Class III (Minor)</option>
              </select>
            </div>

            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadRecalls}
                className="w-full text-xs"
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Recalls Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3">Recall #</th>
                  <th className="px-4 py-3">Batch Number</th>
                  <th className="px-4 py-3">Product Name / SKU</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-center">Severity</th>
                  <th className="px-4 py-3 text-center">Affected Stock</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Initiated By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-rose-600 mb-2" />
                      Loading batch recalls...
                    </td>
                  </tr>
                ) : recalls.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500">
                      No batch recalls on record for this organization.
                    </td>
                  </tr>
                ) : (
                  recalls.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-rose-800 whitespace-nowrap">
                        {r.recall_number}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-gray-900 whitespace-nowrap">
                        {r.batch_number}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{r.product_name}</div>
                        <div className="text-xs text-gray-500">SKU: {r.product_sku}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">
                        {r.source}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getSeverityBadge(r.severity)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap text-xs">
                        <span className="font-bold text-rose-800">{r.affected_quantity_on_hand}</span> {r.base_unit}s
                        <div className="text-[11px] text-gray-500">across {r.affected_stores_count} stores</div>
                        {r.affected_quantity_in_transit > 0 && (
                          <span className="text-[10px] text-amber-700 font-bold block">
                            +{r.affected_quantity_in_transit} in-transit
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getStatusBadge(r.status)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                        {r.initiated_by_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDetail(r)}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View / Resolve
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
              Showing {recalls.length} of {totalCount} records
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

        {/* Initiate Batch Recall Modal */}
        {createModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="h-5 w-5 text-rose-600" />
                  <h3 className="text-lg font-bold text-gray-900">
                    Initiate Organization-Wide Batch Recall
                  </h3>
                </div>
                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleInitiateRecall} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Select Target Batch Lot *
                  </label>
                  {isLoadingBatches ? (
                    <div className="p-3 text-center text-xs text-gray-500 border rounded">
                      <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1 text-rose-600" />
                      Loading catalog batch lots...
                    </div>
                  ) : activeBatches.length === 0 ? (
                    <div className="p-3 text-xs text-gray-500 border rounded bg-gray-50">
                      No active stock batches found.
                    </div>
                  ) : (
                    <select
                      value={selectedBatchId}
                      onChange={(e) => setSelectedBatchId(e.target.value)}
                      required
                      className="w-full text-sm rounded border border-gray-300 p-2 bg-white"
                    >
                      <option value="">-- Select Batch Lot to Recall --</option>
                      {activeBatches.map((b) => (
                        <option key={b.batch_id} value={b.batch_id}>
                          {b.product_name} • Lot: {b.batch_number} (Exp: {b.expiry_date})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Recall Source *
                    </label>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="w-full text-sm rounded border border-gray-300 p-2 bg-white"
                    >
                      <option value="REGULATOR">Drug Regulatory Agency (CDSCO/FDA)</option>
                      <option value="MANUFACTURER">Manufacturer Direct Notice</option>
                      <option value="SUPPLIER">Distributor / Wholesaler Alert</option>
                      <option value="INTERNAL_QUALITY">Internal Quality Investigation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Hazard Severity Classification *
                    </label>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                      className="w-full text-sm rounded border border-gray-300 p-2 bg-white"
                    >
                      <option value="CLASS_1_CRITICAL">Class I (Critical - Risk of injury/death)</option>
                      <option value="CLASS_2_MAJOR">Class II (Major - Temporary health hazard)</option>
                      <option value="CLASS_3_MINOR">Class III (Minor - Labeling/packaging violation)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Regulatory Circular / Order Reference #
                  </label>
                  <input
                    type="text"
                    value={circularRef}
                    onChange={(e) => setCircularRef(e.target.value)}
                    placeholder="e.g. CDSCO-ALERT-2026-9021 or MFR-LOT-RECALL-44"
                    className="w-full text-sm rounded border border-gray-300 p-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Recall Hazard Analysis & Reason *
                  </label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Provide official reason, laboratory test failure findings, or impurity detection..."
                    required
                    className="w-full text-xs rounded border border-gray-300 p-2"
                  />
                </div>

                <div className="p-3 bg-amber-50 rounded border border-amber-200">
                  <label className="flex items-start gap-2 text-xs font-semibold text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoQuarantine}
                      onChange={(e) => setAutoQuarantine(e.target.checked)}
                      className="mt-0.5 rounded text-rose-600"
                    />
                    <div>
                      <div>Automatically quarantine all available stock across all stores</div>
                      <div className="text-[11px] font-normal text-amber-700">
                        Deducts available inventory and generates individual store quarantine records immediately.
                      </div>
                    </div>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreateModalOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSubmitting || !selectedBatchId || !reason.trim()}
                    className="bg-rose-600 hover:bg-rose-700"
                  >
                    {isSubmitting ? "Initiating..." : "Initiate Recall"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Recall Detail Modal */}
        {detailModalOpen && selectedRecall && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between border-b pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-gray-900">
                      {selectedRecall.recall_number}
                    </span>
                    {getSeverityBadge(selectedRecall.severity)}
                    {getStatusBadge(selectedRecall.status)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Source: <strong className="text-gray-700">{selectedRecall.source}</strong> • Batch: <strong className="font-mono text-indigo-700">{selectedRecall.batch_number}</strong>
                  </div>
                </div>
                <button
                  onClick={() => setDetailModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  &times;
                </button>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg text-xs">
                <div>
                  <span className="text-gray-400 block font-semibold">Product Name</span>
                  <span className="font-semibold text-gray-900">{selectedRecall.product_name}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold">SKU</span>
                  <span className="font-mono text-gray-700">{selectedRecall.product_sku}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold">Expiry Date</span>
                  <span className="font-medium text-gray-700">{selectedRecall.expiry_date}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold">Affected On-Hand</span>
                  <span className="font-bold text-rose-800">{selectedRecall.affected_quantity_on_hand} {selectedRecall.base_unit}s</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold">Affected Stores</span>
                  <span className="font-semibold text-gray-800">{selectedRecall.affected_stores_count} branches</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold">In-Transit Stock</span>
                  <span className="font-bold text-amber-700">{selectedRecall.affected_quantity_in_transit} {selectedRecall.base_unit}s</span>
                </div>
              </div>

              {/* Reason */}
              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase mb-1">Official Recall Notice & Hazard Analysis</h4>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-900 whitespace-pre-line font-medium">
                  {selectedRecall.reason}
                </div>
              </div>

              {/* Evidence References */}
              {selectedRecall.evidence_references && Object.keys(selectedRecall.evidence_references).length > 0 && (
                <div className="p-3 bg-gray-50 border rounded text-xs">
                  <div className="font-bold text-gray-700 mb-1">Evidence & Regulatory References:</div>
                  <pre className="text-[11px] text-gray-600 overflow-x-auto">
                    {JSON.stringify(selectedRecall.evidence_references, null, 2)}
                  </pre>
                </div>
              )}

              {/* Cleared / Lifted Info */}
              {selectedRecall.status === "RELEASED" && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                    <ShieldCheck className="h-4 w-4" />
                    Recall Cleared / Lifted by Owner
                  </div>
                  <div>Cleared By: <strong>{selectedRecall.closed_by_name || "—"}</strong> on {selectedRecall.closed_at ? new Date(selectedRecall.closed_at).toLocaleString() : "—"}</div>
                  <div>Official Clearance Notes: <em>"{selectedRecall.resolution_notes}"</em></div>
                </div>
              )}

              {/* Disposition Info */}
              {selectedRecall.status === "COMPLETED_DISPOSED" && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-blue-900">
                    <Trash2 className="h-4 w-4" />
                    Final Disposition: {selectedRecall.disposition_type}
                  </div>
                  {selectedRecall.resolution_notes && (
                    <div>Notes: <em>"{selectedRecall.resolution_notes}"</em></div>
                  )}
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t">
                <div>
                  {["INITIATED", "QUARANTINED_ALL"].includes(selectedRecall.status) && (isOwner || isManager) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDisposeModalOpen(true)}
                      className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Dispose All Recalled Lots
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDetailModalOpen(false)}
                    className="text-xs"
                  >
                    Close
                  </Button>
                  {["INITIATED", "QUARANTINED_ALL"].includes(selectedRecall.status) && isOwner && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setReleaseModalOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      Clear / Lift Recall
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Release Recall Modal */}
        {releaseModalOpen && selectedRecall && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <ShieldCheck className="h-5 w-5" />
                <h3>Lift / Clear Batch Recall</h3>
              </div>
              <p className="text-xs text-gray-600">
                This will clear the recall flag on batch <strong>{selectedRecall.batch_number}</strong>.
                As per regulatory safety standards, individually quarantined stock records will remain quarantined until explicit safety inspection clearance.
              </p>

              <form onSubmit={handleReleaseRecall} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Official Clearance & Revocation Notes *
                  </label>
                  <textarea
                    rows={4}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Document regulatory withdrawal order, lab re-testing clearance, or official manufacturer revocation notice..."
                    required
                    className="w-full text-xs rounded border border-gray-300 p-2"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReleaseModalOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSubmitting || !resolutionNotes.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                  >
                    {isSubmitting ? "Lifting Recall..." : "Confirm Clearance & Lift"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Dispose Recall Modal */}
        {disposeModalOpen && selectedRecall && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-2 text-rose-600 font-bold">
                <Trash2 className="h-5 w-5" />
                <h3>Dispose All Recalled Stock</h3>
              </div>
              <p className="text-xs text-gray-600">
                This action writes off or returns all quarantined stocks of batch <strong>{selectedRecall.batch_number}</strong> across all branches,
                depleting FIFO cost layers and recording ledger write-offs.
              </p>

              <form onSubmit={handleDisposeRecall} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Disposition Route *
                  </label>
                  <select
                    value={dispositionType}
                    onChange={(e) => setDispositionType(e.target.value as any)}
                    className="w-full text-xs rounded border border-gray-300 p-2 bg-white"
                  >
                    <option value="SUPPLIER_RETURN">Return to Manufacturer / Supplier (RTV)</option>
                    <option value="DESTRUCTION_WRITEOFF">Controlled Destruction / Hazardous Waste Write-off</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Disposition Audit Notes
                  </label>
                  <textarea
                    rows={3}
                    value={disposeNotes}
                    onChange={(e) => setDisposeNotes(e.target.value)}
                    placeholder="Manufacturer credit note ref, return manifest #, or witness certificates..."
                    className="w-full text-xs rounded border border-gray-300 p-2"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDisposeModalOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSubmitting}
                    className="bg-rose-600 hover:bg-rose-700 text-xs"
                  >
                    {isSubmitting ? "Processing..." : "Confirm Recall Disposition"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

