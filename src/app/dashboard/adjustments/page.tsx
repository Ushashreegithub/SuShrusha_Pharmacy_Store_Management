"use client";

import React, { useEffect, useState } from "react";
import {
  SlidersHorizontal,
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
  ShieldCheck,
  ShieldAlert,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  StockAdjustment,
  AdjustmentApprovalPolicy,
  getStockAdjustmentsApi,
  getStockAdjustmentDetailApi,
  createStockAdjustmentApi,
  reviewStockAdjustmentApi,
  postStockAdjustmentApi,
  cancelStockAdjustmentApi,
  getStoreStockApi,
  getAdjustmentApprovalPolicyApi,
  saveAdjustmentApprovalPolicyApi,
  ApiError,
  extractList,
} from "@/lib/api";

export default function AdjustmentsPage() {
  return (
    <DashboardProvider>
      <AdjustmentsContent />
    </DashboardProvider>
  );
}

function AdjustmentsContent() {
  const { user, stores, activeStore } = useDashboard();

  // State
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
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

  // Modals & Drawers
  const [selectedAdjustment, setSelectedAdjustment] = useState<StockAdjustment | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [reviewModalOpen, setReviewModalOpen] = useState<boolean>(false);
  const [policyModalOpen, setPolicyModalOpen] = useState<boolean>(false);

  // Form States
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Create Form State
  const [targetStoreId, setTargetStoreId] = useState<string>("");
  const [availableStock, setAvailableStock] = useState<any[]>([]);
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false);
  const [selectedStockItem, setSelectedStockItem] = useState<any | null>(null);
  const [adjustmentDirection, setAdjustmentDirection] = useState<"DECREASE" | "INCREASE">("DECREASE");
  const [absQuantity, setAbsQuantity] = useState<number>(1);
  const [reasonCode, setReasonCode] = useState<string>("DAMAGE");
  const [explanation, setExplanation] = useState<string>("");

  // Review Form State
  const [reviewDecision, setReviewDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [reviewNotes, setReviewNotes] = useState<string>("");

  // Policy Form State
  const [policy, setPolicy] = useState<AdjustmentApprovalPolicy | null>(null);
  const [maxVal, setMaxVal] = useState<string>("");
  const [maxQty, setMaxQty] = useState<string>("");
  const [reqWriteoff, setReqWriteoff] = useState<boolean>(true);

  // Role permissions
  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";

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

  const loadAdjustments = async () => {
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

      const res = await getStockAdjustmentsApi(params);
      setAdjustments(extractList(res));
      setTotalCount(res?.count || 0);
    } catch (err: any) {
      setError(err.message || "Failed to load stock adjustments.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdjustments();
  }, [activeStore, statusFilter, reasonFilter, page, searchQuery]);

  const loadPolicy = async () => {
    try {
      const p = await getAdjustmentApprovalPolicyApi(activeStore?.id);
      setPolicy(p);
      setMaxVal(p.max_manager_adjustment_value || "");
      setMaxQty(p.max_manager_adjustment_quantity ? String(p.max_manager_adjustment_quantity) : "");
      setReqWriteoff(p.require_owner_for_writeoff);
    } catch (err: any) {
      console.error("Failed to fetch policy:", err);
    }
  };

  // Actions
  const handleCreateAdjustment = async () => {
    if (!targetStoreId) {
      setError("Please select a store branch.");
      return;
    }
    if (!selectedStockItem) {
      setError("Please select a product batch to adjust.");
      return;
    }
    if (absQuantity <= 0) {
      setError("Adjustment quantity must be greater than zero.");
      return;
    }
    if (explanation.trim().length < 5) {
      setError("Please provide a detailed explanation (minimum 5 characters).");
      return;
    }

    const signedQty = adjustmentDirection === "DECREASE" ? -absQuantity : absQuantity;
    if (adjustmentDirection === "DECREASE" && absQuantity > selectedStockItem.quantity_on_hand) {
      setError(`Cannot deduct ${absQuantity} units. Physical on-hand balance is only ${selectedStockItem.quantity_on_hand}.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        store_id: targetStoreId,
        product_id: selectedStockItem.product_id,
        batch_id: selectedStockItem.batch_id,
        adjustment_quantity: signedQty,
        reason_code: reasonCode,
        explanation: explanation.trim(),
      };
      const res = await createStockAdjustmentApi(payload);
      setSuccessMessage(`Adjustment ${res.adjustment_number} submitted for review.`);
      setCreateModalOpen(false);
      setSelectedStockItem(null);
      setExplanation("");
      setAbsQuantity(1);
      await loadAdjustments();
    } catch (err: any) {
      setError(err.message || "Failed to submit adjustment request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenReviewModal = (adj: StockAdjustment) => {
    setSelectedAdjustment(adj);
    setReviewDecision("APPROVE");
    setReviewNotes("");
    setReviewModalOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!selectedAdjustment) return;
    if (reviewNotes.trim().length < 3) {
      setError("Please provide review notes (minimum 3 characters).");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await reviewStockAdjustmentApi(selectedAdjustment.id, reviewDecision, reviewNotes.trim());
      setSuccessMessage(res.message);
      setReviewModalOpen(false);
      await loadAdjustments();
      if (detailModalOpen && selectedAdjustment) {
        const updated = await getStockAdjustmentDetailApi(selectedAdjustment.id);
        setSelectedAdjustment(updated);
      }
    } catch (err: any) {
      setError(err.message || "Failed to record review decision.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePostAdjustment = async (adj: StockAdjustment) => {
    if (!confirm(`Confirm posting adjustment ${adj.adjustment_number}? This will permanently update physical inventory and ledger balances.`)) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await postStockAdjustmentApi(adj.id);
      setSuccessMessage(res.message);
      await loadAdjustments();
      if (detailModalOpen && selectedAdjustment?.id === adj.id) {
        const updated = await getStockAdjustmentDetailApi(adj.id);
        setSelectedAdjustment(updated);
      }
    } catch (err: any) {
      setError(err.message || "Failed to post adjustment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelAdjustment = async (adj: StockAdjustment) => {
    if (!confirm(`Cancel adjustment request ${adj.adjustment_number}?`)) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await cancelStockAdjustmentApi(adj.id);
      setSuccessMessage(res.message);
      await loadAdjustments();
      if (detailModalOpen && selectedAdjustment?.id === adj.id) {
        const updated = await getStockAdjustmentDetailApi(adj.id);
        setSelectedAdjustment(updated);
      }
    } catch (err: any) {
      setError(err.message || "Failed to cancel adjustment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSavePolicy = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const payload: any = {
        store_id: activeStore?.id,
        max_manager_adjustment_value: maxVal ? parseFloat(maxVal) : null,
        max_manager_adjustment_quantity: maxQty ? parseInt(maxQty) : null,
        require_owner_for_writeoff: reqWriteoff,
      };
      await saveAdjustmentApprovalPolicyApi(payload);
      setSuccessMessage("Approval policy configuration updated successfully.");
      setPolicyModalOpen(false);
      await loadPolicy();
    } catch (err: any) {
      setError(err.message || "Failed to save approval policy.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper status badge renderer
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "SUBMITTED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3.5 h-3.5" /> Pending Review</span>;
      case "APPROVED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"><ShieldCheck className="w-3.5 h-3.5" /> Approved (Awaiting Post)</span>;
      case "POSTED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><Check className="w-3.5 h-3.5" /> Posted to Ledger</span>;
      case "REJECTED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"><XCircle className="w-3.5 h-3.5" /> Rejected</span>;
      case "CANCELLED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200"><Ban className="w-3.5 h-3.5" /> Cancelled</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  const renderReasonBadge = (reason: string) => {
    switch (reason) {
      case "DAMAGE":
        return <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">Damaged Stock</span>;
      case "EXPIRY_WRITEOFF":
        return <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Expired Stock</span>;
      case "PHYSICAL_SHORTAGE":
        return <span className="text-[11px] font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">Physical Shortage</span>;
      case "VERIFIED_SURPLUS":
        return <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Verified Surplus</span>;
      case "CORRECTION":
        return <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">Count Correction</span>;
      default:
        return <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{reason}</span>;
    }
  };

  return (
    <DashboardLayout
      title="Stock Corrections"
      subtitle="Record damaged, expired, lost or count correction entries with required management approvals."
      action={
        <div className="flex items-center gap-2">
          {isOwner && (
            <Button
              variant="outline"
              onClick={() => {
                loadPolicy();
                setPolicyModalOpen(true);
              }}
              className="flex items-center gap-1.5 text-xs text-slate-700 border-slate-200 bg-white"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>Approval Rules</span>
            </Button>
          )}

          <Button
            onClick={() => {
              setCreateModalOpen(true);
              setError(null);
              setSuccessMessage(null);
            }}
            className="flex items-center gap-2 bg-[#0F766E] hover:bg-[#0D655E] text-white shadow-xs text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Stock Correction</span>
          </Button>
        </div>
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

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              {[
                { label: "All Statuses", value: "ALL" },
                { label: "Pending Review", value: "SUBMITTED" },
                { label: "Approved (Ready to Post)", value: "APPROVED" },
                { label: "Posted", value: "POSTED" },
                { label: "Rejected", value: "REJECTED" },
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

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <select
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value)}
                aria-label="Filter adjustments by reason category"
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-xl bg-white text-slate-700"
              >
                <option value="ALL">All Reasons</option>
                <option value="DAMAGE">Damaged Stock</option>
                <option value="EXPIRY_WRITEOFF">Expired Stock</option>
                <option value="PHYSICAL_SHORTAGE">Physical Shortage</option>
                <option value="VERIFIED_SURPLUS">Verified Surplus</option>
                <option value="CORRECTION">Counting Correction</option>
              </select>

              <button
                type="button"
                onClick={loadAdjustments}
                disabled={isLoading}
                aria-label="Refresh adjustments list"
                className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by adjustment number (ADJ-...), product name, batch number, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>
        </div>

        {/* Adjustments Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="w-8 h-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium">Loading adjustments...</p>
            </div>
          ) : adjustments.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <SlidersHorizontal className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-base font-semibold text-slate-700">No stock adjustments found</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No adjustment records found for this filter. Click "New Adjustment" to submit a stock discrepancy or write-off request.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Adjustment #</th>
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4">Product & Batch</th>
                    <th className="py-3 px-4 text-center">Delta (Qty)</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4">Status</th>
                    {adjustments[0]?.calculated_valuation && (
                      <th className="py-3 px-4 text-right">Valuation</th>
                    )}
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {adjustments.map((adj) => {
                    const isRequester = adj.requested_by_name === user?.full_name;
                    const canReview = (isOwner || isManager) && adj.status === "SUBMITTED" && !isRequester;
                    const canPost = (isOwner || isManager) && adj.status === "APPROVED";
                    const canCancel = adj.status === "SUBMITTED" && (isRequester || isOwner || isManager);

                    return (
                      <tr key={adj.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">
                          {adj.adjustment_number}
                          <p className="text-[10px] text-slate-400 font-sans">{new Date(adj.created_at).toLocaleDateString("en-IN")}</p>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">{adj.store_name}</td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-900 block">{adj.product_name}</span>
                          <span className="font-mono text-[10px] text-slate-500">Lot: {adj.batch_number} (Exp: {adj.expiry_date})</span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold">
                          {adj.adjustment_quantity > 0 ? (
                            <span className="text-emerald-600 inline-flex items-center gap-0.5">
                              <ArrowUpRight className="w-3.5 h-3.5" /> +{adj.adjustment_quantity}
                            </span>
                          ) : (
                            <span className="text-rose-600 inline-flex items-center gap-0.5">
                              <ArrowDownRight className="w-3.5 h-3.5" /> {adj.adjustment_quantity}
                            </span>
                          )}
                          <span className="block text-[10px] text-slate-400 font-normal">{adj.base_unit}s</span>
                        </td>
                        <td className="py-3 px-4">{renderReasonBadge(adj.reason_code)}</td>
                        <td className="py-3 px-4">{renderStatusBadge(adj.status)}</td>
                        {adj.calculated_valuation && (
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                            ₹{adj.calculated_valuation}
                          </td>
                        )}
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAdjustment(adj);
                              setDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            title="View Adjustment Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canReview && (
                            <button
                              type="button"
                              onClick={() => handleOpenReviewModal(adj)}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold text-[11px] inline-flex items-center gap-1"
                              title="Review & Approve"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Review</span>
                            </button>
                          )}

                          {canPost && (
                            <button
                              type="button"
                              onClick={() => handlePostAdjustment(adj)}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-semibold text-[11px] inline-flex items-center gap-1 shadow-2xs"
                              title="Post to Stock Balances"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Post</span>
                            </button>
                          )}

                          {canCancel && (
                            <button
                              type="button"
                              onClick={() => handleCancelAdjustment(adj)}
                              disabled={isSubmitting}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Cancel Request"
                            >
                              <Ban className="w-4 h-4" />
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
          CREATE ADJUSTMENT MODAL
      ===================================================================== */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Create Stock Adjustment Request</h3>
                <p className="text-xs text-slate-500">Record a physical discrepancy, write-off, or verified surplus.</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pharmacy Branch</label>
                <select
                  value={targetStoreId}
                  onChange={(e) => {
                    setTargetStoreId(e.target.value);
                    setSelectedStockItem(null);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800"
                >
                  <option value="">Select branch...</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Batch to Adjust</label>
                {isLoadingStock ? (
                  <p className="text-xs text-slate-500">Loading branch inventory...</p>
                ) : availableStock.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    No active inventory found at this branch.
                  </p>
                ) : (
                  <select
                    onChange={(e) => {
                      const item = availableStock.find((s) => s.id === e.target.value);
                      setSelectedStockItem(item || null);
                    }}
                    value={selectedStockItem?.id || ""}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800"
                  >
                    <option value="">Choose product batch...</option>
                    {availableStock.map((stk) => (
                      <option key={stk.id} value={stk.id}>
                        {stk.product_name} | Lot {stk.batch_number} (On Hand: {stk.quantity_on_hand} {stk.base_unit}s)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedStockItem && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current On Hand:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedStockItem.quantity_on_hand} {selectedStockItem.base_unit}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expiry Date:</span>
                    <span className="font-mono text-slate-800">{selectedStockItem.expiry_date}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Type</label>
                  <select
                    value={adjustmentDirection}
                    onChange={(e) => setAdjustmentDirection(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800"
                  >
                    <option value="DECREASE">Deduction / Write-off (-)</option>
                    <option value="INCREASE">Surplus / Addition (+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Units ({selectedStockItem?.base_unit || "base units"})
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={absQuantity}
                    onChange={(e) => setAbsQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono text-center font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason Category</label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-800"
                >
                  <option value="DAMAGE">Damaged / Broken Stock Write-off</option>
                  <option value="EXPIRY_WRITEOFF">Expired Stock Disposal Write-off</option>
                  <option value="PHYSICAL_SHORTAGE">Physical Shortage / In-Store Missing</option>
                  <option value="VERIFIED_SURPLUS">Verified Physical Surplus</option>
                  <option value="CORRECTION">Counting / Entry Correction</option>
                  <option value="OTHER">Other Authorized Reason</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Explanation & Justification (Required)</label>
                <textarea
                  rows={3}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="State evidence, inspection details, or discrepancy cause..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="outline" type="button" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateAdjustment}
                disabled={isSubmitting || !selectedStockItem}
                className="bg-[#0F766E] text-white hover:bg-[#0D655E]"
              >
                {isSubmitting ? "Submitting..." : "Submit for Approval"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          REVIEW ADJUSTMENT MODAL
      ===================================================================== */}
      {reviewModalOpen && selectedAdjustment && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">Review Adjustment Request</h3>
              <p className="text-xs text-slate-500 font-mono">{selectedAdjustment.adjustment_number}</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1.5 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Product:</span>
                <span className="font-semibold text-slate-800">{selectedAdjustment.product_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Adjustment:</span>
                <span className="font-mono font-bold text-slate-800">
                  {selectedAdjustment.adjustment_quantity > 0
                    ? `+${selectedAdjustment.adjustment_quantity}`
                    : selectedAdjustment.adjustment_quantity}{" "}
                  {selectedAdjustment.base_unit}s
                </span>
              </div>
              {selectedAdjustment.calculated_valuation && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Valuation Impact:</span>
                  <span className="font-mono font-bold text-slate-800">₹{selectedAdjustment.calculated_valuation}</span>
                </div>
              )}
              <div className="pt-1 text-[11px] text-slate-600">
                <span className="font-medium text-slate-700">Explanation:</span> "{selectedAdjustment.explanation}"
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Decision</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReviewDecision("APPROVE")}
                  className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                    reviewDecision === "APPROVE"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-600/20"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  ✓ Approve
                </button>
                <button
                  type="button"
                  onClick={() => setReviewDecision("REJECT")}
                  className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                    reviewDecision === "REJECT"
                      ? "bg-rose-50 text-rose-800 border-rose-300 ring-2 ring-rose-600/20"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  ✕ Reject
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Review Notes / Remarks</label>
              <textarea
                rows={2}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="State reason for approval or rejection..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="outline" type="button" onClick={() => setReviewModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmitReview}
                disabled={isSubmitting || reviewNotes.trim().length < 3}
                className={reviewDecision === "APPROVE" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-rose-600 text-white hover:bg-rose-700"}
              >
                {isSubmitting ? "Recording..." : `Confirm ${reviewDecision}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          APPROVAL POLICY CONFIGURATION MODAL (OWNER ONLY)
      ===================================================================== */}
      {policyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">Adjustment Approval Policy</h3>
              <p className="text-xs text-slate-500">Configure Store Manager approval boundaries and Owner escalation.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Max Store Manager Valuation (₹ INR)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 5000.00"
                  value={maxVal}
                  onChange={(e) => setMaxVal(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                />
                <span className="text-[10px] text-slate-400">Leave blank for Owner approval on all valuations.</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Max Store Manager Adjustment Quantity (Units)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 50"
                  value={maxQty}
                  onChange={(e) => setMaxQty(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                />
                <span className="text-[10px] text-slate-400">Leave blank for Owner approval on all quantities.</span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="reqWriteoff"
                  checked={reqWriteoff}
                  onChange={(e) => setReqWriteoff(e.target.checked)}
                  className="w-4 h-4 rounded text-[#0F766E] border-slate-300"
                />
                <label htmlFor="reqWriteoff" className="text-xs text-slate-700 font-medium">
                  Strictly require Owner approval for all write-offs (Damage, Expiry, Shortage)
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="outline" type="button" onClick={() => setPolicyModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSavePolicy}
                disabled={isSubmitting}
                className="bg-[#0F766E] text-white hover:bg-[#0D655E]"
              >
                {isSubmitting ? "Saving..." : "Save Policy"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DETAIL MODAL
      ===================================================================== */}
      {detailModalOpen && selectedAdjustment && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold font-mono text-slate-900">{selectedAdjustment.adjustment_number}</h3>
                <p className="text-xs text-slate-500">{selectedAdjustment.store_name}</p>
              </div>
              {renderStatusBadge(selectedAdjustment.status)}
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Product</span>
                  <span className="font-semibold text-slate-800">{selectedAdjustment.product_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Batch & Expiry</span>
                  <span className="font-mono text-slate-800">{selectedAdjustment.batch_number} ({selectedAdjustment.expiry_date})</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Adjustment Delta</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedAdjustment.adjustment_quantity > 0
                      ? `+${selectedAdjustment.adjustment_quantity}`
                      : selectedAdjustment.adjustment_quantity}{" "}
                    {selectedAdjustment.base_unit}s
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Resulting Balance</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedAdjustment.resulting_quantity} {selectedAdjustment.base_unit}s
                  </span>
                </div>
                {selectedAdjustment.calculated_valuation && (
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Valuation (FIFO Cost)</span>
                    <span className="font-mono font-bold text-slate-800">₹{selectedAdjustment.calculated_valuation}</span>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Reason</span>
                  {renderReasonBadge(selectedAdjustment.reason_code)}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">Explanation</span>
                <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                  {selectedAdjustment.explanation}
                </p>
              </div>

              {selectedAdjustment.review_notes && (
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                    Review Remarks ({selectedAdjustment.reviewed_by_name || "Reviewer"})
                  </span>
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium">
                    {selectedAdjustment.review_notes}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="outline" type="button" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
