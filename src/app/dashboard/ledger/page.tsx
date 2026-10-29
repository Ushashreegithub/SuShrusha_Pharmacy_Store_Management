"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  History,
  Search,
  RefreshCw,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  PauseCircle,
  FileText,
  Filter,
  DollarSign,
  User,
  ShieldAlert,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StockMovement, getStockMovementsApi, extractList } from "@/lib/api";

export default function StockLedgerPage() {
  return (
    <DashboardProvider>
      <StockLedgerContent />
    </DashboardProvider>
  );
}

function StockLedgerContent() {
  const { user, stores, activeStore } = useDashboard();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [storeIdFilter, setStoreIdFilter] = useState<string>(activeStore?.id || "");
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>("ALL");
  const [directionFilter, setDirectionFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const pageSize = 25;

  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);

  useEffect(() => {
    if (activeStore?.id && !storeIdFilter) {
      setStoreIdFilter(activeStore.id);
    }
  }, [activeStore]);

  const loadMovements = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = {
        page: currentPage,
        page_size: pageSize,
      };
      if (storeIdFilter) params.store_id = storeIdFilter;
      if (movementTypeFilter !== "ALL") params.movement_type = movementTypeFilter;
      if (directionFilter !== "ALL") params.direction = directionFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await getStockMovementsApi(params);
      setMovements(extractList(res));
      setTotalCount(res?.count || 0);
      setTotalPages(res?.num_pages || 1);
    } catch (err: any) {
      console.error("Failed to load stock movements:", err);
      setError(err.message || "Failed to load stock ledger transactions.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMovements();
  }, [storeIdFilter, movementTypeFilter, directionFilter, currentPage]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadMovements();
  };

  const handleClearFilters = () => {
    setMovementTypeFilter("ALL");
    setDirectionFilter("ALL");
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  const renderDirectionBadge = (direction: string, quantity: number) => {
    switch (direction) {
      case "IN":
        return (
          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] border border-emerald-200">
            <ArrowDownLeft className="w-3.5 h-3.5" />
            +{quantity}
          </span>
        );
      case "OUT":
        return (
          <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full text-[11px] border border-rose-200">
            <ArrowUpRight className="w-3.5 h-3.5" />
            -{quantity}
          </span>
        );
      case "HOLD":
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[11px] border border-amber-200">
            <PauseCircle className="w-3.5 h-3.5" />
            {quantity} (Hold)
          </span>
        );
      default:
        return <span>{quantity}</span>;
    }
  };

  return (
    <DashboardLayout
      title="Stock History"
      subtitle="Complete chronological timeline of all deliveries, transfers, corrections, and safety quarantine movements."
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMovements}
            isLoading={isLoading}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="error">
            <div className="flex items-center justify-between">
              <span className="text-xs">{error}</span>
              <button
                type="button"
                onClick={loadMovements}
                className="underline text-xs font-semibold ml-2"
              >
                Retry
              </button>
            </div>
          </Alert>
        )}

        {/* Filter Console */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <form onSubmit={handleSearchSubmit} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Store Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Store Branch
                </label>
                <select
                  value={storeIdFilter}
                  onChange={(e) => {
                    setStoreIdFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                >
                  {isOwner && <option value="">-- All Store Branches --</option>}
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Movement Type */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Movement Operation
                </label>
                <select
                  value={movementTypeFilter}
                  onChange={(e) => {
                    setMovementTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                >
                  <option value="ALL">All Operations</option>
                  <option value="OPENING_STOCK">Opening Stock (Initial Inventory)</option>
                  <option value="PURCHASE_RECEIPT">Delivery Received (GRN)</option>
                  <option value="TRANSFER_DISPATCH">Transfer Out (Dispatched)</option>
                  <option value="TRANSFER_IN">Transfer In (Received)</option>
                  <option value="ADJUSTMENT_ADD">Stock Correction (+ Found)</option>
                  <option value="ADJUSTMENT_SUB">Stock Correction (- Lost/Broken)</option>
                  <option value="QUARANTINE_HOLD">Quarantine Safety Hold</option>
                  <option value="QUARANTINE_RELEASE">Quarantine Released to Shelves</option>
                  <option value="EXPIRY_WRITEOFF">Expired Stock Write-off</option>
                  <option value="DAMAGE_WRITEOFF">Damaged Stock Write-off</option>
                  <option value="SUPPLIER_RETURN">Returned to Supplier</option>
                </select>
              </div>

              {/* Direction Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Direction
                </label>
                <select
                  value={directionFilter}
                  onChange={(e) => {
                    setDirectionFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                >
                  <option value="ALL">All Directions</option>
                  <option value="IN">Inward (+ Physical)</option>
                  <option value="OUT">Outward (- Physical)</option>
                  <option value="HOLD">Status / Quarantine Hold</option>
                </select>
              </div>

              {/* Date From & To */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>
              </div>
            </div>

            {/* Search Input & Action Row */}
            <div className="flex flex-col md:flex-row items-center gap-3 pt-1">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search product name, SKU, barcode, batch #, reference ID or audit notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 pl-9 pr-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <Button type="submit" variant="primary" size="sm" className="text-xs bg-[#0F766E]">
                  Apply Filters
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                  className="text-xs"
                >
                  Reset
                </Button>
              </div>
            </div>
          </form>
        </div>

        {/* Ledger Transactions Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#0F766E]" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Transaction Ledger ({totalCount})
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <div className="w-6 h-6 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading ledger transactions...
            </div>
          ) : movements.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <History className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700">No stock movements found</p>
              <p className="text-[11px] text-slate-500">
                Movements are recorded automatically upon opening stock, GRN receipts, transfers & adjustments.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
                    <th className="py-3 px-3">Date & Time</th>
                    <th className="py-3 px-3">Branch</th>
                    <th className="py-3 px-3">Product & SKU</th>
                    <th className="py-3 px-3">Batch & Expiry</th>
                    <th className="py-3 px-3">Operation</th>
                    <th className="py-3 px-3">Quantity Delta</th>
                    <th className="py-3 px-3">Balance Before → After</th>
                    <th className="py-3 px-3">Quarantine</th>
                    <th className="py-3 px-3">Reference & Notes</th>
                    {movements.some((m) => m.unit_cost) && (
                      <th className="py-3 px-3">Cost Basis</th>
                    )}
                    <th className="py-3 px-3">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {movements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 text-[11px] whitespace-nowrap">
                        <div className="font-mono text-slate-800">
                          {new Date(mov.created_at).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {new Date(mov.created_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[11px] font-medium text-slate-800 whitespace-nowrap">
                        {mov.store_name}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{mov.product_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{mov.product_sku}</div>
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <div className="font-bold text-slate-800">{mov.batch_number}</div>
                        <div className="text-[10px] text-slate-500">Exp: {mov.expiry_date}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-800 whitespace-nowrap">
                          {mov.movement_type_display || mov.movement_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {renderDirectionBadge(mov.direction, mov.quantity)}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">
                        <span className="text-slate-500">{mov.balance_before}</span>
                        <span className="mx-1 text-slate-400">→</span>
                        <span className="font-bold text-slate-900">{mov.balance_after}</span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] whitespace-nowrap text-slate-600">
                        {mov.quarantine_before} → {mov.quarantine_after}
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        {mov.reference_id && (
                          <div className="font-mono text-[10px] font-semibold text-slate-700 truncate">
                            Ref: {mov.reference_id}
                          </div>
                        )}
                        {mov.reason && (
                          <div className="text-[10px] text-slate-500 truncate" title={mov.reason}>
                            {mov.reason}
                          </div>
                        )}
                        {!mov.reference_id && !mov.reason && <span className="text-slate-400">—</span>}
                      </td>
                      {movements.some((m) => m.unit_cost) && (
                        <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">
                          {mov.unit_cost ? `₹${parseFloat(mov.unit_cost).toFixed(2)}` : "—"}
                        </td>
                      )}
                      <td className="py-3 px-3 text-[10px] text-slate-600 whitespace-nowrap">
                        {mov.actor_name || "System"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Showing {movements.length} of {totalCount} records
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || isLoading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="text-xs h-7"
                >
                  Previous
                </Button>
                <span className="text-xs font-semibold px-2">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages || isLoading}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="text-xs h-7"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
