"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Store,
  Users,
  UserPlus,
  Mail,
  Activity,
  Plus,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatusBadge } from "@/components/auth/StatusBadge";
import { Button } from "@/components/ui/Button";
import { getOrganizationOverviewApi } from "@/lib/api";
import { OrganizationOverview } from "@/types/dashboard";

function DashboardOverviewContent() {
  const router = useRouter();
  const { user, stores, activeStore, setActiveStoreId } = useDashboard();
  const [overview, setOverview] = useState<OrganizationOverview | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";
  const isEmployee = role === "employee" || (!isOwner && !isManager);

  const fetchOverview = async () => {
    if (!isOwner) return;
    setIsLoadingOverview(true);
    setLoadError(null);
    try {
      const data = await getOrganizationOverviewApi();
      setOverview(data);
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load organization overview metrics.");
    } finally {
      setIsLoadingOverview(false);
    }
  };

  useEffect(() => {
    if (isOwner) {
      fetchOverview();
    }
  }, [isOwner]);

  return (
    <DashboardLayout
      title={
        isOwner
          ? "Organization Overview"
          : isManager
          ? "Store Manager Overview"
          : "Pharmacy Staff Workspace"
      }
      subtitle={
        isOwner
          ? `${user?.organizations?.[0]?.name || "Pharmacy Organization"} • Executive Control Center`
          : isManager
          ? "Management access across authorized pharmacy branches"
          : "Operational tools for your assigned pharmacy store"
      }
      action={
        isOwner ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchOverview}
              isLoading={isLoadingOverview}
              className="text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Refresh
            </Button>
            <Link href="/dashboard/stores/create">
              <Button variant="primary" size="sm" className="text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Create Store
              </Button>
            </Link>
          </div>
        ) : null
      }
    >
      {/* OWNER DASHBOARD EXPERIENCE */}
      {isOwner && (
        <div className="space-y-6">
          {loadError && (
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-center justify-between">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={fetchOverview}
                className="font-semibold underline hover:text-rose-950"
              >
                Retry
              </button>
            </div>
          )}

          {/* Real Metrics Cards from PostgreSQL */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Total Stores
                </span>
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
                  <Store className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {overview ? overview.metrics.total_stores : stores.length}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <span className="font-semibold text-emerald-700">
                  {overview ? overview.metrics.active_stores : stores.filter((s) => s.status === "active").length} active
                </span>
                <span>•</span>
                <span>
                  {overview ? overview.metrics.setup_stores : stores.filter((s) => s.status === "setup").length} under setup
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Active Stores
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {overview ? overview.metrics.active_stores : stores.filter((s) => s.status === "active").length}
              </div>
              <p className="text-[11px] text-slate-500">
                Operational retail &amp; hospital branches
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Team Members
                </span>
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {overview ? overview.metrics.active_members : 1}
              </div>
              <p className="text-[11px] text-slate-500">
                Active staff across all stores
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Total Staff
                </span>
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {overview ? overview.metrics.total_members : 1}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <Link
                  href="/dashboard/team"
                  className="font-medium text-[#0F766E] hover:underline"
                >
                  Manage team &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* New Organization Empty State */}
          {overview && overview.metrics.total_stores === 0 && (
            <div className="bg-white rounded-2xl border-2 border-dashed border-teal-200 p-8 text-center space-y-4 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 text-[#0F766E] flex items-center justify-center mx-auto">
                <Store className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  Welcome to PharmaPro!
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your business organization is ready. Create your first pharmacy branch to
                  start managing store operations, inventory, and adding staff.
                </p>
              </div>
              <div className="pt-2 flex flex-wrap justify-center gap-3">
                <Link href="/dashboard/stores/create">
                  <Button variant="primary" size="md">
                    <Plus className="w-4 h-4 mr-1.5" />
                    Create Your First Store
                  </Button>
                </Link>
                <Link href="/dashboard/team">
                  <Button variant="outline" size="md">
                    <UserPlus className="w-4 h-4 mr-1.5" />
                    Add Employee
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Store Branches Summary */}
          {stores.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Store Branches Summary
                  </h2>
                  <p className="text-xs text-slate-500">
                    Registered branches and operational statuses
                  </p>
                </div>
                <Link
                  href="/dashboard/stores"
                  className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1"
                >
                  <span>View All Branches</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-slate-100">
                {stores.slice(0, 5).map((s) => (
                  <div
                    key={s.id}
                    className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0 mt-0.5">
                        <Store className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/stores/${s.id}`}
                            className="font-bold text-sm text-slate-900 hover:text-[#0F766E] transition-colors"
                          >
                            {s.name}
                          </Link>
                          <StatusBadge
                            status={s.status === "active" ? "active" : "pending"}
                            label={s.status === "active" ? "Active" : "Under Setup"}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                          <span className="font-mono text-slate-600 font-medium">
                            Code: {s.code}
                          </span>
                          {s.city && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {s.city}
                            </span>
                          )}
                          <span>
                            Manager:{" "}
                            <strong className="text-slate-700">
                              {s.manager_name || "Unassigned"}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Link href={`/dashboard/stores/${s.id}`}>
                        <Button variant="outline" size="sm" className="text-xs">
                          Manage Branch
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Audit & System Activity Feed */}
          {overview && overview.recent_activity.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Recent Administrative Activity
                  </h2>
                  <p className="text-xs text-slate-500">
                    Audited security, branch, and team events recorded in PostgreSQL
                  </p>
                </div>
                <Link
                  href="/dashboard/audit"
                  className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1"
                >
                  <span>Complete Audit Trail</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-slate-100">
                {overview.recent_activity.map((event) => (
                  <div
                    key={event.id}
                    className="px-6 py-3.5 flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center flex-shrink-0">
                        <Activity className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800">
                          {event.event_type.replace(/_/g, " ")}
                        </span>
                        <span className="text-slate-400 ml-2">by</span>{" "}
                        <span className="text-slate-600 font-mono">
                          {event.user_email}
                        </span>
                      </div>
                    </div>
                    <span className="text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MANAGER DASHBOARD EXPERIENCE */}
      {isManager && (
        <div className="space-y-6">
          <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl text-xs space-y-1">
            <span className="font-bold text-[#0F766E] block">
              Store Manager Authorization
            </span>
            <p className="text-teal-900">
              You are assigned to manage {stores.length} store branch(es). You can
              manage branch staff, assign team members, and view operational records.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stores.map((s) => (
              <div
                key={s.id}
                className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
                      <Store className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">{s.name}</h3>
                      <p className="text-xs font-mono text-slate-500">{s.code}</p>
                    </div>
                  </div>
                  <StatusBadge status={s.status === "active" ? "active" : "pending"} />
                </div>

                <div className="text-xs text-slate-600 space-y-1 pt-1 border-t border-slate-100">
                  {s.address && (
                    <p className="flex items-center gap-1.5 text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {s.address}
                    </p>
                  )}
                  <p>
                    Your role: <strong className="text-teal-700">Store Manager</strong>
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Link href={`/dashboard/stores/${s.id}`}>
                    <Button variant="primary" size="sm" className="text-xs">
                      Open Branch Dashboard
                    </Button>
                  </Link>
                  <Link href="/dashboard/team">
                    <Button variant="outline" size="sm" className="text-xs">
                      Manage Branch Team
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EMPLOYEE DASHBOARD EXPERIENCE */}
      {isEmployee && (
        <div className="space-y-6">
          {activeStore ? (
            <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {activeStore.name}
                    </h2>
                    <p className="text-xs font-mono text-slate-500">
                      Store Branch: {activeStore.code}
                    </p>
                  </div>
                </div>
                <StatusBadge status="active" label="Operational" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block text-[11px]">Your Role</span>
                  <span className="font-bold text-slate-800 capitalize">
                    {activeStore.role || "Staff Member"}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block text-[11px]">
                    Assigned Manager
                  </span>
                  <span className="font-semibold text-slate-800">
                    {activeStore.manager_name || "Branch Administrator"}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block text-[11px]">Organization</span>
                  <span className="font-semibold text-slate-800">
                    {activeStore.organization_name || user?.organizations?.[0]?.name}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-teal-50/60 rounded-xl border border-teal-100 text-xs space-y-1">
                <span className="font-semibold text-[#0F766E]">
                  Staff POS &amp; Prescriptions Module
                </span>
                <p className="text-slate-600 text-[11px]">
                  Prescription dispensing and counter billing interfaces will activate
                  in the operational release.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-2xl border border-rose-200 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>No Active Store Assignment</span>
              </div>
              <p className="text-xs text-slate-600">
                You do not have an active store assignment at this time. Please contact
                your store manager or organization owner to assign your account to an
                active branch.
              </p>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

export default function DashboardPage() {
  return (
    <DashboardProvider>
      <DashboardOverviewContent />
    </DashboardProvider>
  );
}
