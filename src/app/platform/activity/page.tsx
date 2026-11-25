"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Building2,
  Calendar,
  Globe,
  Clock,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  X,
  Radio,
  Laptop,
} from "lucide-react";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import {
  getPlatformLoginActivityApi,
  getPlatformOrganizationsApi,
  ApiError,
} from "@/lib/api";
import {
  PlatformLoginActivityItem,
  PlatformPaginatedResponse,
  PlatformOrganizationListItem,
} from "@/types/platform";

export default function PlatformLoginActivityPage() {
  const [data, setData] = useState<PlatformPaginatedResponse<PlatformLoginActivityItem> | null>(null);
  const [organizations, setOrganizations] = useState<PlatformOrganizationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [emailSearch, setEmailSearch] = useState("");
  const [debouncedEmail, setDebouncedEmail] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"SUCCESS" | "FAILED" | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce email search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedEmail(emailSearch.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [emailSearch]);

  // Load Orgs for filter dropdown
  useEffect(() => {
    async function loadOrgs() {
      try {
        const res = await getPlatformOrganizationsApi({ page_size: 100 });
        if (res && res.results) setOrganizations(res.results);
      } catch (err) {
        console.warn("Could not pre-fetch organizations:", err);
      }
    }
    loadOrgs();
  }, []);

  const fetchActivity = useCallback(
    async (background = false) => {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const res = await getPlatformLoginActivityApi({
          email: debouncedEmail || undefined,
          organization_id: orgFilter || undefined,
          status: statusFilter || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          page: currentPage,
        });

        // If date filters applied on client side when backend doesn't filter queryset:
        let results = res.results;
        if (startDate || endDate) {
          results = results.filter((item) => {
            const itemDate = new Date(item.timestamp).toISOString().split("T")[0];
            if (startDate && itemDate < startDate) return false;
            if (endDate && itemDate > endDate) return false;
            return true;
          });
        }

        setData({ ...res, results });
      } catch (err: any) {
        console.error("Failed to fetch login activity:", err);
        if (err instanceof ApiError) {
          setError(err.message || "Failed to load authentication activity records.");
        } else {
          setError("Network error communicating with platform activity service.");
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [debouncedEmail, orgFilter, statusFilter, startDate, endDate, currentPage]
  );

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const clearFilters = () => {
    setEmailSearch("");
    setOrgFilter("");
    setStatusFilter("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(
    emailSearch || orgFilter || statusFilter || startDate || endDate
  );

  const totalPages = data ? Math.ceil(data.count / 20) : 1;

  return (
    <PlatformLayout
      title="Global Login Activity &amp; Authentication Trail"
      subtitle="Complete chronological audit of successful, failed, and rejected login events across all tenant boundaries."
      actions={
        <button
          onClick={() => fetchActivity(true)}
          disabled={isRefreshing || isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
          <span>Refresh</span>
        </button>
      }
    >
      <div className="space-y-6">
        {/* Error Notification */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-rose-900">Activity Log Error</h4>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => fetchActivity()}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* ========================================== */}
        {/* SEARCH & FILTERS CONTROLS */}
        {/* ========================================== */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Email Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
                placeholder="Search by attempted or account email..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
              {emailSearch && (
                <button
                  onClick={() => setEmailSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

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

            {/* Status Segmented Control */}
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
                All Status
              </button>
              <button
                onClick={() => {
                  setStatusFilter("SUCCESS");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                  statusFilter === "SUCCESS"
                    ? "bg-white text-emerald-700 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Success
              </button>
              <button
                onClick={() => {
                  setStatusFilter("FAILED");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                  statusFilter === "FAILED"
                    ? "bg-white text-rose-700 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Failed
              </button>
            </div>
          </div>

          {/* Date Range Row */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Date Range:</span>
            </span>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium ml-auto"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Summary Header */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-800">{data?.results.length || 0}</span> events{" "}
            (Total logged: <span className="font-semibold text-slate-800">{data?.count || 0}</span>)
          </div>
          {data && data.count > 0 && (
            <span>
              Page {currentPage} of {totalPages}
            </span>
          )}
        </div>

        {/* ========================================== */}
        {/* ACTIVITY LOG TABLE */}
        {/* ========================================== */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {isLoading && !data ? (
            <div className="p-8 space-y-4 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-lg w-full" />
              ))}
            </div>
          ) : data && data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5">Outcome</th>
                    <th className="px-4 py-3.5">Account / Attempted Email</th>
                    <th className="px-4 py-3.5">Organization</th>
                    <th className="px-4 py-3.5">Network IP</th>
                    <th className="px-4 py-3.5">Device / User Agent</th>
                    <th className="px-5 py-3.5 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {data.results.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Outcome Badge */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {item.status === "SUCCESS" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Success</span>
                          </span>
                        ) : item.status === "LOGOUT" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Signed Out</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{item.event_type === "AUTH_CROSS_TENANT_REJECTED" ? "Tenant Rejected" : "Failed"}</span>
                          </span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3.5 font-medium text-slate-900">
                        {item.user_email || <span className="text-slate-400 italic">Unknown</span>}
                      </td>

                      {/* Organization */}
                      <td className="px-4 py-3.5">
                        {item.organization_name ? (
                          <span className="font-semibold text-slate-800">{item.organization_name}</span>
                        ) : (
                          <span className="text-slate-400 italic">Platform Level / Global</span>
                        )}
                      </td>

                      {/* IP Address */}
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600">
                        {item.ip_address || <span className="text-slate-400 italic">—</span>}
                      </td>

                      {/* User Agent */}
                      <td className="px-4 py-3.5 text-slate-500 max-w-[240px] truncate" title={item.user_agent || ""}>
                        {item.user_agent ? (
                          <div className="flex items-center gap-1.5">
                            <Laptop className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{item.user_agent}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">— (Not recorded)</span>
                        )}
                      </td>

                      {/* Timestamp */}
                      <td className="px-5 py-3.5 text-right font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(item.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <Activity className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <h4 className="text-sm font-bold text-slate-800">No login activity records</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No authentication events match your active filter criteria.
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
    </PlatformLayout>
  );
}

