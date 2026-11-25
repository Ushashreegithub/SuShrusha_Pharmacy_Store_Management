"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UserCog, PlusCircle, Search, KeyRound, RefreshCw, X } from "lucide-react";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import {
  CredentialsRevealModal,
  RevealedCredentials,
} from "@/components/partner/CredentialsRevealModal";
import {
  getPartnerPharmaciesApi,
  getPartnerStoresApi,
  getPartnerManagersApi,
  createPartnerManagerApi,
  assignPartnerManagerStoresApi,
  resetPartnerManagerPasswordApi,
  updatePartnerManagerStatusApi,
  ApiError,
} from "@/lib/api";
import {
  PartnerPharmacyItem,
  PartnerStoreItem,
  PartnerManagerItem,
} from "@/types/partner";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function PartnerManagersContent() {
  const searchParams = useSearchParams();
  const initialOrg = searchParams.get("org") || "";

  const [pharmacies, setPharmacies] = useState<PartnerPharmacyItem[]>([]);
  const [stores, setStores] = useState<PartnerStoreItem[]>([]);
  const [managers, setManagers] = useState<PartnerManagerItem[]>([]);

  const [orgFilter, setOrgFilter] = useState(initialOrg);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedCredentials | null>(null);

  // Create Manager Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createOrgId, setCreateOrgId] = useState(initialOrg);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Assign Stores Modal
  const [assignTarget, setAssignTarget] = useState<PartnerManagerItem | null>(null);
  const [assignOrgId, setAssignOrgId] = useState("");
  const [assignStoreIds, setAssignStoreIds] = useState<string[]>([]);

  // Reset Password Modal
  const [resetTarget, setResetTarget] = useState<PartnerManagerItem | null>(null);
  const [resetReason, setResetReason] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [phRes, stRes, mgrRes] = await Promise.all([
        getPartnerPharmaciesApi({ page_size: 100 }),
        getPartnerStoresApi({ page_size: 200 }),
        getPartnerManagersApi({
          organization_id: orgFilter || undefined,
          search: search.trim() || undefined,
          page_size: 100,
        }),
      ]);
      setPharmacies(phRes.results);
      setStores(stRes.results);
      setManagers(mgrRes.results);
      if (!createOrgId && phRes.results.length > 0) {
        setCreateOrgId(phRes.results[0].id);
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to load manager accounts.");
    } finally {
      setLoading(false);
    }
  }, [orgFilter, search, createOrgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const storesForCreateOrg = stores.filter((s) => s.organization_id === createOrgId);
  const storesForAssignOrg = stores.filter((s) => s.organization_id === assignOrgId);

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createOrgId || fullName.trim().length < 2 || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await createPartnerManagerApi({
        organization_id: createOrgId,
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone_number: phone.trim(),
        password: password.trim() || undefined,
        store_ids: selectedStoreIds,
      });
      setShowCreateModal(false);
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setSelectedStoreIds([]);
      const ph = pharmacies.find((p) => p.id === createOrgId);
      setRevealed({
        title: "Customer Manager Created",
        subtitle: "Temporary credentials are ready. First-login password change is enforced.",
        pharmacyName: ph?.name,
        fullName: res.manager.full_name,
        email: res.manager.email,
        temporaryPassword: res.temporary_password,
      });
      await loadData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to create manager.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAssignStores = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTarget || !assignOrgId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await assignPartnerManagerStoresApi(assignTarget.id, {
        organization_id: assignOrgId,
        store_ids: assignStoreIds,
      });
      setNotice(res.message);
      setAssignTarget(null);
      await loadData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to update store assignments.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || resetReason.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await resetPartnerManagerPasswordApi(resetTarget.id, {
        reason: resetReason.trim(),
      });
      const targetName = resetTarget.full_name;
      setResetTarget(null);
      setResetReason("");
      setRevealed({
        title: "Temporary Password Issued",
        subtitle: "Previous sessions for this manager were revoked.",
        fullName: targetName,
        email: res.email,
        temporaryPassword: res.temporary_password,
      });
      await loadData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to reset manager password.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (mgr: PartnerManagerItem) => {
    setError(null);
    setNotice(null);
    try {
      const res = await updatePartnerManagerStatusApi(mgr.id, {
        is_active: !mgr.is_active,
        reason: mgr.is_active
          ? "Partner admin deactivated manager account"
          : "Partner admin reactivated manager account",
      });
      setNotice(res.message);
      await loadData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to update manager status.");
    }
  };

  return (
    <PartnerLayout
      title="Manager Accounts"
      subtitle="Provision customer pharmacy managers, assign stores, and issue temporary credentials."
      actions={
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={pharmacies.length === 0}
          onClick={() => setShowCreateModal(true)}
          className="text-xs bg-[#0F766E] hover:bg-[#0D645D] flex items-center gap-1.5"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Create Manager</span>
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

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search manager by name or email..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#0F766E]"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <option value="">All Customer Pharmacies</option>
            {pharmacies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" size="sm" onClick={loadData}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Managers Table */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Manager</th>
                <th className="py-3 px-4">Customer Pharmacy</th>
                <th className="py-3 px-4">Assigned Stores</th>
                <th className="py-3 px-4">Security State</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    Loading manager accounts...
                  </td>
                </tr>
              ) : managers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    <UserCog className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                    No customer pharmacy managers found.
                  </td>
                </tr>
              ) : (
                managers.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">{m.full_name}</p>
                      <p className="text-[11px] text-slate-500">{m.email}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      {m.organizations.map((o) => (
                        <div key={o.id} className="font-medium text-slate-800">
                          {o.name}
                          {!o.is_active && (
                            <span className="ml-1.5 text-[10px] text-rose-600">(Org Suspended)</span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="py-3.5 px-4">
                      {m.assigned_stores.length === 0 ? (
                        <span className="text-slate-400 italic">Org-wide access</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {m.assigned_stores.map((s) => (
                            <span
                              key={s.id}
                              className="px-2 py-0.5 rounded-md bg-teal-50 text-[#0F766E] border border-teal-200 text-[11px] font-medium"
                            >
                              {s.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 space-y-1">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          m.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {m.is_active ? "Active" : "Deactivated"}
                      </span>
                      {m.must_change_password && (
                        <p className="text-[10px] font-semibold text-amber-700">
                          Temp Password Pending Change
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          const orgId = m.organizations[0]?.id || "";
                          setAssignTarget(m);
                          setAssignOrgId(orgId);
                          setAssignStoreIds(
                            m.assigned_stores
                              .filter((s) => s.organization_id === orgId && s.is_active)
                              .map((s) => s.id)
                          );
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 font-semibold text-slate-700"
                      >
                        Stores
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetTarget(m);
                          setResetReason("");
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 font-semibold text-amber-800 inline-flex items-center gap-1"
                      >
                        <KeyRound className="w-3 h-3" /> Reset Password
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(m)}
                        className={`px-2.5 py-1.5 rounded-lg font-semibold border ${
                          m.is_active
                            ? "border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"
                            : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                        }`}
                      >
                        {m.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Manager Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={handleCreateManager}
            className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Create Customer Pharmacy Manager</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Customer Pharmacy *
              </label>
              <select
                required
                value={createOrgId}
                onChange={(e) => {
                  setCreateOrgId(e.target.value);
                  setSelectedStoreIds([]);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
              >
                {pharmacies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Full Name *"
                placeholder="Dr. Rajesh Nair"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              <Input
                label="Login Email *"
                type="email"
                placeholder="manager@pharmacy.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Phone Number"
                placeholder="+91 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Input
                label="Temporary Password (Optional)"
                placeholder="Auto-generated if blank"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {storesForCreateOrg.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Assign Store Branches (Same Pharmacy Only)
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                  {storesForCreateOrg.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedStoreIds.includes(s.id)}
                        onChange={(e) => {
                          setSelectedStoreIds((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                          );
                        }}
                      />
                      <span>
                        {s.name} ({s.code})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={submitting} className="bg-[#0F766E]">
                Create Manager Account
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Assign Stores Modal */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={handleSaveAssignStores}
            className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900">
              Assign Stores to {assignTarget.full_name}
            </h3>
            <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
              {storesForAssignOrg.length === 0 ? (
                <p className="text-xs text-slate-500">No stores created for this pharmacy yet.</p>
              ) : (
                storesForAssignOrg.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignStoreIds.includes(s.id)}
                      onChange={(e) => {
                        setAssignStoreIds((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                        );
                      }}
                    />
                    <span>
                      {s.name} ({s.code})
                    </span>
                  </label>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAssignTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={submitting} className="bg-[#0F766E]">
                Save Assignments
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Temporary Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={handleConfirmResetPassword}
            className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900">Issue New Temporary Password</h3>
            <p className="text-xs text-slate-600">
              Resetting credentials for <strong>{resetTarget.full_name}</strong> ({resetTarget.email}) revokes active sessions and enforces a password change on next sign-in.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Audit Reason (required)
              </label>
              <textarea
                rows={3}
                required
                minLength={3}
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="e.g. Customer manager lost initial password"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setResetTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={submitting} className="bg-[#0F766E]">
                Generate Temporary Password
              </Button>
            </div>
          </form>
        </div>
      )}
    </PartnerLayout>
  );
}

export default function PartnerManagersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC]" />}>
      <PartnerManagersContent />
    </Suspense>
  );
}
