"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Globe,
  Search,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Building2,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  FileCheck2,
  Info,
  Server,
} from "lucide-react";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import {
  getPlatformDomainsApi,
  getPlatformHostInfoApi,
  createPlatformDomainApi,
  verifyPlatformDomainApi,
  updatePlatformDomainStatusApi,
  deletePlatformDomainApi,
  getPlatformOrganizationsApi,
  ApiError,
} from "@/lib/api";
import {
  PlatformDomainItem,
  PlatformHostInfo,
  PlatformPaginatedResponse,
  PlatformOrganizationListItem,
} from "@/types/platform";

export default function PlatformDomainsPage() {
  const [data, setData] = useState<PlatformPaginatedResponse<PlatformDomainItem> | null>(null);
  const [hostInfo, setHostInfo] = useState<PlatformHostInfo | null>(null);
  const [organizations, setOrganizations] = useState<PlatformOrganizationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "suspended" | "pending" | "">("");
  const [verifiedFilter, setVerifiedFilter] = useState<"true" | "false" | "">("");
  const [currentPage, setCurrentPage] = useState(1);

  // Register Modal
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [newDomainName, setNewDomainName] = useState("");
  const newDomainType = "client" as const;
  const [isPrimaryDomain, setIsPrimaryDomain] = useState(false);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Manual Verification Modal
  const [verifyModalDomain, setVerifyModalDomain] = useState<PlatformDomainItem | null>(null);
  const [verifyReason, setVerifyReason] = useState("");
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Status Change Modal (Suspend / Activate)
  const [statusModalDomain, setStatusModalDomain] = useState<PlatformDomainItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<"active" | "suspended" | "pending">("active");
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Delete Modal
  const [deleteModalDomain, setDeleteModalDomain] = useState<PlatformDomainItem | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Load Orgs & Host Info for dropdown & platform card
  useEffect(() => {
    async function loadMeta() {
      try {
        const [orgsRes, hInfo] = await Promise.all([
          getPlatformOrganizationsApi({ page_size: 100 }),
          getPlatformHostInfoApi(),
        ]);
        if (orgsRes && orgsRes.results) setOrganizations(orgsRes.results);
        if (hInfo) setHostInfo(hInfo);
      } catch (err) {
        console.warn("Could not pre-fetch domain metadata:", err);
      }
    }
    loadMeta();
  }, []);

  const fetchDomains = useCallback(
    async (background = false) => {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const res = await getPlatformDomainsApi({
          search: debouncedSearch || undefined,
          organization_id: orgFilter || undefined,
          status: statusFilter || undefined,
          is_verified: verifiedFilter || undefined,
          page: currentPage,
        });
        setData(res);
      } catch (err: any) {
        console.error("Failed to fetch domains:", err);
        if (err instanceof ApiError) {
          setError(err.message || "Failed to load domain mappings.");
        } else {
          setError("Network error communicating with platform domain service.");
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [debouncedSearch, orgFilter, statusFilter, verifiedFilter, currentPage]
  );

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // Register Submit
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !newDomainName.trim()) {
      setRegisterError("Organization and Domain name are required.");
      return;
    }

    setRegisterSubmitting(true);
    setRegisterError(null);

    try {
      await createPlatformDomainApi({
        organization_id: selectedOrgId,
        domain: newDomainName.trim(),
        domain_type: newDomainType,
        is_primary: isPrimaryDomain,
      });

      setSuccessBanner(`Domain '${newDomainName.trim()}' registered in Pending state.`);
      setRegisterModalOpen(false);
      setSelectedOrgId("");
      setNewDomainName("");
      setIsPrimaryDomain(false);
      fetchDomains(true);
    } catch (err: any) {
      console.error("Failed to register domain:", err);
      setRegisterError(err.message || "Failed to register domain mapping.");
    } finally {
      setRegisterSubmitting(false);
    }
  };

  // Manual Verify Submit
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyModalDomain) return;
    if (!verifyReason.trim() || verifyReason.trim().length < 3) {
      setVerifyError("Reason must be at least 3 characters.");
      return;
    }

    setVerifySubmitting(true);
    setVerifyError(null);

    try {
      await verifyPlatformDomainApi(verifyModalDomain.id, {
        reason: verifyReason.trim(),
      });
      setSuccessBanner(
        `Domain '${verifyModalDomain.domain}' manually verified and activated by Platform Owner.`
      );
      setVerifyModalDomain(null);
      fetchDomains(true);
    } catch (err: any) {
      console.error("Failed to verify domain:", err);
      setVerifyError(err.message || "Failed to verify domain.");
    } finally {
      setVerifySubmitting(false);
    }
  };

  // Status Change Submit
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalDomain) return;
    if (!statusReason.trim() || statusReason.trim().length < 3) {
      setStatusError("Reason must be at least 3 characters.");
      return;
    }

    setStatusSubmitting(true);
    setStatusError(null);

    try {
      await updatePlatformDomainStatusApi(statusModalDomain.id, {
        status: targetStatus,
        reason: statusReason.trim(),
      });
      setSuccessBanner(`Domain '${statusModalDomain.domain}' status updated to '${targetStatus}'.`);
      setStatusModalDomain(null);
      fetchDomains(true);
    } catch (err: any) {
      console.error("Failed to update domain status:", err);
      setStatusError(err.message || "Failed to update domain status.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  // Delete Submit
  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteModalDomain) return;

    setDeleteSubmitting(true);
    setDeleteError(null);

    try {
      await deletePlatformDomainApi(deleteModalDomain.id, deleteReason.trim());
      setSuccessBanner(`Domain mapping '${deleteModalDomain.domain}' deleted successfully.`);
      setDeleteModalDomain(null);
      fetchDomains(true);
    } catch (err: any) {
      console.error("Failed to delete domain:", err);
      setDeleteError(err.message || "Failed to delete domain mapping.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const totalPages = data ? Math.ceil(data.count / 20) : 1;

  return (
    <PlatformLayout
      title="Domain Management"
      subtitle="Manage pharmacy domains connected to your PharmaPro platform."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchDomains(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              setRegisterModalOpen(true);
              setRegisterError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm shadow-indigo-600/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Domain</span>
          </button>
        </div>
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

        {/* Global Error */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-rose-900">Domain Console Error</h4>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => fetchDomains()}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* ========================================== */}
        {/* MAIN PLATFORM DOMAIN CARD */}
        {/* ========================================== */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-base font-bold text-white">
                  {hostInfo?.primary_platform_domain || "pharmapro.diracai.com"}
                </span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold uppercase tracking-wider">
                  Main Platform Domain
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Central PharmaPro application and login gateway.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Active</span>
            </span>
          </div>
        </div>

        {/* Configured Host Routing Fallback Notice (only for production hosts not yet recorded in DB) */}
        {hostInfo?.configured_client_mappings &&
          hostInfo.configured_client_mappings.filter((m) => !m.in_database).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <Info className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Unregistered Environment Routing Configuration Detected</span>
              </div>
              {hostInfo.configured_client_mappings
                .filter((m) => !m.in_database)
                .map((m) => (
                  <div
                    key={m.domain}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-amber-200/70"
                  >
                    <div>
                      <div>
                        Host <span className="font-mono font-bold text-slate-900">{m.domain}</span> is present in server routing configuration, but has no database{" "}
                        <code>OrganizationDomain</code> row yet.
                      </div>
                      <div className="text-[11px] text-amber-800 mt-0.5">
                        {m.organization_id ? (
                          <span>
                            Matched Organization: <strong>{m.organization_name}</strong> (ID: <code className="font-mono">{m.organization_id}</code>) • Owner: {m.owner_email}
                          </span>
                        ) : (
                          <span>
                            Configured target slug <code className="font-mono">&ldquo;{m.configured_target_slug}&rdquo;</code> does not match any existing organization in this database.
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setNewDomainName(m.domain);
                        if (m.organization_id) setSelectedOrgId(m.organization_id);
                        setRegisterError(null);
                        setRegisterModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg text-[11px] shrink-0 transition-colors"
                    >
                      Register Mapping in DB
                    </button>
                  </div>
                ))}
            </div>
          )}

        {/* ========================================== */}
        {/* SEARCH & FILTERS BAR */}
        {/* ========================================== */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by domain hostname (e.g. erp.client.com)..."
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

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Organization Filter */}
            <select
              value={orgFilter}
              onChange={(e) => {
                setOrgFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Organizations</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            {/* Verification Filter */}
            <select
              value={verifiedFilter}
              onChange={(e) => {
                setVerifiedFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Verification</option>
              <option value="true">Verified Only</option>
              <option value="false">Pending Verification</option>
            </select>

            {/* Status Segmented Buttons */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                onClick={() => {
                  setStatusFilter("");
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 font-medium rounded-md transition-colors ${
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
                className={`px-2.5 py-1.5 font-medium rounded-md transition-colors ${
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
                className={`px-2.5 py-1.5 font-medium rounded-md transition-colors ${
                  statusFilter === "suspended"
                    ? "bg-white text-rose-700 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Suspended
              </button>
              <button
                onClick={() => {
                  setStatusFilter("pending");
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 font-medium rounded-md transition-colors ${
                  statusFilter === "pending"
                    ? "bg-white text-amber-700 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Pending
              </button>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-800">{data?.results.length || 0}</span> of{" "}
            <span className="font-semibold text-slate-800">{data?.count || 0}</span> registered host domains
          </div>
          {data && data.count > 0 && (
            <span>
              Page {currentPage} of {totalPages}
            </span>
          )}
        </div>

        {/* ========================================== */}
        {/* DOMAINS TABLE */}
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
                    <th className="px-5 py-3.5">Hostname &amp; Binding</th>
                    <th className="px-4 py-3.5">Organization &amp; Registration Info</th>
                    <th className="px-4 py-3.5">Verification Status</th>
                    <th className="px-4 py-3.5">Connection Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {data.results.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Hostname & Binding */}
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900">{item.domain}</span>
                          <span
                            className={`text-[10px] uppercase font-semibold px-1.5 py-0.2 rounded border ${
                              item.domain_type === "platform"
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-indigo-50 text-indigo-700 border-indigo-200"
                            }`}
                          >
                            {item.domain_type}
                          </span>
                          {item.is_primary && (
                            <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 font-semibold rounded text-[10px] border border-indigo-200">
                              Primary
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Mapped: {new Date(item.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Organization & Registration Info */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">{item.organization_name}</span>
                          {item.organization_is_active !== undefined && (
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                item.organization_is_active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {item.organization_is_active ? "Org Active" : "Org Suspended"}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                          {item.owner_email && (
                            <div className="truncate max-w-[260px]">
                              Owner: <span className="font-medium text-slate-700">{item.owner_name || "Owner"}</span> ({item.owner_email})
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 font-mono space-y-0.5">
                            <div>
                              ID: {item.organization_id}
                              {item.organization_slug && ` • slug: ${item.organization_slug}`}
                            </div>
                            <div>
                              {item.stores_count !== undefined && `${item.stores_count} branch(es)`}
                              {item.organization_created_at && ` • Registered: ${new Date(item.organization_created_at).toLocaleDateString()}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Verification Status (Never claim DNS verified without actual check) */}
                      <td className="px-4 py-4">
                        {item.is_verified ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Manually Verified (Admin Attested)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-semibold text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Unverified (Pending DNS)</span>
                          </span>
                        )}
                      </td>

                      {/* Connection Status */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            item.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : item.status === "suspended"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {item.status === "suspended" ? "Deactivated" : item.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Manual Verify Action (if not yet verified) */}
                          {!item.is_verified && (
                            <button
                              onClick={() => {
                                setVerifyModalDomain(item);
                                setVerifyReason("");
                                setVerifyError(null);
                              }}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs border border-indigo-200 transition-colors"
                              title="Perform Manual Administrator Verification"
                            >
                              Verify
                            </button>
                          )}

                          {/* Status Toggle Action (only allow Activate when domain is verified) */}
                          {item.status === "active" ? (
                            <button
                              onClick={() => {
                                setStatusModalDomain(item);
                                setTargetStatus("suspended");
                                setStatusReason("");
                                setStatusError(null);
                              }}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold rounded-lg text-xs border border-amber-200 transition-colors"
                            >
                              Deactivate
                            </button>
                          ) : item.is_verified ? (
                            <button
                              onClick={() => {
                                setStatusModalDomain(item);
                                setTargetStatus("active");
                                setStatusReason("");
                                setStatusError(null);
                              }}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-lg text-xs border border-emerald-200 transition-colors"
                            >
                              Activate
                            </button>
                          ) : null}

                          {/* Disconnect Mapping */}
                          <button
                            onClick={() => {
                              setDeleteModalDomain(item);
                              setDeleteReason("");
                              setDeleteError(null);
                            }}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-xs border border-rose-200 transition-colors"
                            title="Disconnect Domain Mapping"
                          >
                            Disconnect
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <Globe className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <h4 className="text-sm font-bold text-slate-800">No domain mappings found</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No custom domains match your current search or filter settings.
              </p>
            </div>
          )}

          {/* Pagination */}
          {data && totalPages > 1 && (
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={!data.previous || currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-medium shadow-sm transition-colors"
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
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-medium shadow-sm transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================== */}
      {/* 1. REGISTER DOMAIN MODAL */}
      {/* ========================================== */}
      {registerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Register Domain Mapping</h3>
                    <p className="text-xs text-slate-500">Associate a client hostname with an existing pharmacy organization</p>
                  </div>
                </div>
                <button
                  onClick={() => setRegisterModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mandatory Explanatory Note */}
              <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  Registering a domain records its association with an existing pharmacy organization. DNS, SSL and reverse-proxy configuration must be completed separately.
                </span>
              </div>

              {registerError && (
                <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-800 font-medium">
                  {registerError}
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className="mt-4 space-y-4">
                {/* Hostname */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Domain Hostname <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newDomainName}
                    onChange={(e) => setNewDomainName(e.target.value)}
                    placeholder="e.g. erp.sushrusaeclinic.com"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Valid FQDN without protocol (no https://). Reserved platform hosts and local dev domains are blocked.
                  </p>
                </div>

                {/* Target Organization */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Existing Pharmacy Organization <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">Select existing organization...</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.slug}) — {org.owner_email || "No owner email"}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Verification Method & Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Verification Status &amp; Method
                  </label>
                  <div className="w-full px-3 py-2 text-xs bg-amber-50 border border-amber-200 rounded-lg text-amber-900 font-medium">
                    Pending Verification (Manual administrator verification required after DNS/SSL setup)
                  </div>
                </div>

                {/* Primary Binding Option */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPrimaryDomain}
                      onChange={(e) => setIsPrimaryDomain(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span className="text-xs font-medium text-slate-700">Mark as Primary Client Domain</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">Type: client</span>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setRegisterModalOpen(false)}
                    disabled={registerSubmitting}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={registerSubmitting || !selectedOrgId || !newDomainName.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs shadow-sm shadow-indigo-600/30 disabled:opacity-50"
                  >
                    {registerSubmitting ? "Registering..." : "Register Domain"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 2. MANUAL VERIFICATION ATTESTATION MODAL */}
      {/* ========================================== */}
      {verifyModalDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Manual Administrator Verification
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">{verifyModalDomain.domain}</p>
                  </div>
                </div>
                <button
                  onClick={() => setVerifyModalDomain(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Explicit Security Notice */}
              <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed">
                <div className="flex items-center gap-1.5 font-bold mb-1 text-amber-900">
                  <Info className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Manual Ownership Attestation</span>
                </div>
                You are manually attesting that DNS CNAME/A records and SSL certificates have been verified out-of-band for <strong>{verifyModalDomain.domain}</strong>. This verification is permanently recorded with your Platform Owner signature and timestamp.
              </div>

              {verifyError && (
                <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-800 font-medium">
                  {verifyError}
                </div>
              )}

              <form onSubmit={handleVerifySubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Verification Audit Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={verifyReason}
                    onChange={(e) => setVerifyReason(e.target.value)}
                    placeholder="Enter explicit verification details (e.g. Confirmed Cloudflare DNS CNAME pointing to proxy ingress)..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Minimum 3 characters. Never mark a domain verified without out-of-band validation.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setVerifyModalDomain(null)}
                    disabled={verifySubmitting}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={verifySubmitting || verifyReason.trim().length < 3}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs shadow-sm shadow-emerald-600/30 disabled:opacity-50"
                  >
                    {verifySubmitting ? "Attesting..." : "Attest & Activate Domain"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 3. STATUS CHANGE MODAL */}
      {/* ========================================== */}
      {statusModalDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      targetStatus === "active"
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                        : "bg-rose-50 text-rose-600 border border-rose-200"
                    }`}
                  >
                    {targetStatus === "active" ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {targetStatus === "active" ? "Activate Domain Route" : "Suspend Domain Route"}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">{statusModalDomain.domain}</p>
                  </div>
                </div>
                <button
                  onClick={() => setStatusModalDomain(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {statusError && (
                <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-800 font-medium">
                  {statusError}
                </div>
              )}

              <form onSubmit={handleStatusSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Administrative Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="Enter reason for audit record..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setStatusModalDomain(null)}
                    disabled={statusSubmitting}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={statusSubmitting || statusReason.trim().length < 3}
                    className={`px-4 py-2 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm disabled:opacity-50 ${
                      targetStatus === "active"
                        ? "bg-emerald-600 hover:bg-emerald-500"
                        : "bg-rose-600 hover:bg-rose-500"
                    }`}
                  >
                    {statusSubmitting ? "Processing..." : `Confirm ${targetStatus === "active" ? "Activation" : "Deactivation"}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 4. DISCONNECT DOMAIN MODAL */}
      {/* ========================================== */}
      {deleteModalDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Disconnect Domain Mapping</h3>
                    <p className="text-xs text-slate-500 font-mono">{deleteModalDomain.domain}</p>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteModalDomain(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 leading-relaxed">
                This will disconnect and remove the domain binding for <strong>{deleteModalDomain.organization_name}</strong>. Incoming traffic on this host will immediately stop resolving to this pharmacy tenant.
              </div>

              {deleteError && (
                <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-800 font-medium">
                  {deleteError}
                </div>
              )}

              <form onSubmit={handleDeleteSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Disconnection Reason
                  </label>
                  <input
                    type="text"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="e.g. Tenant offboarded, domain migrated..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteModalDomain(null)}
                    disabled={deleteSubmitting}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deleteSubmitting}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg text-xs shadow-sm shadow-rose-600/30 disabled:opacity-50"
                  >
                    {deleteSubmitting ? "Disconnecting..." : "Confirm Disconnect"}
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

