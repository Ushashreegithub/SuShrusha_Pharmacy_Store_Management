"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Store,
  Users,
  Globe,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  X,
  Shield,
} from "lucide-react";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import {
  getPlatformOrganizationsApi,
  updatePlatformOrganizationStatusApi,
  ApiError,
} from "@/lib/api";
import {
  PlatformOrganizationListItem,
  PlatformPaginatedResponse,
} from "@/types/platform";

export default function PlatformOrganizationsPage() {
  const [data, setData] = useState<PlatformPaginatedResponse<PlatformOrganizationListItem> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filters & Pagination State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "suspended" | "">("");
  const [currentPage, setCurrentPage] = useState(1);

  // Status Action Modal State
  const [selectedOrg, setSelectedOrg] = useState<PlatformOrganizationListItem | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusActionSubmitting, setStatusActionSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchOrganizations = useCallback(
    async (background = false) => {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const res = await getPlatformOrganizationsApi({
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
          page: currentPage,
        });
        setData(res);
      } catch (err: any) {
        console.error("Failed to fetch organizations directory:", err);
        if (err instanceof ApiError) {
          setError(err.message || "Failed to load organizations.");
        } else {
          setError("Network error communicating with platform service.");
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [debouncedSearch, statusFilter, currentPage]
  );

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  // Handle open status change modal
  const handleOpenStatusModal = (org: PlatformOrganizationListItem) => {
    setSelectedOrg(org);
    setStatusReason("");
    setModalError(null);
  };

  // Submit status change (Activate or Suspend)
  const handleConfirmStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;

    if (!statusReason.trim() || statusReason.trim().length < 3) {
      setModalError("Please provide a reason with at least 3 characters.");
      return;
    }

    setStatusActionSubmitting(true);
    setModalError(null);

    const targetStatus = !selectedOrg.is_active;

    try {
      const res = await updatePlatformOrganizationStatusApi(selectedOrg.id, {
        is_active: targetStatus,
        reason: statusReason.trim(),
      });

      setSuccessBanner(
        targetStatus
          ? `Organization '${selectedOrg.name}' has been activated successfully.`
          : `Organization '${selectedOrg.name}' has been suspended. Evicted ${res.revoked_sessions_count} active user session(s).`
      );

      setSelectedOrg(null);
      fetchOrganizations(true);
    } catch (err: any) {
      console.error("Failed to update organization status:", err);
      if (err instanceof ApiError) {
        setModalError(err.message || "Failed to update organization status.");
      } else {
        setModalError("An unexpected error occurred while communicating with the server.");
      }
    } finally {
      setStatusActionSubmitting(false);
    }
  };

  const totalPages = data ? Math.ceil(data.count / 20) : 1;

  return (
    <PlatformLayout
      title="Pharmacy Organizations Directory"
      subtitle="Comprehensive tenant registry, branch counts, domain bindings, and lifecycle controls."
      actions={
        <button
          onClick={() => fetchOrganizations(true)}
          disabled={isRefreshing || isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
          <span>Refresh</span>
        </button>
      }
    >
      <div className="space-y-6">
        {/* Success Banner */}
        {successBanner && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between gap-3 text-emerald-800 text-xs font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successBanner}</span>
            </div>
            <button
              onClick={() => setSuccessBanner(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-rose-900">Directory Error</h4>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => fetchOrganizations()}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* ========================================== */}
        {/* SEARCH & FILTER CONTROLS */}
        {/* ========================================== */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by organization name, slug, or owner email..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium mr-1">Status:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                onClick={() => {
                  setStatusFilter("");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                  statusFilter === ""
                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                onClick={() => {
                  setStatusFilter("active");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                  statusFilter === "active"
                    ? "bg-white text-emerald-700 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => {
                  setStatusFilter("suspended");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                  statusFilter === "suspended"
                    ? "bg-white text-rose-700 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Suspended
              </button>
            </div>
          </div>
        </div>

        {/* Directory Table Summary */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-800">{data?.results.length || 0}</span> of{" "}
            <span className="font-semibold text-slate-800">{data?.count || 0}</span> organizations
            {debouncedSearch && <span> matching &ldquo;{debouncedSearch}&rdquo;</span>}
          </div>
          {data && data.count > 0 && (
            <span>
              Page {currentPage} of {totalPages}
            </span>
          )}
        </div>

        {/* ========================================== */}
        {/* DIRECTORY TABLE / LIST */}
        {/* ========================================== */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {isLoading && !data ? (
            <div className="p-8 space-y-4 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-lg w-full" />
              ))}
            </div>
          ) : data && data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5">Organization</th>
                    <th className="px-4 py-3.5">Owner Account</th>
                    <th className="px-4 py-3.5 text-center">Branches</th>
                    <th className="px-4 py-3.5 text-center">Users</th>
                    <th className="px-4 py-3.5">Mapped Domains</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {data.results.map((org) => (
                    <tr key={org.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Slug */}
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                            {org.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <Link
                              href={`/platform/organizations/${org.id}`}
                              className="font-bold text-slate-900 hover:text-indigo-600 transition-colors text-sm"
                            >
                              {org.name}
                            </Link>
                            <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                              slug: {org.slug}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Owner */}
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-800">
                          {org.owner_name || "Unassigned"}
                        </div>
                        <div className="text-slate-500 text-[11px] truncate max-w-[180px]">
                          {org.owner_email || "No email"}
                        </div>
                      </td>

                      {/* Branches */}
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 bg-slate-100 text-slate-700 font-semibold rounded text-[11px]">
                          {org.stores_count}
                        </span>
                      </td>

                      {/* Users */}
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 bg-slate-100 text-slate-700 font-semibold rounded text-[11px]">
                          {org.users_count}
                        </span>
                      </td>

                      {/* Domains */}
                      <td className="px-4 py-4">
                        {org.domains && org.domains.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                            {org.domains.map((d) => (
                              <span
                                key={d.id}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                  d.is_verified
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}
                                title={d.is_verified ? "Verified Domain" : "Pending DNS Verification"}
                              >
                                <Globe className="w-2.5 h-2.5" />
                                <span className="truncate max-w-[130px]">{d.domain}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Platform Default</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        {org.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span>Suspended</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/platform/organizations/${org.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>

                          {org.is_active ? (
                            <button
                              onClick={() => handleOpenStatusModal(org)}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-xs border border-rose-200 transition-colors"
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenStatusModal(org)}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-lg text-xs border border-emerald-200 transition-colors"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <h4 className="text-sm font-bold text-slate-800">No organizations found</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No pharmacy organizations match your current search and filter criteria.
              </p>
            </div>
          )}

          {/* Pagination Controls */}
          {data && totalPages > 1 && (
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={!data.previous || currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white font-medium shadow-sm transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <span className="text-slate-500 font-medium">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={!data.next || currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white font-medium shadow-sm transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================== */}
      {/* STATUS CHANGE MODAL (Suspend / Activate) */}
      {/* ========================================== */}
      {selectedOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      selectedOrg.is_active
                        ? "bg-rose-50 text-rose-600 border border-rose-200"
                        : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                    }`}
                  >
                    {selectedOrg.is_active ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedOrg.is_active ? "Suspend Organization" : "Activate Organization"}
                    </h3>
                    <p className="text-xs text-slate-500">{selectedOrg.name}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedOrg(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Warning Context */}
              <div
                className={`mt-4 p-3.5 rounded-xl text-xs leading-relaxed ${
                  selectedOrg.is_active
                    ? "bg-rose-50 border border-rose-200 text-rose-800"
                    : "bg-emerald-50 border border-emerald-200 text-emerald-800"
                }`}
              >
                {selectedOrg.is_active ? (
                  <>
                    <strong>Security Warning:</strong> Suspending this organization will immediately{" "}
                    <strong>terminate all active user sessions</strong> across all branches of{" "}
                    {selectedOrg.name} and block subsequent logins.
                  </>
                ) : (
                  <>
                    Activating this organization will restore access for its owner and verified staff members.
                  </>
                )}
              </div>

              {/* Modal Error */}
              {modalError && (
                <div className="mt-3 p-2.5 bg-rose-100/70 border border-rose-300 rounded-lg text-xs text-rose-800 font-medium">
                  {modalError}
                </div>
              )}

              {/* Form Form */}
              <form onSubmit={handleConfirmStatusChange} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Administrative Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="Enter reason for audit logs (e.g. Compliance review, payment default, manual activation)..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Minimum 3 characters. This action is permanently recorded in the platform audit trail.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOrg(null)}
                    disabled={statusActionSubmitting}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={statusActionSubmitting || statusReason.trim().length < 3}
                    className={`px-4 py-2 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm disabled:opacity-50 ${
                      selectedOrg.is_active
                        ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                        : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                    }`}
                  >
                    {statusActionSubmitting
                      ? "Processing..."
                      : selectedOrg.is_active
                      ? "Confirm Suspension"
                      : "Confirm Activation"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </PlatformLayout>
  );
}

