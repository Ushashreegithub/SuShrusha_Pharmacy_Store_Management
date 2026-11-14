"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ShieldCheck, CheckCircle2, Ban, KeyRound, RefreshCw } from "lucide-react";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import {
  CredentialsRevealModal,
  RevealedCredentials,
} from "@/components/partner/CredentialsRevealModal";
import {
  getPartnerPharmaciesApi,
  getPartnerManagersApi,
  updatePartnerPharmacyStatusApi,
  updatePartnerManagerStatusApi,
  resetPartnerManagerPasswordApi,
  ApiError,
} from "@/lib/api";
import { PartnerPharmacyItem, PartnerManagerItem } from "@/types/partner";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function PartnerAccountManagementPage() {
  const [pharmacies, setPharmacies] = useState<PartnerPharmacyItem[]>([]);
  const [managers, setManagers] = useState<PartnerManagerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedCredentials | null>(null);

  const [modalTarget, setModalTarget] = useState<
    | { type: "pharmacy"; item: PartnerPharmacyItem; nextActive: boolean }
    | { type: "manager"; item: PartnerManagerItem; nextActive: boolean }
    | { type: "reset"; item: PartnerManagerItem }
    | null
  >(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [phRes, mgrRes] = await Promise.all([
        getPartnerPharmaciesApi({ page_size: 100 }),
        getPartnerManagersApi({ page_size: 100 }),
      ]);
      setPharmacies(phRes.results);
      setManagers(mgrRes.results);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to load account controls.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTarget || reason.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (modalTarget.type === "pharmacy") {
        const res = await updatePartnerPharmacyStatusApi(modalTarget.item.id, {
          is_active: modalTarget.nextActive,
          reason: reason.trim(),
        });
        setNotice(`${res.message} (Revoked sessions: ${res.revoked_sessions_count})`);
      } else if (modalTarget.type === "manager") {
        const res = await updatePartnerManagerStatusApi(modalTarget.item.id, {
          is_active: modalTarget.nextActive,
          reason: reason.trim(),
        });
        setNotice(`${res.message} (Revoked sessions: ${res.revoked_sessions_count})`);
      } else if (modalTarget.type === "reset") {
        const res = await resetPartnerManagerPasswordApi(modalTarget.item.id, {
          reason: reason.trim(),
        });
        setRevealed({
          title: "Temporary Password Reset Complete",
          subtitle: "All active sessions have been revoked.",
          fullName: modalTarget.item.full_name,
          email: res.email,
          temporaryPassword: res.temporary_password,
        });
      }
      setModalTarget(null);
      setReason("");
      await loadAll();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PartnerLayout
      title="Account Management"
      subtitle="Activate, suspend, or reactivate customer organizations and manager credentials safely without deleting historical data."
      actions={
        <Button type="button" variant="secondary" size="sm" onClick={loadAll} className="text-xs flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      }
    >
      <CredentialsRevealModal credentials={revealed} onClose={() => setRevealed(null)} />

      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert variant="success">{notice}</Alert>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Pharmacy Account Lifecycle */}
        <section className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#0F766E]" />
              <h2 className="text-sm font-bold text-slate-900">Customer Pharmacy Organizations</h2>
            </div>
            <span className="text-xs text-slate-500">{pharmacies.length} total</span>
          </div>
          <div className="divide-y divide-slate-100">
            {pharmacies.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No customer pharmacies provisioned.
              </div>
            ) : (
              pharmacies.map((org) => (
                <div key={org.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{org.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {org.stores_count} store(s) · {org.is_active ? "Active tenant" : "Suspended (logins blocked)"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setModalTarget({ type: "pharmacy", item: org, nextActive: !org.is_active });
                      setReason("");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border shrink-0 flex items-center gap-1 ${
                      org.is_active
                        ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    {org.is_active ? (
                      <>
                        <Ban className="w-3.5 h-3.5" /> Suspend
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate
                      </>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Customer Manager Access Lifecycle */}
        <section className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Customer Manager Accounts</h2>
            <span className="text-xs text-slate-500">{managers.length} total</span>
          </div>
          <div className="divide-y divide-slate-100">
            {managers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No manager accounts provisioned.
              </div>
            ) : (
              managers.map((m) => (
                <div key={m.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{m.full_name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {m.email} · {m.organizations.map((o) => o.name).join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setModalTarget({ type: "reset", item: m });
                        setReason("");
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 inline-flex items-center gap-1"
                    >
                      <KeyRound className="w-3 h-3" /> Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModalTarget({ type: "manager", item: m, nextActive: !m.is_active });
                        setReason("");
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                        m.is_active
                          ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {m.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Confirmation Modal */}
      {modalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleConfirm} className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {modalTarget.type === "reset"
                ? "Reset Temporary Password"
                : modalTarget.nextActive
                ? "Confirm Reactivation"
                : "Confirm Suspension / Deactivation"}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {modalTarget.type === "pharmacy" &&
                (modalTarget.nextActive
                  ? `Reactivating "${modalTarget.item.name}" restores access for active members.`
                  : `Suspending "${modalTarget.item.name}" immediately revokes all active sessions and prevents logins while retaining pharmacy records.`)}
              {modalTarget.type === "manager" &&
                (modalTarget.nextActive
                  ? `Reactivating ${modalTarget.item.full_name} restores their pharmacy login access.`
                  : `Deactivating ${modalTarget.item.full_name} immediately revokes all active sessions.`)}
              {modalTarget.type === "reset" &&
                `Issue a new one-time temporary password for ${modalTarget.item.full_name}. Existing sessions will be terminated.`}
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
              <Button type="button" variant="secondary" onClick={() => setModalTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={submitting} className="bg-[#0F766E]">
                Confirm Action
              </Button>
            </div>
          </form>
        </div>
      )}
    </PartnerLayout>
  );
}
