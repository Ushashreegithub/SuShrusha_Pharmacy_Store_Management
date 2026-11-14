"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Search,
  Filter,
  Download,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Building2,
  Clock,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
  Activity,
  User,
  Globe,
  SlidersHorizontal,
} from "lucide-react";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import {
  getPlatformAuditApi,
  getPlatformOrganizationsApi,
  ApiError,
} from "@/lib/api";
import {
  PlatformAuditItem,
  PlatformPaginatedResponse,
  PlatformOrganizationListItem,
} from "@/types/platform";

export default function PlatformAuditPage() {
  const [data, setData] = useState<PlatformPaginatedResponse<PlatformAuditItem> | null>(null);
  const [organizations, setOrganizations] = useState<PlatformOrganizationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [actorEmailSearch, setActorEmailSearch] = useState("");
  const [debouncedActor, setDebouncedActor] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [targetAccountSearch, setTargetAccountSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Event Detail Modal
  const [selectedEvent, setSelectedEvent] = useState<PlatformAuditItem | null>(null);

  // Debounce Actor Search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedActor(actorEmailSearch.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [actorEmailSearch]);

  // Load Orgs for filter
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

  const fetchAudit = useCallback(
    async (background = false) => {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const res = await getPlatformAuditApi({
          event_type: eventTypeFilter || undefined,
          actor_email: debouncedActor || undefined,
          organization_id: orgFilter || undefined,
          target_account: targetAccountSearch || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          page: currentPage,
        });

        // Client-side date and target account filter if backend doesn't filter queryset
        let results = res.results;
        if (startDate || endDate || targetAccountSearch) {
          results = results.filter((item) => {
            if (startDate || endDate) {
              const itemDate = new Date(item.timestamp).toISOString().split("T")[0];
              if (startDate && itemDate < startDate) return false;
              if (endDate && itemDate > endDate) return false;
            }
            if (targetAccountSearch) {
              const search = targetAccountSearch.toLowerCase();
              const targetEmail =
                item.details?.target_user_email ||
                item.details?.user_email ||
                item.details?.email ||
                "";
              if (!targetEmail.toLowerCase().includes(search)) return false;
            }
            return true;
          });
        }

        setData({ ...res, results });
      } catch (err: any) {
        console.error("Failed to fetch audit log:", err);
        if (err instanceof ApiError) {
          setError(err.message || "Failed to load audit records.");
        } else {
          setError("Network error communicating with platform audit service.");
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [eventTypeFilter, debouncedActor, orgFilter, targetAccountSearch, startDate, endDate, currentPage]
  );

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const clearFilters = () => {
    setEventTypeFilter("");
    setActorEmailSearch("");
    setOrgFilter("");
    setTargetAccountSearch("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(
    eventTypeFilter || actorEmailSearch || orgFilter || targetAccountSearch || startDate || endDate
  );

  /**
   * Escape and sanitize cell values against CSV Formula Injection (CWE-1236)
   * Prepend single quote (') if value begins with =, +, -, @, \t, or \r
   */
  const sanitizeCsvValue = (val: any): string => {
    if (val === null || val === undefined) return '""';
    let str = String(val).replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    return `"${str}"`;
  };

  /**
   * Export currently filtered audit records to CSV
   */
  const handleExportCsv = async () => {
    if (!data || data.results.length === 0) return;
    setIsExporting(true);

    try {
      // Fetch up to 100 records for the active filter to ensure comprehensive export
      const fullRes = await getPlatformAuditApi({
        event_type: eventTypeFilter || undefined,
        actor_email: debouncedActor || undefined,
        organization_id: orgFilter || undefined,
        page_size: 100,
      });

      let exportItems = fullRes.results;
      if (startDate || endDate || targetAccountSearch) {
        exportItems = exportItems.filter((item) => {
          if (startDate || endDate) {
            const itemDate = new Date(item.timestamp).toISOString().split("T")[0];
            if (startDate && itemDate < startDate) return false;
            if (endDate && itemDate > endDate) return false;
          }
          if (targetAccountSearch) {
            const search = targetAccountSearch.toLowerCase();
            const targetEmail =
              item.details?.target_user_email ||
              item.details?.user_email ||
              item.details?.email ||
              "";
            if (!targetEmail.toLowerCase().includes(search)) return false;
          }
          return true;
        });
      }

      const headers = [
        "Event ID",
        "Timestamp",
        "Event Type",
        "Actor Email",
        "Organization ID",
        "Organization Name",
        "Target Account",
        "Reason",
        "IP Address",
        "Details Summary",
      ];

      const csvRows = [headers.map(sanitizeCsvValue).join(",")];

      exportItems.forEach((item) => {
        const targetEmail =
          item.details?.target_user_email ||
          item.details?.user_email ||
          item.details?.deleted_domain ||
          "";
        const reason = item.details?.reason || "";
        const detailsSummary = JSON.stringify(item.details || {}).replace(/"/g, '""');

        const row = [
          sanitizeCsvValue(item.id),
          sanitizeCsvValue(new Date(item.timestamp).toISOString()),
          sanitizeCsvValue(item.event_type),
          sanitizeCsvValue(item.actor_email),
          sanitizeCsvValue(item.organization_id || ""),
          sanitizeCsvValue(item.organization_name || ""),
          sanitizeCsvValue(targetEmail),
          sanitizeCsvValue(reason),
          sanitizeCsvValue(item.ip_address || ""),
          sanitizeCsvValue(detailsSummary),
        ];
        csvRows.push(row.join(","));
      });

      const blob = new Blob([csvRows.join("\r\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `pharmapro_platform_audit_${new Date().toISOString().split("T")[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export audit CSV:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = data ? Math.ceil(data.count / 20) : 1;

  return (
    <PlatformLayout
      title="Security &amp; Audit Trail"
      subtitle="Immutable platform audit trail of administrative actions, tenant suspensions, and domain attestations."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchAudit(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExportCsv}
            disabled={isExporting || !data || data.results.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm shadow-indigo-600/30 transition-colors disabled:opacity-50"
            title="Export filtered records to sanitized CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? "Exporting..." : "Export CSV"}</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Error Notification */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-rose-900">Audit Trail Error</h4>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => fetchAudit()}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* ========================================== */}
        {/* SEARCH & FILTERS BAR */}
        {/* ========================================== */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Actor Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={actorEmailSearch}
                onChange={(e) => setActorEmailSearch(e.target.value)}
                placeholder="Filter by Actor email..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>

            {/* Target Account Search */}
            <div>
              <input
                type="text"
                value={targetAccountSearch}
                onChange={(e) => {
                  setTargetAccountSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Filter by Target account..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>

            {/* Event Type Dropdown */}
            <select
              value={eventTypeFilter}
              onChange={(e) => {
                setEventTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Event Types</option>
              <option value="PLATFORM_ORG_STATUS_CHANGED">Organization Status Changed</option>
              <option value="PLATFORM_USER_STATUS_CHANGED">User Status Changed</option>
              <option value="PLATFORM_USER_TEMP_PASSWORD_GENERATED">Temporary Password Generated</option>
              <option value="PLATFORM_USER_SESSIONS_REVOKED">Sessions Revoked</option>
              <option value="PLATFORM_DOMAIN_CREATED">Domain Created</option>
              <option value="PLATFORM_DOMAIN_VERIFIED">Domain Verified</option>
              <option value="PLATFORM_DOMAIN_STATUS_CHANGED">Domain Status Changed</option>
              <option value="PLATFORM_DOMAIN_DELETED">Domain Deleted</option>
              <option value="AUTH_LOGIN_SUCCESS">Login Success</option>
              <option value="AUTH_LOGIN_FAILED">Login Failed</option>
              <option value="AUTH_CROSS_TENANT_REJECTED">Cross-Tenant Rejected</option>
            </select>

            {/* Organization Dropdown */}
            <select
              value={orgFilter}
              onChange={(e) => {
                setOrgFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Organizations</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range & Clear */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Event Date:</span>
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

        {/* Summary */}
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
        {/* AUDIT TABLE */}
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
                    <th className="px-5 py-3.5">Event Type</th>
                    <th className="px-4 py-3.5">Actor</th>
                    <th className="px-4 py-3.5">Tenant / Target Account</th>
                    <th className="px-4 py-3.5">Administrative Reason</th>
                    <th className="px-4 py-3.5">Timestamp</th>
                    <th className="px-5 py-3.5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {data.results.map((item) => {
                    const targetEmail =
                      item.details?.target_user_email ||
                      item.details?.user_email ||
                      item.details?.deleted_domain ||
                      "";
                    const reason = item.details?.reason || "";

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Event Type */}
                        <td className="px-5 py-3.5 font-mono text-[11px] font-semibold text-slate-800 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                            {item.event_type}
                          </span>
                        </td>

                        {/* Actor */}
                        <td className="px-4 py-3.5 font-medium text-slate-900">
                          {item.actor_email}
                        </td>

                        {/* Tenant / Target */}
                        <td className="px-4 py-3.5">
                          {item.organization_name && (
                            <span className="font-semibold text-slate-800 block">
                              {item.organization_name}
                            </span>
                          )}
                          {targetEmail ? (
                            <span className="font-mono text-[11px] text-slate-500 block truncate max-w-[200px]">
                              target: {targetEmail}
                            </span>
                          ) : !item.organization_name ? (
                            <span className="text-slate-400 italic">Platform-Level</span>
                          ) : null}
                        </td>

                        {/* Reason */}
                        <td className="px-4 py-3.5 text-slate-600 max-w-[220px] truncate" title={reason}>
                          {reason || <span className="text-slate-400 italic">—</span>}
                        </td>

                        {/* Timestamp */}
                        <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>

                        {/* Details Modal Trigger */}
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => setSelectedEvent(item)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded text-xs font-medium transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <ShieldAlert className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <h4 className="text-sm font-bold text-slate-800">No audit events found</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No security or administrative events match your filter settings.
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
      {/* AUDIT EVENT DETAILS MODAL */}
      {/* ========================================== */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Audit Event Payload Inspection
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 font-medium block">Event ID</span>
                  <span className="font-mono text-slate-800 font-semibold">{selectedEvent.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Timestamp</span>
                  <span className="font-mono text-slate-800">
                    {new Date(selectedEvent.timestamp).toISOString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Actor Email</span>
                  <span className="text-slate-900 font-semibold">{selectedEvent.actor_email}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">IP Address</span>
                  <span className="font-mono text-slate-800">{selectedEvent.ip_address || "—"}</span>
                </div>
              </div>

              <div>
                <span className="font-bold text-slate-900 block mb-1">
                  Event Details Payload (Immutable)
                </span>
                <pre className="p-4 bg-slate-900 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto leading-relaxed">
                  {JSON.stringify(selectedEvent.details, null, 2)}
                </pre>
              </div>

              {selectedEvent.user_agent && (
                <div>
                  <span className="text-slate-400 font-medium block mb-0.5">User-Agent</span>
                  <span className="text-slate-600 break-all">{selectedEvent.user_agent}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </PlatformLayout>
  );
}

