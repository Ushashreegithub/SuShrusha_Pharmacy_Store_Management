"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
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
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  StockQuarantineRecord,
  getStockQuarantineRecordsApi,
  getStockQuarantineDetailApi,
  createStockQuarantineApi,
  releaseStockQuarantineApi,
  disposeStockQuarantineApi,
  getStoreStockApi,
  extractList,
} from "@/lib/api";

export default function QuarantinePage() {
  return (
    <DashboardProvider>
      <QuarantineContent />
    </DashboardProvider>
  );
}

function QuarantineContent() {
  const { user, stores, activeStore } = useDashboard();

  // State
  const [records, setRecords] = useState<StockQuarantineRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [reasonFilter, setReasonFilter] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Modals
  const [selectedRecord, setSelectedRecord] = useState<StockQuarantineRecord | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [releaseModalOpen, setReleaseModalOpen] = useState<boolean>(false);
  const [disposeModalOpen, setDisposeModalOpen] = useState<boolean>(false);

  // Create Form State
  const [targetStoreId, setTargetStoreId] = useState<string>("");
  const [availableStock, setAvailableStock] = useState<any[]>([]);
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [quarQuantity, setQuarQuantity] = useState<number>(1);
  const [quarReason, setQuarReason] = useState<string>("DAMAGED");
  const [quarNotes, setQuarNotes] = useState<string>("");

  // Release Form State
  const [releaseQty, setReleaseQty] = useState<number>(1);
  const [releaseReason, setReleaseReason] = useState<string>("");

  // Dispose Form State
  const [dispositionType, setDispositionType] = useState<"WRITTEN_OFF" | "RETURNED_TO_SUPPLIER">("WRITTEN_OFF");
  const [disposeNotes, setDisposeNotes] = useState<string>("");

  // Submitting flag
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Role permissions
  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";
  const canReleaseOrDispose = isOwner || isManager;

  useEffect(() => {
    if (activeStore && !targetStoreId) {
      setTargetStoreId(activeStore.id);
    }
  }, [activeStore, targetStoreId]);

  useEffect(() => {
    if (createModalOpen && targetStoreId) {
      fetchStoreStock(targetStoreId);
    }
  }, [createModalOpen, targetStoreId]);

  const fetchStoreStock = async (storeId: string) => {
    setIsLoadingStock(true);
    try {
      const data = await getStoreStockApi(storeId, { page_size: 100 });
      setAvailableStock(extractList(data));
    } catch (err: any) {
      console.error("Failed to load store stock:", err);
    } finally {
      setIsLoadingStock(false);
    }
  };

  const loadRecords = async () => {
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
      if (reasonFilter !== "ALL") {
        params.reason_code = reasonFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await getStockQuarantineRecordsApi(params);
      setRecords(extractList(res));
      setTotalCount(res?.count || 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load quarantine records.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [activeStore, statusFilter, reasonFilter, page]);

  const handleOpenDetail = async (record: StockQuarantineRecord) => {
    try {
      const fullDetail = await getStockQuarantineDetailApi(record.id);
      setSelectedRecord(fullDetail);
      setReleaseQty(fullDetail.quantity_quarantined);
      setReleaseReason("");
      setDisposeNotes("");
      setDetailModalOpen(true);
    } catch (err: any) {
      setError(err?.message || "Failed to load quarantine record details.");
    }
  };

  const handleCreateQuarantine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStoreId || !selectedBatchId) {
      setError("Please select a store and batch lot.");
      return;
    }
    if (quarQuantity <= 0) {
      setError("Quarantine quantity must be greater than zero.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await createStockQuarantineApi({
        store_id: targetStoreId,
        batch_id: selectedBatchId,
        quantity: quarQuantity,
        reason_code: quarReason,
        notes: quarNotes.trim() || undefined,
      });

      setSuccessMessage("Stock moved to quarantine hold. Availability adjusted immediately.");
      setCreateModalOpen(false);
      setSelectedBatchId("");
      setQuarNotes("");
      loadRecords();
    } catch (err: any) {
      setError(err?.message || "Failed to quarantine stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReleaseQuarantine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    if (releaseQty <= 0 || releaseQty > selectedRecord.quantity_quarantined) {
      setError(`Release quantity must be between 1 and ${selectedRecord.quantity_quarantined}.`);
      return;
    }
    if (!releaseReason.trim()) {
      setError("Release justification is required for regulatory audit.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await releaseStockQuarantineApi(selectedRecord.id, {
        release_quantity: releaseQty,
        release_reason: releaseReason.trim(),
      });
      setSuccessMessage(res.message);
      setReleaseModalOpen(false);
      const updated = await getStockQuarantineDetailApi(selectedRecord.id);
      setSelectedRecord(updated);
      loadRecords();
    } catch (err: any) {
      setError(err?.message || "Failed to release quarantined stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisposeQuarantine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await disposeStockQuarantineApi(selectedRecord.id, {
        disposition_type: dispositionType,
        notes: disposeNotes.trim() || undefined,
      });
      setSuccessMessage(res.message);
      setDisposeModalOpen(false);
      const updated = await getStockQuarantineDetailApi(selectedRecord.id);
      setSelectedRecord(updated);
      loadRecords();
    } catch (err: any) {
      setError(err?.message || "Failed to dispose quarantined stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">Under Hold</span>;
      case "RELEASED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">Released</span>;
      case "WRITTEN_OFF":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">Written Off</span>;
      case "RETURNED_TO_SUPPLIER":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">Returned to Vendor</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case "DAMAGED": return "Damaged Packaging";
      case "SUSPECTED_COUNTERFEIT": return "Counterfeit Concern";
      case "TEMPERATURE_EXCURSION": return "Temp Excursion";
      case "AMBIGUOUS_IDENTITY": return "Labeling Defect";
      case "SUPPLIER_QUALITY": return "Supplier Alert";
      case "RECALL": return "Recall Hold";
      case "OTHER": return "Safety Hold";
      default: return reason;
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
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-[#0F766E] text-white shadow-xs flex items-center gap-2"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Safety Quarantine Hold
          </Link>
          <Link
            href="/dashboard/recalls"
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all flex items-center gap-2"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
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
              <ShieldAlert className="h-6 w-6 text-[#0F766E]" />
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Safety Quarantine Holds
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Segregate damaged, suspect, or compromised medicines to prevent patient dispensing until formal clearance or disposal.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadRecords}
              disabled={isLoading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700"
            >
              <Plus className="h-4 w-4" />
              Quarantine Stock
            </Button>
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
                onKeyDown={(e) => e.key === "Enter" && loadRecords()}
                placeholder="Search QRN #, batch #, or product..."
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full py-1.5 px-3 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
              >
                <option value="ALL">All Quarantine Statuses</option>
                <option value="ACTIVE">Under Hold (Active)</option>
                <option value="RELEASED">Released to Inventory</option>
                <option value="WRITTEN_OFF">Written Off</option>
                <option value="RETURNED_TO_SUPPLIER">Returned to Vendor</option>
              </select>
            </div>

            <div>
              <select
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value)}
                className="w-full py-1.5 px-3 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
              >
                <option value="ALL">All Hold Reasons</option>
                <option value="DAMAGED">Damaged / Broken Packaging</option>
                <option value="SUSPECTED_COUNTERFEIT">Counterfeit Concern</option>
                <option value="TEMPERATURE_EXCURSION">Temperature Excursion</option>
                <option value="AMBIGUOUS_IDENTITY">Ambiguous Identity</option>
                <option value="SUPPLIER_QUALITY">Supplier Alert</option>
                <option value="RECALL">Recall Hold</option>
                <option value="OTHER">Other Safety Hold</option>
              </select>
            </div>

            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadRecords}
                className="w-full text-xs"
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Records Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3">Quarantine #</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Product / Batch</th>
                  <th className="px-4 py-3 text-center">Quantity Held</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Quarantined By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-amber-600 mb-2" />
                      Loading quarantine records...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      No stock quarantine records found.
                    </td>
                  </tr>
                ) : (
                  records.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-amber-800 whitespace-nowrap">
                        {r.quarantine_number}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">
                        {r.store_name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{r.product_name}</div>
                        <div className="text-xs text-gray-500">
                          Batch: <span className="font-mono text-indigo-700 font-semibold">{r.batch_number}</span> • SKU: {r.sku}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap font-bold text-gray-900 text-xs">
                        {r.quantity_quarantined} {r.base_unit}s
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {getReasonLabel(r.reason_code)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getStatusBadge(r.status)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                        {r.quarantined_by_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDetail(r)}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Audit / Actions
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
              Showing {records.length} of {totalCount} records
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

        {/* Create Quarantine Modal */}
        {createModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h3 className="text-lg font-bold text-gray-900">
                    Initiate Stock Quarantine
                  </h3>
                </div>
                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateQuarantine} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Store Branch *
                  </label>
                  <select
                    value={targetStoreId}
                    onChange={(e) => {
                      setTargetStoreId(e.target.value);
                      setSelectedBatchId("");
                    }}
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
                    Select Target Batch Lot *
                  </label>
                  {isLoadingStock ? (
                    <div className="p-3 text-center text-xs text-gray-500 border rounded">
                      <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1 text-amber-600" />
                      Loading branch inventory...
                    </div>
                  ) : availableStock.length === 0 ? (
                    <div className="p-3 text-xs text-gray-500 border rounded bg-gray-50">
                      No active stock found at this store.
                    </div>
                  ) : (
                    <select
                      value={selectedBatchId}
                      onChange={(e) => {
                        setSelectedBatchId(e.target.value);
                        const sel = availableStock.find((it) => it.batch_id === e.target.value);
                        if (sel) {
                          setQuarQuantity(Math.min(sel.physical_quantity, 1));
                        }
                      }}
                      required
                      className="w-full text-sm rounded border border-gray-300 p-2 bg-white"
                    >
                      <option value="">-- Select Batch Lot --</option>
                      {availableStock.map((it) => (
                        <option key={it.batch_id} value={it.batch_id}>
                          {it.product_name} (Lot: {it.batch_number}) • Avail: {it.physical_quantity}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Quantity to Quarantine (Base Units) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quarQuantity}
                    onChange={(e) => setQuarQuantity(Number(e.target.value))}
                    required
                    className="w-full text-sm rounded border border-gray-300 p-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Quarantine Reason *
                  </label>
                  <select
                    value={quarReason}
                    onChange={(e) => setQuarReason(e.target.value)}
                    className="w-full text-sm rounded border border-gray-300 p-2 bg-white"
                  >
                    <option value="DAMAGED">Damaged / Broken Packaging</option>
                    <option value="SUSPECTED_COUNTERFEIT">Suspected Counterfeit / Authenticity Concern</option>
                    <option value="TEMPERATURE_EXCURSION">Cold-Chain / Temperature Excursion</option>
                    <option value="AMBIGUOUS_IDENTITY">Ambiguous Batch Identity / Label Defect</option>
                    <option value="SUPPLIER_QUALITY">Supplier Quality Alert / Recall Notice</option>
                    <option value="RECALL">Associated with Manufacturer Recall</option>
                    <option value="OTHER">Other Authorized Safety Hold</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Inspection Notes / Excursion Log
                  </label>
                  <textarea
                    rows={3}
                    value={quarNotes}
                    onChange={(e) => setQuarNotes(e.target.value)}
                    placeholder="Provide detailed description of damage, cold chain temperature logs, or lot defects..."
                    className="w-full text-xs rounded border border-gray-300 p-2"
                  />
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
                    disabled={isSubmitting || !selectedBatchId}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {isSubmitting ? "Holding..." : "Confirm Quarantine Hold"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Quarantine Record Detail Modal */}
        {detailModalOpen && selectedRecord && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between border-b pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-gray-900">
                      {selectedRecord.quarantine_number}
                    </span>
                    {getStatusBadge(selectedRecord.status)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Store: <strong className="text-gray-700">{selectedRecord.store_name}</strong> • Reason: <strong className="text-gray-700">{getReasonLabel(selectedRecord.reason_code)}</strong>
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
                  <span className="text-gray-400 block font-semibold">Product</span>
                  <span className="font-semibold text-gray-900">{selectedRecord.product_name}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold">Batch Number</span>
                  <span className="font-mono font-bold text-indigo-700">{selectedRecord.batch_number}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold">SKU</span>
                  <span className="font-mono text-gray-700">{selectedRecord.sku}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold">Quantity Quarantined</span>
                  <span className="font-bold text-amber-800">{selectedRecord.quantity_quarantined} {selectedRecord.base_unit}s</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold">Quarantined By</span>
                  <span className="text-gray-700">{selectedRecord.quarantined_by_name || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold">Quarantined At</span>
                  <span className="text-gray-700">{new Date(selectedRecord.quarantined_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Notes */}
              {selectedRecord.notes && (
                <div>
                  <h4 className="text-xs font-bold text-gray-700 uppercase mb-1">Inspection & Excursion Notes</h4>
                  <div className="p-2 bg-gray-50 rounded border text-xs text-gray-700 whitespace-pre-line font-mono">
                    {selectedRecord.notes}
                  </div>
                </div>
              )}

              {/* Release Info */}
              {selectedRecord.status === "RELEASED" && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                    <CheckCircle2 className="h-4 w-4" />
                    Released to Saleable Stock
                  </div>
                  <div>Released By: <strong>{selectedRecord.released_by_name || "—"}</strong> on {selectedRecord.released_at ? new Date(selectedRecord.released_at).toLocaleString() : "—"}</div>
                  <div>Justification: <em>"{selectedRecord.release_reason}"</em></div>
                </div>
              )}

              {/* Disposition Info */}
              {["WRITTEN_OFF", "RETURNED_TO_SUPPLIER"].includes(selectedRecord.status) && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-blue-900">
                    {selectedRecord.status === "WRITTEN_OFF" ? <Trash2 className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                    Disposition: {selectedRecord.status === "WRITTEN_OFF" ? "Damage / Expiry Destruction Write-off" : "Returned to Vendor"}
                  </div>
                  {selectedRecord.disposition_notes && (
                    <div>Notes: <em>"{selectedRecord.disposition_notes}"</em></div>
                  )}
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t">
                <div>
                  {selectedRecord.status === "ACTIVE" && canReleaseOrDispose && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDisposeModalOpen(true)}
                      className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Dispose / Return
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
                  {selectedRecord.status === "ACTIVE" && canReleaseOrDispose && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setReleaseModalOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Release to Active Stock
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Release Modal */}
        {releaseModalOpen && selectedRecord && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <CheckCircle2 className="h-5 w-5" />
                <h3>Release Quarantined Stock to Active Inventory</h3>
              </div>
              <p className="text-xs text-gray-600">
                Released units will immediately become physically and legally available for sale and dispatch.
                Batch safety rules (non-recalled, non-expired) will be verified server-side.
              </p>

              <form onSubmit={handleReleaseQuarantine} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Release Quantity ({selectedRecord.base_unit}s) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedRecord.quantity_quarantined}
                    value={releaseQty}
                    onChange={(e) => setReleaseQty(Number(e.target.value))}
                    required
                    className="w-full text-xs rounded border border-gray-300 p-2 font-bold text-gray-900"
                  />
                  <span className="text-[11px] text-gray-500">
                    Max currently held: {selectedRecord.quantity_quarantined} {selectedRecord.base_unit}s
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Release Justification / Lab Clearance Notes *
                  </label>
                  <textarea
                    rows={3}
                    value={releaseReason}
                    onChange={(e) => setReleaseReason(e.target.value)}
                    placeholder="e.g., Temperature excursion evaluated safe by QA, COA verified, packaging intact..."
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
                    disabled={isSubmitting || !releaseReason.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                  >
                    {isSubmitting ? "Releasing..." : "Confirm Release"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Dispose Modal */}
        {disposeModalOpen && selectedRecord && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-2 text-rose-600 font-bold">
                <Trash2 className="h-5 w-5" />
                <h3>Dispose Quarantined Stock</h3>
              </div>
              <p className="text-xs text-gray-600">
                This will deduct {selectedRecord.quantity_quarantined} {selectedRecord.base_unit}s from on-hand inventory,
                deplete the oldest FIFO cost layers, and post an outward movement to the immutable ledger.
              </p>

              <form onSubmit={handleDisposeQuarantine} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Disposition Route *
                  </label>
                  <select
                    value={dispositionType}
                    onChange={(e) => setDispositionType(e.target.value as any)}
                    className="w-full text-xs rounded border border-gray-300 p-2 bg-white"
                  >
                    <option value="WRITTEN_OFF">Damage / Destruction Write-off</option>
                    <option value="RETURNED_TO_SUPPLIER">Return to Vendor / Supplier</option>
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
                    placeholder="Witness names, hazardous waste disposal cert, or vendor RTV reference..."
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
                    {isSubmitting ? "Disposing..." : "Confirm Final Disposition"}
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

