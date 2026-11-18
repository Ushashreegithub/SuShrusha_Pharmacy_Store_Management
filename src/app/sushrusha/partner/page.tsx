"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  Store,
  UserCog,
  KeyRound,
  PlusCircle,
  ArrowRight,
  CheckCircle2,
  Ban,
  Clock,
  RefreshCw,
} from "lucide-react";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import { getPartnerOverviewApi, ApiError } from "@/lib/api";
import { PartnerOverviewResponse } from "@/types/partner";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function PartnerOverviewPage() {
  const [data, setData] = useState<PartnerOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPartnerOverviewApi();
      setData(res);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to load partner overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return (
    <PartnerLayout
      title="Partner Overview"
      subtitle="Onboard customer pharmacies and provision stores"
      actions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={loadOverview}
            disabled={loading}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
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
        </div>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {/* Governance Scope Notice */}
      <div className="mb-6 bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0F766E]">
            <span>{data?.partner?.name || "Janjeevan Organisation"} Portal</span>
            {data?.partner?.domain && (
              <span className="px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 font-mono text-[11px]">
                {data.partner.domain}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Each customer pharmacy runs in its own isolated tenant organization. Manages onboarding, store setup, manager credentials, and account status only.
          </p>
        </div>
        <Link
          href="/sushrusha/partner/pharmacies"
          className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1 shrink-0"
        >
          <span>View All Customer Pharmacies</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Customer Pharmacies</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">
            {loading ? "—" : data?.metrics.total_pharmacies ?? 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {data?.metrics.active_pharmacies ?? 0} active · {data?.metrics.inactive_pharmacies ?? 0} suspended
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Customer Stores</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">
            {loading ? "—" : data?.metrics.total_stores ?? 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {data?.metrics.active_stores ?? 0} currently active
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Pharmacy Managers</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <UserCog className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">
            {loading ? "—" : data?.metrics.total_managers ?? 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {data?.metrics.active_managers ?? 0} active accounts
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Pending First Login</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">
            {loading ? "—" : data?.metrics.pending_password_changes ?? 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Managers awaiting initial password change
          </p>
        </div>
      </div>

      {/* Recent Pharmacies & Recent Provisioning Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Recently Onboarded Pharmacies</h2>
            <Link
              href="/sushrusha/partner/pharmacies"
              className="text-xs font-semibold text-[#0F766E] hover:underline"
            >
              Manage All
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {!loading && (!data?.recent_pharmacies || data.recent_pharmacies.length === 0) ? (
              <div className="p-8 text-center">
                <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">No customer pharmacies yet</p>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                  Create your first customer pharmacy organization, stores, and manager account.
                </p>
                <Link href="/sushrusha/partner/pharmacies/create">
                  <Button type="button" variant="primary" size="sm" className="bg-[#0F766E] hover:bg-[#0D645D]">
                    Create Customer Pharmacy
                  </Button>
                </Link>
              </div>
            ) : (
              data?.recent_pharmacies.map((org) => (
                <div key={org.id} className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{org.name}</p>
                      {org.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <Ban className="w-3 h-3" /> Suspended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {org.stores_count} store(s) · Manager:{" "}
                      {org.primary_manager ? `${org.primary_manager.full_name} (${org.primary_manager.email})` : "Not assigned"}
                    </p>
                  </div>
                  <Link
                    href={`/sushrusha/partner/pharmacies?selected=${org.id}`}
                    className="text-xs font-semibold text-[#0F766E] hover:underline shrink-0"
                  >
                    Details
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Recent Provisioning Activity</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {!loading && (!data?.recent_activity || data.recent_activity.length === 0) ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No partner provisioning activity recorded yet.
              </div>
            ) : (
              data?.recent_activity.map((ev) => (
                <div key={ev.id} className="px-5 py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-slate-800 text-[11px]">
                      {ev.event_type}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(ev.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {ev.organization_name && (
                    <p className="text-slate-600 font-medium">{ev.organization_name}</p>
                  )}
                  {ev.actor_email && (
                    <p className="text-slate-400 text-[11px]">By {ev.actor_email}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </PartnerLayout>
  );
}
