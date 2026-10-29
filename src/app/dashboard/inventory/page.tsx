"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  Layers,
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  ArrowLeftRight,
  SlidersHorizontal,
  ClipboardList,
  FileText,
  Truck,
  History,
  TrendingDown,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Building2,
  ChevronRight,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { OpeningStockModal } from "@/components/inventory/OpeningStockModal";
import {
  InventoryOverviewData,
  getInventoryOverviewApi,
} from "@/lib/api";

export default function InventoryOverviewPage() {
  return (
    <DashboardProvider>
      <InventoryOverviewContent />
    </DashboardProvider>
  );
}

function InventoryOverviewContent() {
  const { user, stores, activeStore, setActiveStoreId } = useDashboard();

  const [overviewData, setOverviewData] = useState<InventoryOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Opening stock modal state
  const [openingStockOpen, setOpeningStockOpen] = useState<boolean>(false);

  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";
  const canManageStock = isOwner || isManager;

  const currentStoreId = activeStore?.id || stores[0]?.id;

  const loadOverview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getInventoryOverviewApi(currentStoreId);
      setOverviewData(data);
    } catch (err: any) {
      console.error("Failed to load inventory overview:", err);
      setError(err.message || "Failed to load inventory command metrics.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [currentStoreId]);

  const kpis = overviewData?.kpis;
  const actionQueue = overviewData?.action_queue || [];
  const recentMovements = overviewData?.recent_movements || [];

  return (
    <DashboardLayout
      title="Inventory Command Center"
      subtitle={
        activeStore
          ? `${activeStore.name} (${activeStore.code}) • Operational inventory workspace & safety controls`
          : "Tenant-wide inventory overview & operational queue"
      }
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadOverview}
            isLoading={isLoading}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>

          {canManageStock && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpeningStockOpen(true)}
              className="text-xs border-[#0F766E] text-[#0F766E] hover:bg-teal-50"
            >
              <Package className="w-3.5 h-3.5 mr-1" />
              Opening Stock
            </Button>
          )}

          <Link href="/dashboard/purchases">
            <Button
              variant="primary"
              size="sm"
              className="text-xs bg-[#0F766E] hover:bg-[#115E59]"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Receive Stock (GRN)
            </Button>
          </Link>
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
                onClick={loadOverview}
                className="underline text-xs font-semibold ml-2"
              >
                Retry
              </button>
            </div>
          </Alert>
        )}

        {/* 8 Metric KPI Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* 1. Total Products */}
          <Link
            href="/dashboard/products"
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-teal-300 transition-all group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold text-slate-600">Product Master</span>
              <div className="p-2 rounded-xl bg-teal-50 text-[#0F766E] group-hover:bg-[#0F766E] group-hover:text-white transition-colors">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {isLoading ? "—" : kpis?.total_products ?? 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Cataloged SKUs</span>
              <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </Link>

          {/* 2. Active Batches */}
          <Link
            href="/dashboard/batches"
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-teal-300 transition-all group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold text-slate-600">Active Batches</span>
              <div className="p-2 rounded-xl bg-teal-50 text-[#0F766E] group-hover:bg-[#0F766E] group-hover:text-white transition-colors">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {isLoading ? "—" : kpis?.active_batches ?? 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Batches with stock &gt; 0</span>
              <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </Link>

          {/* 3. Available Saleable Stock */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold text-slate-600">Saleable Stock</span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-700 font-mono">
              {isLoading ? "—" : (kpis?.available_units ?? 0).toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              On-hand: {(kpis?.total_on_hand_units ?? 0).toLocaleString()} units
            </p>
          </div>

          {/* 4. Low Stock Alerts */}
          <Link
            href="/dashboard/batches"
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-amber-300 transition-all group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold text-slate-600">Low Stock</span>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-700 font-mono">
              {isLoading ? "—" : kpis?.low_stock_count ?? 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>At or below threshold</span>
              <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </Link>

          {/* 5. Near Expiry (<= 30 days) */}
          <Link
            href="/dashboard/batches?status=CRITICAL_NEAR_EXPIRY"
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-amber-400 transition-all group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold text-slate-600">Near Expiry (&le;30d)</span>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-700 font-mono">
              {isLoading ? "—" : kpis?.critical_near_expiry_count ?? 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>+{(kpis?.warning_near_expiry_count ?? 0)} within 90d</span>
              <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </Link>

          {/* 6. Expired Batches */}
          <Link
            href="/dashboard/batches?status=EXPIRED"
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-rose-300 transition-all group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold text-slate-600">Expired Batches</span>
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-rose-700 font-mono">
              {isLoading ? "—" : kpis?.expired_count ?? 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Must quarantine / write off</span>
              <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </Link>

          {/* 7. Quarantined Stock Units */}
          <Link
            href="/dashboard/quarantine"
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-amber-300 transition-all group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold text-slate-600">Quarantine Hold</span>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-800 font-mono">
              {isLoading ? "—" : (kpis?.total_quarantined_units ?? 0).toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>{kpis?.active_quarantine_count ?? 0} active holds</span>
              <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </Link>

          {/* 8. Active Batch Recalls */}
          <Link
            href="/dashboard/recalls"
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-rose-400 transition-all group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold text-slate-600">Batch Recalls</span>
              <div className="p-2 rounded-xl bg-rose-50 text-rose-700 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                <AlertOctagon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-rose-800 font-mono">
              {isLoading ? "—" : kpis?.active_recalls_count ?? 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Tenant-wide recall notices</span>
              <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </Link>
        </div>

        {/* Operational Action Required Queue */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Operational Action Required ({actionQueue.length})
            </h3>
            <span className="text-[11px] text-slate-500">
              Prioritized pharmacy safety & inventory workflow queue
            </span>
          </div>

          {actionQueue.length === 0 ? (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5 text-center flex items-center justify-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <p className="text-xs text-emerald-900 font-medium">
                All inventory queues are clear! No expired stock, pending adjustments, or unhandled recall cases.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {actionQueue.map((item, idx) => {
                const isCrit = item.severity === "CRITICAL";
                const isWarn = item.severity === "WARNING";
                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border transition-all ${
                      isCrit
                        ? "bg-rose-50/50 border-rose-200"
                        : isWarn
                        ? "bg-amber-50/50 border-amber-200"
                        : "bg-sky-50/50 border-sky-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isCrit
                              ? "bg-rose-100 text-rose-800"
                              : isWarn
                              ? "bg-amber-100 text-amber-800"
                              : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {item.severity}
                        </span>
                        <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-200/50 mt-3 flex justify-end">
                      <Link href={item.action_url}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 bg-white hover:bg-slate-50"
                        >
                          Take Action
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Navigation Hub (All 11 Modules) */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#0F766E]" />
            Pharmacy Inventory Modules & Operations
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              {
                title: "Product Master",
                desc: "Catalog & packaging units",
                icon: Package,
                href: "/dashboard/products",
                color: "text-teal-600 bg-teal-50",
              },
              {
                title: "Batches & FEFO",
                desc: "Batch safety & dispensing priority",
                icon: Layers,
                href: "/dashboard/batches",
                color: "text-teal-600 bg-teal-50",
              },
              {
                title: "Purchases & GRN",
                desc: "Vendor intake & cost layers",
                icon: FileText,
                href: "/dashboard/purchases",
                color: "text-sky-600 bg-sky-50",
              },
              {
                title: "Suppliers Master",
                desc: "Vendors & distributor directory",
                icon: Truck,
                href: "/dashboard/suppliers",
                color: "text-sky-600 bg-sky-50",
              },
              {
                title: "Stock Transfers",
                desc: "Branch-to-branch chain of custody",
                icon: ArrowLeftRight,
                href: "/dashboard/transfers",
                color: "text-indigo-600 bg-indigo-50",
              },
              {
                title: "Stock Adjustments",
                desc: "Threshold policies & review sign-off",
                icon: SlidersHorizontal,
                href: "/dashboard/adjustments",
                color: "text-indigo-600 bg-indigo-50",
              },
              {
                title: "Physical Stock Counts",
                desc: "Blind audits & reconciliation",
                icon: ClipboardList,
                href: "/dashboard/counts",
                color: "text-violet-600 bg-violet-50",
              },
              {
                title: "Quarantine Hold",
                desc: "Damage, excursion & safety holds",
                icon: AlertTriangle,
                href: "/dashboard/quarantine",
                color: "text-amber-600 bg-amber-50",
              },
              {
                title: "Batch Recalls",
                desc: "Tenant-wide recall enforcement",
                icon: AlertOctagon,
                href: "/dashboard/recalls",
                color: "text-rose-600 bg-rose-50",
              },
              {
                title: "Stock Ledger",
                desc: "Immutable append-only movements",
                icon: History,
                href: "/dashboard/ledger",
                color: "text-slate-600 bg-slate-100",
              },
            ].map((mod, i) => {
              const Icon = mod.icon;
              return (
                <Link
                  key={i}
                  href={mod.href}
                  className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs hover:border-teal-400 hover:shadow-xs transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${mod.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 group-hover:text-[#0F766E] transition-colors">
                        {mod.title}
                      </p>
                      <p className="text-[10px] text-slate-500">{mod.desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#0F766E] group-hover:translate-x-0.5 transition-all" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Ledger Activity Stream */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#0F766E]" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Recent Inventory Movements
              </h3>
            </div>
            <Link
              href="/dashboard/ledger"
              className="text-xs text-[#0F766E] hover:underline font-semibold flex items-center gap-1"
            >
              Explore Full Ledger
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <div className="w-5 h-5 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading movements...
            </div>
          ) : recentMovements.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-400">
              No recent movements logged yet for this store.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Product & SKU</th>
                    <th className="py-2.5 px-3">Batch #</th>
                    <th className="py-2.5 px-3">Operation</th>
                    <th className="py-2.5 px-3">Quantity Delta</th>
                    <th className="py-2.5 px-3">Balance After</th>
                    <th className="py-2.5 px-3">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {recentMovements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-[10px] font-mono text-slate-600 whitespace-nowrap">
                        {new Date(m.created_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900">{m.product_name}</span>
                        <span className="text-[10px] text-slate-500 font-mono ml-1.5">
                          ({m.product_sku})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {m.batch_number}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-800">
                          {m.movement_type_display || m.movement_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        {m.direction === "IN" ? (
                          <span className="text-emerald-700">+{m.quantity}</span>
                        ) : m.direction === "OUT" ? (
                          <span className="text-rose-700">-{m.quantity}</span>
                        ) : (
                          <span className="text-amber-700">{m.quantity} (Hold)</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {m.balance_after}
                      </td>
                      <td className="py-2.5 px-3 text-[10px] text-slate-500">
                        {m.actor_name || "System"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Opening Stock Guided Modal */}
      <OpeningStockModal
        isOpen={openingStockOpen}
        onClose={() => setOpeningStockOpen(false)}
        onSuccess={() => {
          loadOverview();
        }}
        defaultStoreId={currentStoreId}
      />
    </DashboardLayout>
  );
}
