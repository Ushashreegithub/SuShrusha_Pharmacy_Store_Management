"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Clock,
  Search,
  RefreshCw,
  Building2,
  Package,
  Layers,
  Settings,
  Ban,
  ArrowRight,
  TrendingDown,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  BatchExpiryMonitoringItem,
  StoreExpiryPolicy,
  getBatchExpiryMonitoringApi,
  getStoreExpiryPolicyApi,
  saveStoreExpiryPolicyApi,
  createStockQuarantineApi,
  extractList,
} from "@/lib/api";

export default function BatchesMonitoringPage() {
  return (
    <DashboardProvider>
      <BatchesMonitoringContent />
    </DashboardProvider>
  );
}

function BatchesMonitoringContent() {
  const { user, stores, activeStore } = useDashboard();

  // State
  const [batches, setBatches] = useState<BatchExpiryMonitoringItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [recalledFilter, setRecalledFilter] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Policy Drawer
  const [policyModalOpen, setPolicyModalOpen] = useState<boolean>(false);
  const [policy, setPolicy] = useState<StoreExpiryPolicy | null>(null);
  const [warnDays, setWarnDays] = useState<number>(90);
  const [critDays, setCritDays] = useState<number>(30);
  const [isSavingPolicy, setIsSavingPolicy] = useState<boolean>(false);

  // Quick Quarantine Modal
  const [quarantineModalOpen, setQuarantineModalOpen] = useState<boolean>(false);
  const [selectedBatch, setSelectedBatch] = useState<BatchExpiryMonitoringItem | null>(null);
  const [quarQuantity, setQuarQuantity] = useState<number>(1);
  const [quarReason, setQuarReason] = useState<string>("DAMAGED");
  const [quarNotes, setQuarNotes] = useState<string>("");
  const [isQuarantining, setIsQuarantining] = useState<boolean>(false);

  // Permissions
  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";

  const loadBatches = async () => {
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
        params.expiry_status = statusFilter;
      }
      if (recalledFilter !== "ALL") {
        params.is_recalled = recalledFilter === "RECALLED" ? "true" : "false";
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await getBatchExpiryMonitoringApi(params);
      setBatches(extractList(res));
      setTotalCount(res?.count || 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load batch monitoring records.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadPolicy = async () => {
    try {
      const p = await getStoreExpiryPolicyApi(activeStore?.id);
      setPolicy(p);
      setWarnDays(p.warning_threshold_days);
      setCritDays(p.critical_threshold_days);
    } catch (err: any) {
      console.error("Failed to load expiry policy:", err);
    }
  };

  useEffect(() => {
    loadBatches();
    loadPolicy();
  }, [activeStore, statusFilter, recalledFilter, page]);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (critDays > warnDays) {
      setError("Critical window must be less than or equal to warning window.");
      return;
    }

    setIsSavingPolicy(true);
    setError(null);
    try {
      const updated = await saveStoreExpiryPolicyApi({
        store_id: activeStore?.id || null,
        warning_threshold_days: Number(warnDays),
        critical_threshold_days: Number(critDays),
      });
      setPolicy(updated);
      setSuccessMessage("Expiry threshold policy updated successfully.");
      setPolicyModalOpen(false);
      loadBatches();
    } catch (err: any) {
      setError(err?.message || "Failed to update expiry policy.");
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const handleOpenQuarantine = (b: BatchExpiryMonitoringItem) => {
    setSelectedBatch(b);
    setQuarQuantity(Math.min(b.available_quantity, 1));
    setQuarReason(b.is_recalled ? "RECALL" : b.expiry_status === "EXPIRED" ? "OTHER" : "DAMAGED");
    setQuarNotes("");
    setQuarantineModalOpen(true);
  };

  const handleExecuteQuarantine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    if (quarQuantity <= 0 || quarQuantity > selectedBatch.available_quantity) {
      setError(`Quarantine quantity must be between 1 and ${selectedBatch.available_quantity}.`);
      return;
    }

    setIsQuarantining(true);
    setError(null);
    try {
      await createStockQuarantineApi({
        store_id: selectedBatch.store_id,
        batch_id: selectedBatch.batch_id,
        quantity: quarQuantity,
        reason_code: quarReason,
        notes: quarNotes.trim() || undefined,
      });

      setSuccessMessage(`Quarantined ${quarQuantity} units of batch ${selectedBatch.batch_number}.`);
      setQuarantineModalOpen(false);
      loadBatches();
    } catch (err: any) {
      setError(err?.message || "Failed to quarantine stock.");
    } finally {
      setIsQuarantining(false);
    }
  };

  const getExpiryBadge = (item: BatchExpiryMonitoringItem) => {
    if (item.is_recalled) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
          <Ban className="h-3 w-3" />
          RECALLED
        </span>
      );
    }

    switch (item.expiry_status) {
      case "EXPIRED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-300">
            <XCircle className="h-3 w-3" />
            Expired ({item.days_until_expiry}d ago)
          </span>
        );
      case "CRITICAL_NEAR_EXPIRY":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
            <AlertTriangle className="h-3 w-3" />
            Critical ({item.days_until_expiry}d left)
          </span>
        );
      case "WARNING_NEAR_EXPIRY":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-yellow-50 text-yellow-800 border border-yellow-200">
            <Clock className="h-3 w-3" />
            Warning ({item.days_until_expiry}d left)
          </span>
        );
      case "SAFE":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="h-3 w-3" />
            Safe ({item.days_until_expiry}d)
          </span>
        );
    }
  };

  return (
    <DashboardLayout
      title="Find Medicines & Stock"
      subtitle="Search medications, check store stock balances, view active batches & expiry dates, and manage product catalog details."
    >
      <div className="space-y-6">
        {/* Navigation Tabs between Product Master and Batches & Expiry */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <Link
            href="/dashboard/products"
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all flex items-center gap-2"
          >
            <Package className="w-3.5 h-3.5" />
            Medicine Catalog
          </Link>
          <Link
            href="/dashboard/batches"
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-[#0F766E] text-white shadow-xs flex items-center gap-2"
          >
            <Layers className="w-3.5 h-3.5" />
            Batches & Expiry (FEFO)
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
              <Layers className="h-6 w-6 text-[#0F766E]" />
              <h1 className="text-xl font-bold tracking-tight text-gray-900">
                Batches & Expiry (FEFO)
              </h1>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Track active batch numbers, expiry countdowns, first-expiry first-out dispensing order, and quarantine locks.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadBatches}
              disabled={isLoading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPolicyModalOpen(true)}
                className="flex items-center gap-1.5 border-teal-300 text-teal-800 hover:bg-teal-50"
              >
                <Settings className="h-4 w-4 text-teal-700" />
                Alert Thresholds ({policy ? `${policy.warning_threshold_days}d / ${policy.critical_threshold_days}d` : "90d / 30d"})
              </Button>
            )}
          </div>
        </div>

        {/* Safety Rule Banner */}
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-teal-100 rounded-lg text-teal-800 mt-0.5">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-teal-900">
                Automatic FEFO Allocation & Safety Enforcement Active
              </h3>
              <p className="text-xs text-teal-700 mt-0.5">
                Expired batches and recalled lots are immediately excluded from eligible fulfillment, sale, and inter-store transfer.
                Near-expiry lots within {policy?.warning_threshold_days || 90} days are flagged for prioritised FEFO dispensing.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-900 bg-white px-3 py-1.5 rounded border border-teal-200 shadow-sm shrink-0">
            <span>Warning: ≤ {policy?.warning_threshold_days || 90}d</span>
            <span className="text-gray-300">|</span>
            <span className="text-rose-600 font-bold">Critical: ≤ {policy?.critical_threshold_days || 30}d</span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadBatches()}
                placeholder="Search product, SKU, or batch #..."
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full py-1.5 px-3 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="ALL">All Expiry Statuses</option>
                <option value="EXPIRED">Expired Only</option>
                <option value="CRITICAL_NEAR_EXPIRY">Critical (≤ 30 days)</option>
                <option value="WARNING_NEAR_EXPIRY">Warning (≤ 90 days)</option>
                <option value="SAFE">Safe / Normal Stock</option>
              </select>
            </div>

            <div>
              <select
                value={recalledFilter}
                onChange={(e) => setRecalledFilter(e.target.value)}
                className="w-full py-1.5 px-3 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="ALL">All Recall States</option>
                <option value="RECALLED">Recalled Only</option>
                <option value="ACTIVE">Active (Not Recalled)</option>
              </select>
            </div>

            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadBatches}
                className="w-full text-xs"
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Batches Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3">Batch Number</th>
                  <th className="px-4 py-3">Product Name / SKU</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Expiry Date</th>
                  <th className="px-4 py-3 text-center">Safety Status</th>
                  <th className="px-4 py-3 text-center">On-Hand</th>
                  <th className="px-4 py-3 text-center">Quarantined</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-800">Available</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-teal-600 mb-2" />
                      Evaluating batch safety statuses...
                    </td>
                  </tr>
                ) : batches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500">
                      No batch stock found matching current criteria.
                    </td>
                  </tr>
                ) : (
                  batches.map((item) => (
                    <tr
                      key={`${item.store_id}-${item.batch_id}`}
                      className={`hover:bg-gray-50 transition-colors ${
                        item.is_recalled
                          ? "bg-rose-50/40"
                          : item.expiry_status === "EXPIRED"
                          ? "bg-red-50/40"
                          : item.expiry_status === "CRITICAL_NEAR_EXPIRY"
                          ? "bg-amber-50/30"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-teal-800 whitespace-nowrap">
                        {item.batch_number}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{item.product_name}</div>
                        <div className="text-xs text-gray-500">SKU: {item.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">
                        {item.store_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-gray-700">
                        {item.expiry_date}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getExpiryBadge(item)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap text-xs font-medium text-gray-700">
                        {item.quantity_on_hand} {item.base_unit}s
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap text-xs">
                        {item.quantity_quarantined > 0 ? (
                          <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            {item.quantity_quarantined} {item.base_unit}s
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap text-xs font-bold">
                        <span className={item.available_quantity > 0 ? "text-emerald-700" : "text-gray-400"}>
                          {item.available_quantity} {item.base_unit}s
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {item.available_quantity > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenQuarantine(item)}
                            className="text-xs border-amber-300 text-amber-800 hover:bg-amber-50"
                          >
                            <AlertTriangle className="h-3 w-3 mr-1 text-amber-600" />
                            Quarantine
                          </Button>
                        )}
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
              Showing {batches.length} of {totalCount} batch lots
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

        {/* Policy Configuration Modal */}
        {policyModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-teal-700" />
                  <h3 className="text-lg font-bold text-gray-900">
                    Expiry Alert Thresholds
                  </h3>
                </div>
                <button
                  onClick={() => setPolicyModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSavePolicy} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Warning Window Threshold (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={warnDays}
                    onChange={(e) => setWarnDays(Number(e.target.value))}
                    required
                    className="w-full text-sm rounded border border-gray-300 p-2"
                  />
                  <span className="text-[11px] text-gray-500">
                    Batches expiring within this window will show a yellow warning (default: 90 days).
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Critical Window Threshold (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={critDays}
                    onChange={(e) => setCritDays(Number(e.target.value))}
                    required
                    className="w-full text-sm rounded border border-gray-300 p-2"
                  />
                  <span className="text-[11px] text-gray-500">
                    Batches expiring within this window will be flagged as critical (default: 30 days).
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPolicyModalOpen(false)}
                    disabled={isSavingPolicy}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSavingPolicy}
                    className="bg-teal-700 hover:bg-teal-800"
                  >
                    {isSavingPolicy ? "Saving..." : "Save Thresholds"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Quick Quarantine Modal */}
        {quarantineModalOpen && selectedBatch && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h3 className="text-lg font-bold text-gray-900">
                    Initiate Stock Quarantine
                  </h3>
                </div>
                <button
                  onClick={() => setQuarantineModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleExecuteQuarantine} className="space-y-4">
                <div className="bg-gray-50 p-3 rounded text-xs space-y-1">
                  <div><strong>Product:</strong> {selectedBatch.product_name}</div>
                  <div><strong>Batch #:</strong> {selectedBatch.batch_number}</div>
                  <div><strong>Store:</strong> {selectedBatch.store_name}</div>
                  <div><strong>Available to Hold:</strong> {selectedBatch.available_quantity} {selectedBatch.base_unit}s</div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Quarantine Quantity ({selectedBatch.base_unit}s) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedBatch.available_quantity}
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
                    <option value="SUPPLIER_QUALITY">Supplier Quality Alert / Defect Notice</option>
                    <option value="RECALL">Associated with Recall Notice</option>
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
                    placeholder="Describe reason, defect details, or temperature log references..."
                    className="w-full text-xs rounded border border-gray-300 p-2"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuarantineModalOpen(false)}
                    disabled={isQuarantining}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isQuarantining}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {isQuarantining ? "Holding..." : "Confirm Quarantine Hold"}
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

