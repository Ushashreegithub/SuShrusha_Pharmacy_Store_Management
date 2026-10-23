"use client";

import React, { useEffect, useState } from "react";
import {
  History,
  Activity,
  Filter,
  RefreshCw,
  Search,
  Calendar,
  User,
  Shield,
  Clock,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { getAuditLogsApi } from "@/lib/api";
import { AuditEventItem } from "@/types/dashboard";

function AuditContent() {
  const { user } = useDashboard();
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const isOwner = user?.primary_role === "owner" || user?.organizations?.some((o) => o.is_owner);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAuditLogsApi({
        event_type: eventTypeFilter !== "all" ? eventTypeFilter : undefined,
        limit: 100,
      });
      setEvents(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load audit logs.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [eventTypeFilter]);

  const getEventBadgeClass = (type: string) => {
    if (type.includes("CREATED") || type.includes("ACCEPTED")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (type.includes("REVOKED") || type.includes("DEACTIVATED")) {
      return "bg-rose-50 text-rose-700 border-rose-200";
    }
    if (type.includes("RESENT") || type.includes("ASSIGNED")) {
      return "bg-sky-50 text-sky-700 border-sky-200";
    }
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  return (
    <DashboardLayout
      title="Audit Activity Trail"
      subtitle="Immutable security log of administrative actions, store updates, and employee account events."
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          isLoading={isLoading}
          className="text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Refresh Log
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Filter className="w-4 h-4 text-slate-400" />
            <span>Filter Event Type:</span>
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              <option value="all">All Events</option>
              <option value="EMPLOYEE_ACCOUNT_CREATED">Employee Account Created</option>
              <option value="EMPLOYEE_ACCOUNT_UPDATED">Employee Account Updated</option>
              <option value="STORE_CREATED">Store Created</option>
              <option value="STORE_UPDATED">Store Updated</option>
              <option value="STORE_MANAGER_ASSIGNED">Store Manager Assigned</option>
              <option value="STORE_MEMBERSHIP_ASSIGNED">Store Membership Assigned</option>
              <option value="STORE_MEMBERSHIP_UPDATED">Store Membership Status Changed</option>
              <option value="OWNER_REGISTERED">Owner Registered</option>
              <option value="USER_LOGGED_IN">User Logged In</option>
            </select>
          </div>

          <span className="text-xs text-slate-500 font-mono">
            {events.length} Recorded Events
          </span>
        </div>

        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Audit Table */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
              Querying PostgreSQL audit events...
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No audit events found matching filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-[#E2E8F0] text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Event Type</th>
                    <th className="px-6 py-3">Actor / Email</th>
                    <th className="px-6 py-3">Details &amp; Target</th>
                    <th className="px-6 py-3">IP Address</th>
                    <th className="px-6 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getEventBadgeClass(
                            evt.event_type
                          )}`}
                        >
                          {evt.event_type.replace(/_/g, " ")}
                        </span>
                      </td>

                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-slate-800">
                          {evt.user_name || "System"}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {evt.user_email}
                        </div>
                      </td>

                      <td className="px-6 py-3.5 max-w-xs">
                        <div className="text-[11px] text-slate-700 font-mono bg-slate-50 p-2 rounded-lg border border-slate-200 line-clamp-3">
                          {JSON.stringify(evt.details, null, 1)}
                        </div>
                      </td>

                      <td className="px-6 py-3.5 font-mono text-[11px] text-slate-500">
                        {evt.ip_address || "127.0.0.1"}
                      </td>

                      <td className="px-6 py-3.5 text-slate-500 text-[11px] whitespace-nowrap">
                        {new Date(evt.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function AuditPage() {
  return (
    <DashboardProvider>
      <AuditContent />
    </DashboardProvider>
  );
}

