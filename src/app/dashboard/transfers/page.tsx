"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  ArrowLeftRight,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Truck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Building2,
  Package,
  Layers,
  FileText,
  AlertCircle,
  HelpCircle,
  Check,
  Ban,
  ShieldAlert,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import {
  StockTransfer,
  StockTransferItem,
  TransferDiscrepancy,
  getStockTransfersApi,
  getStockTransferDetailApi,
  createStockTransferApi,
  dispatchStockTransferApi,
  receiveStockTransferApi,
  cancelStockTransferApi,
  resolveTransferDiscrepancyApi,
  getStoreStockApi,
  ApiError,
  extractList,
} from "@/lib/api";

export default function TransfersPage() {
  return (
    <DashboardProvider>
      <TransfersContent />
    </DashboardProvider>
  );
}

function TransfersContent() {
  const { user, stores, activeStore } = useDashboard();

  // State
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [directionFilter, setDirectionFilter] = useState<"all" | "in" | "out">("all");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Modals
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState<boolean>(false);
  const [resolveModalOpen, setResolveModalOpen] = useState<boolean>(false);
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<TransferDiscrepancy | null>(null);

  // Form States
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Create Form State
  const [sourceStoreId, setSourceStoreId] = useState<string>("");
  const [destStoreId, setDestStoreId] = useState<string>("");
  const [transferNotes, setTransferNotes] = useState<string>("");
  const [availableStock, setAvailableStock] = useState<any[]>([]);
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false);
  const [createLines, setCreateLines] = useState<
    Array<{
      productId: string;
      productName: string;
      batchId: string;
      batchNumber: string;
      maxAvailable: number;
      quantityRequested: number;
    }>
  >([]);

  // Receive Form State
  const [receiveLines, setReceiveLines] = useState<
    Record<
      string,
      {
        received: number;
        damaged: number;
        missing: number;
        excess: number;
        evidenceNotes: string;
      }
    >
  >({});

  // Resolve Discrepancy Form State
  const [resolutionDecision, setResolutionDecision] = useState<
    "RECOVERED" | "RETURNED_TO_SOURCE" | "LOSS_CONFIRMED"
  >("LOSS_CONFIRMED");
  const [resolutionNotes, setResolutionNotes] = useState<string>("");

  // Role permissions
  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";

  // Initial source store setup
  useEffect(() => {
    if (activeStore && !sourceStoreId) {
      setSourceStoreId(activeStore.id);
    }
  }, [activeStore, sourceStoreId]);

  // Load available stock when source store changes in create modal
  useEffect(() => {
    if (createModalOpen && sourceStoreId) {
      fetchSourceStock(sourceStoreId);
    }
  }, [createModalOpen, sourceStoreId]);

  const fetchSourceStock = async (storeId: string) => {
    setIsLoadingStock(true);
    try {
      const data = await getStoreStockApi(storeId, { page_size: 100 });
      setAvailableStock(extractList(data));
    } catch (err: any) {
      console.error("Failed to fetch store stock:", err);
    } finally {
      setIsLoadingStock(false);
    }
  };

  // Load Transfers
  const loadTransfers = async () => {
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
      if (directionFilter !== "all") {
        params.direction = directionFilter;
      }
      if (statusFilter !== "ALL") {
        params.status = statusFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await getStockTransfersApi(params);
      setTransfers(extractList(res));
      setTotalCount(res?.count || 0);
    } catch (err: any) {
      setError(err.message || "Failed to load stock transfers.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTransfers();
  }, [activeStore, statusFilter, directionFilter, page, searchQuery]);

  // Refresh Transfer Detail
  const refreshDetail = async (transferId: string) => {
    try {
      const updated = await getStockTransferDetailApi(transferId);
      setSelectedTransfer(updated);
      setTransfers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err: any) {
      console.error("Failed to refresh transfer detail:", err);
    }
  };

  // Actions
  const handleDispatch = async (transfer: StockTransfer) => {
    if (!confirm(`Confirm dispatch of transfer ${transfer.transfer_number}? Physical stock will be deducted from ${transfer.source_store_name}.`)) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await dispatchStockTransferApi(transfer.id);
      setSuccessMessage(res.message || "Transfer dispatched successfully into transit.");
      await loadTransfers();
      if (selectedTransfer?.id === transfer.id) {
        await refreshDetail(transfer.id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to dispatch stock transfer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenReceiveModal = (transfer: StockTransfer) => {
    setSelectedTransfer(transfer);
    const initialLines: Record<string, any> = {};
    transfer.items.forEach((item) => {
      initialLines[item.id] = {
        received: item.in_transit_quantity,
        damaged: 0,
        missing: 0,
        excess: 0,
        evidenceNotes: "",
      };
    });
    setReceiveLines(initialLines);
    setReceiveModalOpen(true);
  };

  const handleSubmitReceive = async () => {
    if (!selectedTransfer) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payloadLines = Object.entries(receiveLines).map(([itemId, val]) => ({
        item_id: itemId,
        quantity_received: Number(val.received) || 0,
        quantity_damaged: Number(val.damaged) || 0,
        quantity_missing: Number(val.missing) || 0,
        quantity_excess: Number(val.excess) || 0,
        evidence_notes: val.evidenceNotes || "",
      }));

      const res = await receiveStockTransferApi(selectedTransfer.id, { receipt_lines: payloadLines });
      setSuccessMessage(res.message || "Receipt successfully processed.");
      setReceiveModalOpen(false);
      await loadTransfers();
      if (detailModalOpen) {
        await refreshDetail(selectedTransfer.id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to process transfer receipt.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelTransfer = async (transfer: StockTransfer) => {
    const reason = prompt(`Enter reason to cancel transfer ${transfer.transfer_number}:`);
    if (reason === null) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await cancelStockTransferApi(transfer.id, reason);
      setSuccessMessage(res.message || "Transfer cancelled successfully.");
      await loadTransfers();
      if (selectedTransfer?.id === transfer.id) {
        await refreshDetail(transfer.id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to cancel transfer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenResolveModal = (discrepancy: TransferDiscrepancy) => {
    setSelectedDiscrepancy(discrepancy);
    setResolutionDecision("LOSS_CONFIRMED");
    setResolutionNotes("");
    setResolveModalOpen(true);
  };

  const handleSubmitResolveDiscrepancy = async () => {
    if (!selectedDiscrepancy || !selectedTransfer) return;
    if (resolutionNotes.trim().length < 5) {
      setError("Resolution notes must be at least 5 characters detailing investigation findings.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await resolveTransferDiscrepancyApi(selectedDiscrepancy.id, {
        resolution_decision: resolutionDecision,
        resolution_notes: resolutionNotes.trim(),
      });
      setSuccessMessage(res.message || "Discrepancy resolved successfully.");
      setResolveModalOpen(false);
      await refreshDetail(selectedTransfer.id);
      await loadTransfers();
    } catch (err: any) {
      setError(err.message || "Failed to resolve discrepancy.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTransfer = async () => {
    if (!sourceStoreId) {
      setError("Please select a source store branch.");
      return;
    }
    if (!destStoreId) {
      setError("Please select a destination store branch.");
      return;
    }
    if (sourceStoreId === destStoreId) {
      setError("Source and destination stores must be different branches.");
      return;
    }
    if (createLines.length === 0) {
      setError("Please add at least one line item to transfer.");
      return;
    }

    for (const line of createLines) {
      if (line.quantityRequested <= 0) {
        setError(`Requested quantity for ${line.productName} must be greater than zero.`);
        return;
      }
      if (line.quantityRequested > line.maxAvailable) {
        setError(`Requested quantity (${line.quantityRequested}) exceeds available stock (${line.maxAvailable}) for ${line.productName}.`);
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        source_store_id: sourceStoreId,
        destination_store_id: destStoreId,
        notes: transferNotes.trim(),
        items: createLines.map((l) => ({
          product_id: l.productId,
          batch_id: l.batchId,
          quantity_requested: l.quantityRequested,
        })),
      };

      const res = await createStockTransferApi(payload);
      setSuccessMessage(`Transfer ${res.transfer_number} created successfully.`);
      setCreateModalOpen(false);
      setCreateLines([]);
      setTransferNotes("");
      await loadTransfers();
    } catch (err: any) {
      setError(err.message || "Failed to create stock transfer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper status badge renderer
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "SUBMITTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5" /> Ready to Dispatch
          </span>
        );
      case "DISPATCHED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Truck className="w-3.5 h-3.5" /> On the Way (In Transit)
          </span>
        );
      case "PARTIALLY_RECEIVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Partially Received
          </span>
        );
      case "DISCREPANCY_HOLD":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <ShieldAlert className="w-3.5 h-3.5" /> Needs Investigation
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Check className="w-3.5 h-3.5" /> Received (In Stock)
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <Ban className="w-3.5 h-3.5" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <DashboardLayout
      title="Stock Transfers"
      subtitle="Transfer medicines between branches with verified dispatch, in-transit tracking, and destination receipt verification."
      action={
        <Button
          onClick={() => {
            setCreateModalOpen(true);
            setError(null);
            setSuccessMessage(null);
          }}
          className="flex items-center gap-1 bg-[#0F766E] hover:bg-[#0D655E] text-white shadow-xs"
        >
          <Plus className="w-4 h-4" /><span>Stock Transfers</span>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Notifications */}
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

        {/* Filters & Control Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              {[
                { label: "All Transfers", value: "ALL" },
                { label: "In Transit", value: "DISPATCHED" },
                { label: "Discrepancy Hold", value: "DISCREPANCY_HOLD" },
                { label: "Pending Dispatch", value: "SUBMITTED" },
                { label: "Completed", value: "COMPLETED" },
                { label: "Cancelled", value: "CANCELLED" },
              ].map((pill) => (
                <button
                  key={pill.value}
                  type="button"
                  onClick={() => setStatusFilter(pill.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    statusFilter === pill.value
                      ? "bg-[#0F766E] text-white shadow-2xs font-semibold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Direction Filter & Refresh */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value as any)}
                aria-label="Filter transfers by direction"
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                <option value="all">All Directions</option>
                <option value="in">Inbound (To Branch)</option>
                <option value="out">Outbound (From Branch)</option>
              </select>

              <button
                type="button"
                onClick={loadTransfers}
                disabled={isLoading}
                aria-label="Refresh transfers list"
                className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by transfer number (TRF-...), branch name, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>
        </div>

        {/* Transfers List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="w-8 h-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium">Loading stock transfers...</p>
            </div>
          ) : transfers.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <ArrowLeftRight className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-base font-semibold text-slate-700">No stock transfers found</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No transfer records match your current branch or status filter. Click "Initiate Transfer" to request stock from another branch.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Transfer #</th>
                    <th className="py-3 px-4">Route (Source → Dest)</th>
                    <th className="py-3 px-4 text-center">Items</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Initiated By</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {transfers.map((trf) => {
                    const isSourceManager = activeStore?.id === trf.source_store_id && isManager;
                    const isDestManager = activeStore?.id === trf.destination_store_id && isManager;
                    const canDispatch = (isOwner || isSourceManager) && trf.status === "SUBMITTED";
                    const canReceive =
                      (isOwner || isDestManager) &&
                      ["DISPATCHED", "PARTIALLY_RECEIVED", "DISCREPANCY_HOLD"].includes(trf.status);
                    const canCancel = (isOwner || isSourceManager) && trf.status === "SUBMITTED";

                    return (
                      <tr key={trf.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">
                          {trf.transfer_number}
                          {trf.notes && (
                            <p className="text-[10px] text-slate-400 font-sans truncate max-w-[180px]">{trf.notes}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-800">{trf.source_store_name}</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-[#0F766E] font-semibold">{trf.destination_store_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-medium">
                          {trf.items_count}
                        </td>
                        <td className="py-3 px-4">{renderStatusBadge(trf.status)}</td>
                        <td className="py-3 px-4 text-slate-600">{trf.requested_by_name || "—"}</td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(trf.created_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                          {/* View Detail Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTransfer(trf);
                              setDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            title="View Transfer Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Dispatch Action */}
                          {canDispatch && (
                            <button
                              type="button"
                              onClick={() => handleDispatch(trf)}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold text-[11px] inline-flex items-center gap-1"
                              title="Dispatch into Transit"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>Dispatch</span>
                            </button>
                          )}

                          {/* Receive Action */}
                          {canReceive && (
                            <button
                              type="button"
                              onClick={() => handleOpenReceiveModal(trf)}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-[11px] inline-flex items-center gap-1"
                              title="Receive Stock at Destination"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Receive</span>
                            </button>
                          )}

                          {/* Cancel Action */}
                          {canCancel && (
                            <button
                              type="button"
                              onClick={() => handleCancelTransfer(trf)}
                              disabled={isSubmitting}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                              title="Cancel Transfer"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          1. CREATE TRANSFER MODAL
      ===================================================================== */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Initiate Inter-Store Transfer</h3>
                <p className="text-xs text-slate-500">Request stock movement from a source pharmacy branch.</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Branch Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Source Store (Dispatch Branch)</label>
                <select
                  value={sourceStoreId}
                  onChange={(e) => {
                    setSourceStoreId(e.target.value);
                    setCreateLines([]);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                >
                  <option value="">Select source branch...</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Destination Store (Receiving Branch)</label>
                <select
                  value={destStoreId}
                  onChange={(e) => setDestStoreId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                >
                  <option value="">Select destination branch...</option>
                  {stores
                    .filter((s) => s.id !== sourceStoreId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Line Items Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">Stock Items to Transfer</label>
                {isLoadingStock && <span className="text-[11px] text-slate-400">Loading stock...</span>}
              </div>

              {availableStock.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                  {sourceStoreId
                    ? "No available verified batches in source store inventory."
                    : "Please select a source store branch to view available stock."}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <select
                      id="stockSelect"
                      className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800"
                    >
                      <option value="">Select available product batch...</option>
                      {availableStock
                        .filter((stk) => stk.available_quantity > 0)
                        .map((stk) => (
                          <option
                            key={stk.id}
                            value={JSON.stringify({
                              productId: stk.product_id,
                              productName: stk.product_name,
                              batchId: stk.batch_id,
                              batchNumber: stk.batch_number,
                              maxAvailable: stk.available_quantity,
                            })}
                          >
                            {stk.product_name} | Batch {stk.batch_number} (Avail: {stk.available_quantity} {stk.base_unit})
                          </option>
                        ))}
                    </select>

                    <Button
                      type="button"
                      onClick={() => {
                        const sel = (document.getElementById("stockSelect") as HTMLSelectElement)?.value;
                        if (!sel) return;
                        const parsed = JSON.parse(sel);
                        if (createLines.some((l) => l.batchId === parsed.batchId)) {
                          alert("Batch already added to transfer lines.");
                          return;
                        }
                        setCreateLines((prev) => [
                          ...prev,
                          {
                            ...parsed,
                            quantityRequested: 1,
                          },
                        ]);
                      }}
                      className="px-3 py-2 bg-[#0F766E] text-white rounded-xl text-xs"
                    >
                      Add Line
                    </Button>
                  </div>

                  {/* Added Lines Table */}
                  {createLines.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden mt-3">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                          <tr>
                            <th className="p-2.5">Product & Batch</th>
                            <th className="p-2.5 text-center">Available</th>
                            <th className="p-2.5 text-center">Requested Qty</th>
                            <th className="p-2.5 text-right">Remove</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {createLines.map((line, idx) => (
                            <tr key={line.batchId}>
                              <td className="p-2.5 font-medium text-slate-800">
                                {line.productName}
                                <span className="block text-[10px] text-slate-500">Batch: {line.batchNumber}</span>
                              </td>
                              <td className="p-2.5 text-center font-mono">{line.maxAvailable}</td>
                              <td className="p-2.5 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  max={line.maxAvailable}
                                  value={line.quantityRequested}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    setCreateLines((prev) =>
                                      prev.map((l, i) => (i === idx ? { ...l, quantityRequested: val } : l))
                                    );
                                  }}
                                  className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg text-center font-mono"
                                />
                              </td>
                              <td className="p-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => setCreateLines((prev) => prev.filter((_, i) => i !== idx))}
                                  className="text-red-500 hover:text-red-700 text-xs"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Transfer Notes / Justification</label>
              <textarea
                rows={2}
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="Optional transfer purpose (e.g. emergency replenishment, rebalancing)..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateTransfer}
                disabled={isSubmitting || createLines.length === 0}
                className="bg-[#0F766E] text-white hover:bg-[#0D655E]"
              >
                {isSubmitting ? "Submitting..." : "Submit Transfer Request"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. RECEIVE TRANSFER MODAL
      ===================================================================== */}
      {receiveModalOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Confirm Inward Receipt — {selectedTransfer.transfer_number}
                </h3>
                <p className="text-xs text-slate-500">
                  Inspect arriving goods from {selectedTransfer.source_store_name}. Verified stock will be credited to {selectedTransfer.destination_store_name}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {selectedTransfer.items.map((item) => {
                const lineState = receiveLines[item.id] || {
                  received: item.in_transit_quantity,
                  damaged: 0,
                  missing: 0,
                  excess: 0,
                  evidenceNotes: "",
                };

                return (
                  <div key={item.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-slate-900 text-xs">{item.product_name}</h4>
                        <p className="text-[11px] text-slate-500">
                          Batch: <span className="font-mono text-slate-700">{item.batch_number}</span> | In Transit:{" "}
                          <span className="font-mono font-bold text-indigo-700">{item.in_transit_quantity}</span> {item.base_unit}s
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-emerald-700 mb-1">Good Units Received</label>
                        <input
                          type="number"
                          min={0}
                          value={lineState.received}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setReceiveLines((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], received: val },
                            }));
                          }}
                          className="w-full px-2 py-1.5 text-xs border border-emerald-300 rounded-lg bg-emerald-50/30 text-emerald-900 font-mono text-center font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-amber-700 mb-1">Damaged / Broken</label>
                        <input
                          type="number"
                          min={0}
                          value={lineState.damaged}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setReceiveLines((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], damaged: val },
                            }));
                          }}
                          className="w-full px-2 py-1.5 text-xs border border-amber-300 rounded-lg bg-amber-50/30 text-amber-900 font-mono text-center"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-red-700 mb-1">Missing / Shortage</label>
                        <input
                          type="number"
                          min={0}
                          value={lineState.missing}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setReceiveLines((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], missing: val },
                            }));
                          }}
                          className="w-full px-2 py-1.5 text-xs border border-red-300 rounded-lg bg-red-50/30 text-red-900 font-mono text-center"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-purple-700 mb-1">Excess Units</label>
                        <input
                          type="number"
                          min={0}
                          value={lineState.excess}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setReceiveLines((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], excess: val },
                            }));
                          }}
                          className="w-full px-2 py-1.5 text-xs border border-purple-300 rounded-lg bg-purple-50/30 text-purple-900 font-mono text-center"
                        />
                      </div>
                    </div>

                    {(lineState.damaged > 0 || lineState.missing > 0 || lineState.excess > 0) && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Discrepancy Notes / Inspection Remarks (Mandatory)
                        </label>
                        <input
                          type="text"
                          placeholder="State damage evidence, broken ampoules, carton tampering, etc."
                          value={lineState.evidenceNotes}
                          onChange={(e) => {
                            const text = e.target.value;
                            setReceiveLines((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], evidenceNotes: text },
                            }));
                          }}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                type="button"
                onClick={() => setReceiveModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmitReceive}
                disabled={isSubmitting}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {isSubmitting ? "Processing Receipt..." : "Confirm & Post Receipt"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. TRANSFER DETAIL DRAWER / MODAL
      ===================================================================== */}
      {detailModalOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto border border-slate-200 shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold font-mono text-slate-900">{selectedTransfer.transfer_number}</h3>
                  {renderStatusBadge(selectedTransfer.status)}
                </div>
                <p className="text-xs text-slate-500">
                  Route: <span className="font-semibold text-slate-800">{selectedTransfer.source_store_name}</span> →{" "}
                  <span className="font-semibold text-[#0F766E]">{selectedTransfer.destination_store_name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Timestamps & Personnel */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Initiated By</span>
                <span className="font-medium text-slate-800">{selectedTransfer.requested_by_name || "—"}</span>
                <span className="block text-[10px] text-slate-500">
                  {new Date(selectedTransfer.created_at).toLocaleString("en-IN")}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Dispatched By</span>
                <span className="font-medium text-slate-800">{selectedTransfer.dispatched_by_name || "—"}</span>
                <span className="block text-[10px] text-slate-500">
                  {selectedTransfer.dispatched_at ? new Date(selectedTransfer.dispatched_at).toLocaleString("en-IN") : "Pending"}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Received By</span>
                <span className="font-medium text-slate-800">{selectedTransfer.received_by_name || "—"}</span>
                <span className="block text-[10px] text-slate-500">
                  {selectedTransfer.received_at ? new Date(selectedTransfer.received_at).toLocaleString("en-IN") : "Pending"}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Status / Hold</span>
                <span className="font-semibold text-slate-800">{selectedTransfer.status}</span>
                {selectedTransfer.cancellation_reason && (
                  <span className="block text-[10px] text-red-500 truncate" title={selectedTransfer.cancellation_reason}>
                    Reason: {selectedTransfer.cancellation_reason}
                  </span>
                )}
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">Transfer Line Items</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Product / SKU</th>
                      <th className="py-2.5 px-3">Batch & Expiry</th>
                      <th className="py-2.5 px-3 text-center">Req</th>
                      <th className="py-2.5 px-3 text-center">Disp</th>
                      <th className="py-2.5 px-3 text-center">In Transit</th>
                      <th className="py-2.5 px-3 text-center">Recv</th>
                      <th className="py-2.5 px-3 text-center">Dmg / Mis</th>
                      <th className="py-2.5 px-3 text-right">Unit MRP</th>
                      {selectedTransfer.items[0]?.unit_cost && (
                        <th className="py-2.5 px-3 text-right">Unit Cost</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTransfer.items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          {it.product_name}
                          <span className="block text-[10px] text-slate-400 font-mono">{it.sku}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {it.batch_number}
                          <span className="block text-[10px] text-slate-400 font-sans">Exp: {it.expiry_date}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">{it.quantity_requested}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-semibold">{it.quantity_dispatched}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-700">
                          {it.in_transit_quantity}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700">
                          {it.quantity_received}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-red-600">
                          {it.quantity_damaged + it.quantity_missing > 0
                            ? `${it.quantity_damaged}d / ${it.quantity_missing}m`
                            : "0"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">₹{it.unit_mrp}</td>
                        {it.unit_cost && (
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500">₹{it.unit_cost}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* In-Transit Discrepancies Section */}
            {selectedTransfer.discrepancies && selectedTransfer.discrepancies.length > 0 && (
              <div className="space-y-3 p-4 border border-orange-200 bg-orange-50/40 rounded-xl">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-orange-600" />
                  <h4 className="text-xs font-bold text-orange-900 uppercase tracking-wider">
                    In-Transit Discrepancy Holds ({selectedTransfer.discrepancies.length})
                  </h4>
                </div>

                <div className="space-y-2">
                  {selectedTransfer.discrepancies.map((disc) => (
                    <div
                      key={disc.id}
                      className="bg-white border border-orange-200 rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 uppercase text-[11px] px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                            {disc.discrepancy_type}
                          </span>
                          <span className="font-mono font-bold text-red-600">
                            Qty: {disc.discrepancy_quantity} units
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Reported by: {disc.reported_by_name || "Staff"}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px]">Evidence: "{disc.evidence_notes}"</p>
                        {disc.resolution_decision && (
                          <p className="text-emerald-700 font-medium text-[11px]">
                            Resolution ({disc.resolution_decision}): {disc.resolution_notes} (by {disc.reviewed_by_name})
                          </p>
                        )}
                      </div>

                      <div>
                        {disc.status === "RESOLVED" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                          </span>
                        ) : (
                          (isOwner || isManager) && (
                            <Button
                              type="button"
                              onClick={() => handleOpenResolveModal(disc)}
                              className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs"
                            >
                              Resolve
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="outline" type="button" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. RESOLVE DISCREPANCY MODAL
      ===================================================================== */}
      {resolveModalOpen && selectedDiscrepancy && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">Resolve Transit Discrepancy</h3>
              <p className="text-xs text-slate-500">
                Authorized investigation record for {selectedDiscrepancy.discrepancy_type} ({selectedDiscrepancy.discrepancy_quantity} units).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Resolution Decision</label>
              <select
                value={resolutionDecision}
                onChange={(e) => setResolutionDecision(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800"
              >
                <option value="LOSS_CONFIRMED">Transit Loss Confirmed (Carrier/Shortage Hold)</option>
                <option value="RETURNED_TO_SOURCE">Returned to Source Branch</option>
                <option value="RECOVERED">Stock Located & Recovered</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Investigation Findings / Notes (Required)
              </label>
              <textarea
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Enter investigation conclusion, carrier damage report ID, or recovery notes..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                type="button"
                onClick={() => setResolveModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmitResolveDiscrepancy}
                disabled={isSubmitting || resolutionNotes.trim().length < 5}
                className="bg-[#0F766E] text-white hover:bg-[#0D655E]"
              >
                {isSubmitting ? "Resolving..." : "Confirm Resolution"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
