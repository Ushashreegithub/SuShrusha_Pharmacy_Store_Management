"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Store, PlusCircle, Search, RefreshCw, X } from "lucide-react";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import {
  getPartnerPharmaciesApi,
  getPartnerStoresApi,
  createPartnerStoreApi,
  updatePartnerStoreStatusApi,
  ApiError,
} from "@/lib/api";
import { PartnerPharmacyItem, PartnerStoreItem } from "@/types/partner";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function PartnerStoresContent() {
  const searchParams = useSearchParams();
  const initialOrg = searchParams.get("org") || "";

  const [pharmacies, setPharmacies] = useState<PartnerPharmacyItem[]>([]);
  const [stores, setStores] = useState<PartnerStoreItem[]>([]);
  const [orgFilter, setOrgFilter] = useState(initialOrg);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create Store Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgId, setNewOrgId] = useState(initialOrg);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newStatus, setNewStatus] = useState<"active" | "setup">("active");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [phRes, stRes] = await Promise.all([
        getPartnerPharmaciesApi({ page_size: 100 }),
        getPartnerStoresApi({
          organization_id: orgFilter || undefined,
          status: statusFilter || undefined,
          search: search.trim() || undefined,
          page_size: 100,
        }),
      ]);
      setPharmacies(phRes.results);
      setStores(stRes.results);
      if (!newOrgId && phRes.results.length > 0) {
        setNewOrgId(phRes.results[0].id);
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to load partner stores.");
    } finally {
      setLoading(false);
    }
  }, [orgFilter, statusFilter, search, newOrgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgId || newName.trim().length < 2) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await createPartnerStoreApi({
        organization_id: newOrgId,
        name: newName.trim(),
        code: newCode.trim() || undefined,
        city: newCity.trim(),
        state: newState.trim(),
        address: newAddress.trim(),
        phone: newPhone.trim(),
        status: newStatus,
      });
      setNotice(res.message);
      setShowCreateModal(false);
      setNewName("");
      setNewCode("");
      setNewCity("");
      setNewState("");
      setNewAddress("");
      setNewPhone("");
      await loadData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to create store.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusToggle = async (store: PartnerStoreItem, status: "active" | "setup" | "inactive") => {
    setError(null);
    setNotice(null);
    try {
      const res = await updatePartnerStoreStatusApi(store.id, {
        status,
        reason: `Partner admin changed store status to ${status}`,
      });
      setNotice(res.message);
      await loadData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to update store status.");
    }
  };

  return (
    <PartnerLayout
      title="Store Management"
      subtitle="Create and manage store branches belonging to customer pharmacy organizations."
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
          <span>Add Store</span>
        </Button>
      }
    >
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
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 mb-6 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by store name, code, city, or pharmacy..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#0F766E]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <option value="">All Store Statuses</option>
            <option value="active">Active</option>
            <option value="setup">Under Setup</option>
            <option value="inactive">Inactive</option>
          </select>
          <Button type="button" variant="secondary" size="sm" onClick={loadData}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stores Table */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Store Branch</th>
                <th className="py-3 px-4">Customer Pharmacy</th>
                <th className="py-3 px-4">Assigned Manager</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Update Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    Loading stores...
                  </td>
                </tr>
              ) : stores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    <Store className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                    No stores found.
                  </td>
                </tr>
              ) : (
                stores.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">{st.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {st.code} {st.city ? `· ${st.city}` : ""}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-slate-800">{st.organization_name}</p>
                      {!st.organization_is_active && (
                        <span className="text-[10px] font-semibold text-rose-600">
                          Organization Suspended
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {st.manager_name ? (
                        <div>
                          <p className="font-medium text-slate-800">{st.manager_name}</p>
                          <p className="text-[11px] text-slate-500">{st.manager_email}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize border ${
                          st.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : st.status === "setup"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {st.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <select
                        value={st.status}
                        onChange={(e) =>
                          handleStatusToggle(st, e.target.value as "active" | "setup" | "inactive")
                        }
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
                      >
                        <option value="active">Active</option>
                        <option value="setup">Under Setup</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Store Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={handleCreateStore}
            className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Create Customer Store Branch</h3>
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
                value={newOrgId}
                onChange={(e) => setNewOrgId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
              >
                {pharmacies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.is_active ? "Active" : "Suspended"})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Store Name *"
                placeholder="Branch Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
              <Input
                label="Store Code (Auto if blank)"
                placeholder="STR-002"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
              />
              <Input
                label="City"
                placeholder="City"
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
              />
              <Input
                label="State"
                placeholder="State"
                value={newState}
                onChange={(e) => setNewState(e.target.value)}
              />
              <Input
                label="Phone"
                placeholder="Phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as "active" | "setup")}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                >
                  <option value="active">Active</option>
                  <option value="setup">Under Setup</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Address"
                  placeholder="Street, Landmark"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={submitting} className="bg-[#0F766E]">
                Create Store
              </Button>
            </div>
          </form>
        </div>
      )}
    </PartnerLayout>
  );
}

export default function PartnerStoresPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC]" />}>
      <PartnerStoresContent />
    </Suspense>
  );
}
