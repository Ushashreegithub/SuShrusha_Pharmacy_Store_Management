"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Settings,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  RefreshCw,
  ShieldAlert,
  Clock,
  UserCheck,
  History,
  X,
  ArrowRight,
  Info,
} from "lucide-react";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import {
  getPlatformRegistrationSettingsApi,
  updatePlatformRegistrationSettingsApi,
  ApiError,
} from "@/lib/api";
import {
  PlatformRegistrationSettings,
  PlatformRegistrationHistoryItem,
} from "@/types/platform";

export default function PlatformRegistrationSettingsPage() {
  const [settingsData, setSettingsData] = useState<PlatformRegistrationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Toggle Confirmation Modal
  const [toggleModalOpen, setToggleModalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchSettings = useCallback(async (background = false) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await getPlatformRegistrationSettingsApi();
      setSettingsData(res);
    } catch (err: any) {
      console.error("Failed to fetch registration settings:", err);
      if (err instanceof ApiError) {
        setError(err.message || "Failed to load platform registration policy.");
      } else {
        setError("Network error communicating with platform settings backend.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleConfirmToggle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsData) return;

    if (!reason.trim() || reason.trim().length < 3) {
      setModalError("Please provide an audit reason with at least 3 characters.");
      return;
    }

    setSubmitting(true);
    setModalError(null);

    const targetEnabled = !settingsData.public_registration_enabled;

    try {
      const updated = await updatePlatformRegistrationSettingsApi({
        public_registration_enabled: targetEnabled,
        reason: reason.trim(),
      });

      setSettingsData(updated);
      setToggleModalOpen(false);
      setReason("");
      setSuccessBanner(
        updated.message ||
          `Public pharmacy registration has been ${targetEnabled ? "enabled" : "disabled"}.`
      );
    } catch (err: any) {
      console.error("Failed to update registration policy:", err);
      if (err instanceof ApiError) {
        setModalError(err.message || "Failed to update setting.");
      } else {
        setModalError("An unexpected network error occurred.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PlatformLayout
      title="Public Pharmacy Registration Settings"
      subtitle="Control platform-wide self-service pharmacy organization onboarding with full audit tracking."
      actions={
        <button
          onClick={() => fetchSettings(true)}
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

        {/* Global Error */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-rose-900">Registration Settings Error</h4>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => fetchSettings()}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !settingsData ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-56 bg-white border border-slate-200 rounded-2xl p-6" />
            <div className="h-64 bg-white border border-slate-200 rounded-2xl p-6" />
          </div>
        ) : settingsData ? (
          <>
            {/* ========================================== */}
            {/* 1. MASTER POLICY CONTROL CARD */}
            {/* ========================================== */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
                        settingsData.public_registration_enabled
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                          : "bg-rose-50 text-rose-600 border-rose-200"
                      }`}
                    >
                      {settingsData.public_registration_enabled ? (
                        <Unlock className="w-6 h-6" />
                      ) : (
                        <Lock className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-bold text-slate-900">
                          Public Pharmacy Owner Registration
                        </h2>
                        {settingsData.public_registration_enabled ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ENABLED
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            DISABLED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Controls server-side enforcement at{" "}
                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">
                          POST /api/auth/register/owner/
                        </code>{" "}
                        and public onboarding page{" "}
                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">
                          /register
                        </code>
                        .
                      </p>
                    </div>
                  </div>

                  {/* Policy Impact Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                      <span className="font-bold text-slate-800 block mb-1">
                        New Owner Signups
                      </span>
                      <p className="text-slate-600 leading-relaxed">
                        {settingsData.public_registration_enabled
                          ? "Open — Prospective pharmacy businesses can create new owner accounts and organizations."
                          : "Blocked — New public signup submissions are rejected with HTTP 403 Forbidden."}
                      </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                      <span className="font-bold text-slate-800 block mb-1">
                        Existing Accounts &amp; Logins
                      </span>
                      <p className="text-slate-600 leading-relaxed">
                        Always Permitted — All existing Pharmacy Owners, Store Managers, Staff, and Platform Owners continue signing in seamlessly.
                      </p>
                    </div>
                  </div>

                  {/* Current Change Attribution */}
                  <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div className="space-y-1">
                      <span className="text-slate-500 font-medium">Last Modified By:</span>
                      <div className="font-semibold text-slate-900">
                        {settingsData.updated_by_email || "System Default Configuration"}
                      </div>
                      {settingsData.last_updated_reason && (
                        <div className="text-slate-600 italic">
                          Reason: &ldquo;{settingsData.last_updated_reason}&rdquo;
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-slate-500 font-medium block">Timestamp</span>
                      <span className="font-mono text-slate-800">
                        {settingsData.updated_at
                          ? new Date(settingsData.updated_at).toLocaleString()
                          : "Default Initial State"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <div className="shrink-0 flex flex-col gap-2 md:w-56">
                  <button
                    onClick={() => {
                      setReason("");
                      setModalError(null);
                      setToggleModalOpen(true);
                    }}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-bold text-white shadow-md transition-colors flex items-center justify-center gap-2 ${
                      settingsData.public_registration_enabled
                        ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
                        : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                    }`}
                  >
                    {settingsData.public_registration_enabled ? (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Disable Registration</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-4 h-4" />
                        <span>Enable Registration</span>
                      </>
                    )}
                  </button>

                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-lg text-[11px] text-indigo-900 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <span>Changes require an audit reason and take effect immediately.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================== */}
            {/* 2. CHANGE AUDIT HISTORY TABLE */}
            {/* ========================================== */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Registration Setting Audit History
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  {settingsData.history?.length || 0} recorded policy changes
                </span>
              </div>

              {settingsData.history && settingsData.history.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3.5">Platform Owner</th>
                        <th className="px-4 py-3.5">Transition</th>
                        <th className="px-4 py-3.5">Administrative Reason</th>
                        <th className="px-6 py-3.5 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {settingsData.history.map((item: PlatformRegistrationHistoryItem) => (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-6 py-3.5 font-semibold text-slate-900">
                            {item.actor_email}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.before_enabled
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}
                              >
                                {item.before_enabled ? "ENABLED" : "DISABLED"}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.after_enabled
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}
                              >
                                {item.after_enabled ? "ENABLED" : "DISABLED"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-700">
                            {item.reason || <span className="text-slate-400 italic">—</span>}
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(item.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500">
                  <p className="text-xs font-semibold">No setting modifications recorded yet.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Every enable or disable action will be permanently logged here with your admin identity and reason.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* ========================================== */}
      {/* TOGGLE CONFIRMATION MODAL */}
      {/* ========================================== */}
      {toggleModalOpen && settingsData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      settingsData.public_registration_enabled
                        ? "bg-rose-50 text-rose-600 border border-rose-200"
                        : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                    }`}
                  >
                    {settingsData.public_registration_enabled ? (
                      <Lock className="w-5 h-5" />
                    ) : (
                      <Unlock className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {settingsData.public_registration_enabled
                        ? "Disable Public Registration"
                        : "Enable Public Registration"}
                    </h3>
                    <p className="text-xs text-slate-500">Server-Enforced Policy Update</p>
                  </div>
                </div>
                <button
                  onClick={() => setToggleModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div
                className={`mt-4 p-3.5 rounded-xl text-xs leading-relaxed ${
                  settingsData.public_registration_enabled
                    ? "bg-rose-50 border border-rose-200 text-rose-900"
                    : "bg-emerald-50 border border-emerald-200 text-emerald-900"
                }`}
              >
                {settingsData.public_registration_enabled ? (
                  <>
                    <strong>Notice:</strong> Disabling public registration will cause{" "}
                    <code>POST /api/auth/register/owner/</code> to return HTTP 403 Forbidden for all new public signup attempts. Existing pharmacy owners, managers, and staff logins will remain unaffected.
                  </>
                ) : (
                  <>
                    Enabling public registration allows new pharmacy organizations to register accounts publicly via <code>/register</code>.
                  </>
                )}
              </div>

              {modalError && (
                <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-800 font-medium">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleConfirmToggle} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Administrative Audit Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Enter reason (e.g. Onboarding window closed for Q4 audit, invite-only mode)..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Minimum 3 characters. Permanently records your identity, timestamp, and reason.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setToggleModalOpen(false)}
                    disabled={submitting}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || reason.trim().length < 3}
                    className={`px-4 py-2 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm disabled:opacity-50 ${
                      settingsData.public_registration_enabled
                        ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                        : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                    }`}
                  >
                    {submitting
                      ? "Saving..."
                      : settingsData.public_registration_enabled
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
