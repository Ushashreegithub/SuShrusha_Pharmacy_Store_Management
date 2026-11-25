"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Globe,
  Settings,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Lock,
  Unlock,
  Server,
  X,
} from "lucide-react";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import {
  getPlatformHostInfoApi,
  getPlatformDomainsApi,
  getPlatformRegistrationSettingsApi,
  updatePlatformRegistrationSettingsApi,
  ApiError,
} from "@/lib/api";
import {
  PlatformHostInfo,
  PlatformDomainItem,
  PlatformRegistrationSettings,
} from "@/types/platform";

export default function PlatformControlPlanePage() {
  const [hostInfo, setHostInfo] = useState<PlatformHostInfo | null>(null);
  const [domains, setDomains] = useState<PlatformDomainItem[]>([]);
  const [domainsTotal, setDomainsTotal] = useState(0);
  const [regSettings, setRegSettings] = useState<PlatformRegistrationSettings | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Quick Registration Toggle Modal
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [regReason, setRegReason] = useState("");
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regModalError, setRegModalError] = useState<string | null>(null);

  const fetchControlPlane = useCallback(async (background = false) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [hInfo, domRes, rSettings] = await Promise.all([
        getPlatformHostInfoApi(),
        getPlatformDomainsApi({ page_size: 10 }),
        getPlatformRegistrationSettingsApi(),
      ]);

      setHostInfo(hInfo);
      setDomains(domRes.results || []);
      setDomainsTotal(domRes.count || 0);
      setRegSettings(rSettings);
    } catch (err: any) {
      console.error("Failed to load platform control plane:", err);
      if (err instanceof ApiError) {
        setError(err.message || "Failed to load platform management sections.");
      } else {
        setError("Unable to connect to PharmaPro backend services.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchControlPlane();
  }, [fetchControlPlane]);

  const handleToggleRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regSettings) return;
    if (!regReason.trim() || regReason.trim().length < 3) {
      setRegModalError("Please provide an audit reason (minimum 3 characters).");
      return;
    }

    setRegSubmitting(true);
    setRegModalError(null);

    const targetEnabled = !regSettings.public_registration_enabled;

    try {
      const updated = await updatePlatformRegistrationSettingsApi({
        public_registration_enabled: targetEnabled,
        reason: regReason.trim(),
      });
      setRegSettings(updated);
      setRegModalOpen(false);
      setRegReason("");
      setSuccessBanner(
        updated.message ||
          `Public pharmacy registration has been ${targetEnabled ? "enabled" : "disabled"}.`
      );
    } catch (err: any) {
      console.error("Failed to update registration setting:", err);
      setRegModalError(err.message || "Failed to update registration policy.");
    } finally {
      setRegSubmitting(false);
    }
  };

  return (
    <PlatformLayout
      title="PharmaPro — Platform Administration"
      subtitle="Manage pharmacy domains connected to your PharmaPro platform and control public pharmacy registration."
      actions={
        <button
          onClick={() => fetchControlPlane(true)}
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

        {/* Error Notification */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-rose-900">Control Plane Error</h4>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => fetchControlPlane()}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
            <div className="h-72 bg-white border border-slate-200 rounded-2xl p-6" />
            <div className="h-72 bg-white border border-slate-200 rounded-2xl p-6" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ================================================== */}
            {/* SECTION 1: DOMAIN MANAGEMENT */}
            {/* ================================================== */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">1. Domain Management</h2>
                    <p className="text-xs text-slate-500">
                      Manage pharmacy domains connected to your PharmaPro platform ({domainsTotal} registered)
                    </p>
                  </div>
                </div>

                <Link
                  href="/platform/domains"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm shadow-indigo-600/20 transition-colors"
                >
                  <span>Manage All Domains</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="p-6 space-y-5 flex-1">
                {/* Main Platform Host Highlight */}
                <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold">
                          {hostInfo?.primary_platform_domain || "pharmapro.diracai.com"}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold uppercase">
                          Main Platform Domain
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Central PharmaPro application and login gateway.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Active</span>
                  </span>
                </div>

                {/* Connected Client Domains List Preview */}
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                    Connected Client Pharmacy Domains
                  </h3>

                  {domains.length > 0 ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                      {domains.map((dom) => (
                        <div
                          key={dom.id}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900 text-xs">
                                {dom.domain}
                              </span>
                              {dom.is_primary && (
                                <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded border border-indigo-200">
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                              <div>
                                Client / Pharmacy: <strong className="text-slate-700">{dom.organization_name}</strong>
                                {dom.owner_email && <span> • Owner: {dom.owner_email}</span>}
                              </div>
                              <div className="font-mono text-[10px] text-slate-400">
                                Org ID: {dom.organization_id}
                                {dom.organization_created_at && ` • Registered: ${new Date(dom.organization_created_at).toLocaleDateString()}`}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-[11px]">
                            {dom.is_verified ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded border border-emerald-200">
                                Manually Verified
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-semibold rounded border border-amber-200">
                                Unverified (Pending)
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded font-semibold uppercase ${
                                dom.status === "active"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : dom.status === "suspended"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-slate-100 text-slate-600 border border-slate-200"
                              }`}
                            >
                              {dom.status === "suspended" ? "Disabled" : dom.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500 space-y-2">
                      <p>No pharmacy domain mappings registered in the database yet.</p>
                      {hostInfo?.configured_client_mappings &&
                        hostInfo.configured_client_mappings.filter((m) => !m.in_database).length > 0 && (
                          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-left">
                            <span className="font-semibold block">Environment Configuration Notice:</span>
                            {hostInfo.configured_client_mappings
                              .filter((m) => !m.in_database)
                              .map((m) => (
                                <div key={m.domain} className="mt-1">
                                  <span className="font-mono font-bold">{m.domain}</span> is configured in server host settings
                                  {m.organization_id ? (
                                    <span> → matched organization <strong>{m.organization_name}</strong> ({m.owner_email})</span>
                                  ) : (
                                    <span> → configured slug &ldquo;{m.configured_target_slug}&rdquo; has no matching DB organization or DB mapping row yet.</span>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ================================================== */}
            {/* SECTION 2: REGISTRATION SETTINGS */}
            {/* ================================================== */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
              <div>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">2. Registration Settings</h2>
                      <p className="text-xs text-slate-500">Public onboarding control</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Status Indicator Box */}
                  <div
                    className={`p-4 rounded-xl border ${
                      regSettings?.public_registration_enabled
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-rose-50 border-rose-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Public Pharmacy Signup
                      </span>
                      {regSettings?.public_registration_enabled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold">
                          <Unlock className="w-3 h-3" />
                          <span>ENABLED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-bold">
                          <Lock className="w-3 h-3" />
                          <span>DISABLED</span>
                        </span>
                      )}
                    </div>

                    <p
                      className={`text-xs mt-2.5 leading-relaxed ${
                        regSettings?.public_registration_enabled ? "text-emerald-900" : "text-rose-900"
                      }`}
                    >
                      {regSettings?.public_registration_enabled
                        ? "New pharmacy owners can publicly register organizations through /register. Existing users continue logging in normally."
                        : "Public pharmacy owner registrations are rejected server-side with HTTP 403. Existing pharmacy accounts and login remain unaffected."}
                    </p>
                  </div>

                  {/* Last Updated Audit Info */}
                  <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Last Changed By</span>
                      <span className="font-semibold text-slate-800">
                        {regSettings?.updated_by_email || "Default Policy"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Timestamp</span>
                      <span className="font-mono text-[11px] text-slate-700">
                        {regSettings?.updated_at
                          ? new Date(regSettings.updated_at).toLocaleString()
                          : "Initial Configuration"}
                      </span>
                    </div>
                    {regSettings?.last_updated_reason && (
                      <div className="pt-1 border-t border-slate-200/70">
                        <span className="text-slate-500 block">Audit Reason:</span>
                        <span className="text-slate-800 font-medium italic">
                          &ldquo;{regSettings.last_updated_reason}&rdquo;
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 pt-0 space-y-2.5">
                <button
                  onClick={() => {
                    setRegReason("");
                    setRegModalError(null);
                    setRegModalOpen(true);
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white shadow-sm transition-colors ${
                    regSettings?.public_registration_enabled
                      ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
                      : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                  }`}
                >
                  {regSettings?.public_registration_enabled
                    ? "Disable Public Registration"
                    : "Enable Public Registration"}
                </button>

                <Link
                  href="/platform/registration"
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  <span>View Registration Policy &amp; Audit History</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* REGISTRATION TOGGLE CONFIRMATION MODAL */}
      {/* ========================================== */}
      {regModalOpen && regSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      regSettings.public_registration_enabled
                        ? "bg-rose-50 text-rose-600 border border-rose-200"
                        : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                    }`}
                  >
                    {regSettings.public_registration_enabled ? (
                      <Lock className="w-5 h-5" />
                    ) : (
                      <Unlock className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {regSettings.public_registration_enabled
                        ? "Disable Public Registration"
                        : "Enable Public Registration"}
                    </h3>
                    <p className="text-xs text-slate-500">Global PharmaPro Policy Change</p>
                  </div>
                </div>
                <button
                  onClick={() => setRegModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div
                className={`mt-4 p-3.5 rounded-xl text-xs leading-relaxed ${
                  regSettings.public_registration_enabled
                    ? "bg-rose-50 border border-rose-200 text-rose-900"
                    : "bg-emerald-50 border border-emerald-200 text-emerald-900"
                }`}
              >
                {regSettings.public_registration_enabled ? (
                  <>
                    <strong>Consequence:</strong> All new public Pharmacy Owner signup attempts via{" "}
                    <code>/register</code> and <code>/api/auth/register/owner/</code> will be blocked by the server. Existing pharmacy accounts and login remain completely unaffected.
                  </>
                ) : (
                  <>
                    New pharmacy businesses will be permitted to self-register organizations and owner accounts.
                  </>
                )}
              </div>

              {regModalError && (
                <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-800 font-medium">
                  {regModalError}
                </div>
              )}

              <form onSubmit={handleToggleRegistration} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Audit Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={regReason}
                    onChange={(e) => setRegReason(e.target.value)}
                    placeholder="Enter administrative justification (recorded with your identity & timestamp)..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setRegModalOpen(false)}
                    disabled={regSubmitting}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={regSubmitting || regReason.trim().length < 3}
                    className={`px-4 py-2 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm disabled:opacity-50 ${
                      regSettings.public_registration_enabled
                        ? "bg-rose-600 hover:bg-rose-500"
                        : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                  >
                    {regSubmitting
                      ? "Saving..."
                      : regSettings.public_registration_enabled
                      ? "Confirm Disable"
                      : "Confirm Enable"}
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
