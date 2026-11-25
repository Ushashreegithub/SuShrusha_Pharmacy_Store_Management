"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Search,
  PlusCircle,
  CheckCircle2,
  Ban,
  Store,
  UserCog,
  X,
  RefreshCw,
} from "lucide-react";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import {
  getPartnerPharmaciesApi,
  getPartnerPharmacyDetailApi,
  updatePartnerPharmacyStatusApi,
  ApiError,
} from "@/lib/api";
import {
  PartnerPharmacyItem,
  PartnerPharmacyDetailResponse,
} from "@/types/partner";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function PartnerPharmaciesContent() {
  const searchParams = useSearchParams();
  const initialSelectedId = searchParams.get("selected");

  const [items, setItems] = useState<PartnerPharmacyItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [detailData, setDetailData] = useState<PartnerPharmacyDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [statusTarget, setStatusTarget] = useState<{
    org: PartnerPharmacyItem;
    nextActive: boolean;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const loadPharmacies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPartnerPharmaciesApi({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        page_size: 50,
      });
      setItems(res.results);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to load customer pharmacies.");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadPharmacies();
  }, [loadPharmacies]);

  const openDetail = useCallback(async (orgId: string) => {
    setDetailLoading(true);
    try {
      const res = await getPartnerPharmacyDetailApi(orgId);
      setDetailData(res);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to load pharmacy details.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialSelectedId) {
      openDetail(initialSelectedId);
    }
  }, [initialSelectedId, openDetail]);

  const handleConfirmStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTarget || reason.trim().length < 3) return;
    setStatusSubmitting(true);
    setError(null);
    try {
      const res = await updatePartnerPharmacyStatusApi(statusTarget.org.id, {
        is_active: statusTarget.nextActive,
        reason: reason.trim(),
      });
      setActionNotice(res.message);
      setStatusTarget(null);
      setReason("");
      await loadPharmacies();
      if (detailData?.pharmacy.id === statusTarget.org.id) {
        await openDetail(statusTarget.org.id);
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Status update failed.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  return (
    <PartnerLayout
      title="Customer Pharmacies"
      subtitle="View and manage independent pharmacy organizations onboarded by Sushrusha."
      actions={
        <Link href="/sushrusha/partner/pharmacies/create">
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="text-xs bg-[#0F766E] hover:bg-[#0D645D] flex items-center gap-1.5"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Create Pharmacy</span>
          </Button>
        </Link>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {actionNotice && (
        <div className="mb-4">
          <Alert variant="success">{actionNotice}</Alert>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by pharmacy name, city, or manager email..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 focus:border-[#0F766E]"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-[#0F766E]"
          >
            <option value="">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Suspended Only</option>
          </select>
          <Button type="button" variant="secondary" size="sm" onClick={loadPharmacies} className="text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Pharmacy Organization</th>
                <th className="py-3 px-4">Primary Manager</th>
                <th className="py-3 px-4">Stores</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    Loading customer pharmacies...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    No customer pharmacies match the current filter.
                  </td>
                </tr>
              ) : (
                items.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900 text-sm">{org.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {org.city ? `${org.city}${org.state ? `, ${org.state}` : ""} · ` : ""}
                        {org.slug}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      {org.primary_manager ? (
                        <div>
                          <p className="font-medium text-slate-800">{org.primary_manager.full_name}</p>
                          <p className="text-[11px] text-slate-500">{org.primary_manager.email}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No manager assigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900">{org.stores_count}</span>
                      <span className="text-slate-500"> ({org.active_stores_count} active)</span>
                    </td>
                    <td className="py-3.5 px-4">
                      {org.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <Ban className="w-3 h-3" /> Suspended
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openDetail(org.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 font-semibold text-slate-700"
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusTarget({ org, nextActive: !org.is_active });
                          setReason("");
                        }}
                        className={`px-2.5 py-1.5 rounded-lg font-semibold border ${
                          org.is_active
                            ? "border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"
                            : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                        }`}
                      >
                        {org.is_active ? "Suspend" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pharmacy Detail Drawer / Modal */}
      {(detailData || detailLoading) && (
        <div className="fixed inset-0 z-40 flex items-center justify-end bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl border-l border-slate-200 p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {detailLoading ? "Loading Pharmacy..." : detailData?.pharmacy.name}
                </h2>
                {detailData && (
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {detailData.pharmacy.slug} · {detailData.pharmacy.is_active ? "Active" : "Suspended"}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailData(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailData && (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 block">Contact Email</span>
                    <span className="font-medium text-slate-800">{detailData.pharmacy.contact_email || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Contact Phone</span>
                    <span className="font-medium text-slate-800">{detailData.pharmacy.contact_phone || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">License Number</span>
                    <span className="font-medium text-slate-800">{detailData.pharmacy.license_number || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">GSTIN</span>
                    <span className="font-medium text-slate-800">{detailData.pharmacy.gstin || "—"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block">Address</span>
                    <span className="font-medium text-slate-800">
                      {[detailData.pharmacy.address, detailData.pharmacy.city, detailData.pharmacy.state, detailData.pharmacy.postal_code]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-[#0F766E]" />
                      Stores ({detailData.stores.length})
                    </h3>
                    <Link
                      href={`/sushrusha/partner/stores?org=${detailData.pharmacy.id}`}
                      className="text-xs font-semibold text-[#0F766E] hover:underline"
                    >
                      Manage Stores
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {detailData.stores.length === 0 ? (
                      <p className="text-xs text-slate-500">No stores provisioned yet.</p>
                    ) : (
                      detailData.stores.map((st) => (
                        <div key={st.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-semibold text-slate-900">{st.name}</p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {st.code} · {st.city || "No city"}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 capitalize">
                            {st.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <UserCog className="w-3.5 h-3.5 text-[#0F766E]" />
                      Managers ({detailData.managers.length})
                    </h3>
                    <Link
                      href={`/sushrusha/partner/managers?org=${detailData.pharmacy.id}`}
                      className="text-xs font-semibold text-[#0F766E] hover:underline"
                    >
                      Manage Managers
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {detailData.managers.length === 0 ? (
                      <p className="text-xs text-slate-500">No managers provisioned yet.</p>
                    ) : (
                      detailData.managers.map((m) => (
                        <div key={m.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-semibold text-slate-900">{m.full_name}</p>
                            <p className="text-[11px] text-slate-500">{m.email}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.is_active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                            {m.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Status Confirmation Modal */}
      {statusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleConfirmStatus} className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {statusTarget.nextActive ? "Activate Customer Pharmacy" : "Suspend Customer Pharmacy"}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {statusTarget.nextActive
                ? `Reactivate "${statusTarget.org.name}" so authorized managers and staff can sign in again.`
                : `Suspending "${statusTarget.org.name}" immediately terminates active sessions and blocks logins while preserving all historical data.`}
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Audit Reason (required)
              </label>
              <textarea
                rows={3}
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for audit trail..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStatusTarget(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={statusSubmitting}
                className={statusTarget.nextActive ? "bg-[#0F766E]" : "bg-rose-600 hover:bg-rose-700"}
              >
                {statusTarget.nextActive ? "Confirm Activate" : "Confirm Suspend"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </PartnerLayout>
  );
}

export default function PartnerPharmaciesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC]" />}>
      <PartnerPharmaciesContent />
    </Suspense>
  );
}
