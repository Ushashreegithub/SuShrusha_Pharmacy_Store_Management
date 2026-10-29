"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Store,
  MapPin,
  Phone,
  Mail,
  User,
  Users,
  Edit,
  UserCheck,
  UserPlus,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  Building2,
  Calendar,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatusBadge } from "@/components/auth/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import {
  getStoreDetailApi,
  getStoreMembersApi,
  assignStoreManagerApi,
  updateStoreMemberStatusApi,
  addStoreMemberApi,
} from "@/lib/api";
import { Store as StoreType, StoreMember } from "@/types/dashboard";

function StoreDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const storeId = params.id as string;
  const createdNotice = searchParams.get("created") === "true";
  const updatedNotice = searchParams.get("updated") === "true";

  const { user, refreshStores } = useDashboard();
  const [store, setStore] = useState<StoreType | null>(null);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(
    createdNotice
      ? "Store branch created successfully!"
      : updatedNotice
      ? "Store branch updated successfully!"
      : null
  );

  // Modals state
  const [assignManagerOpen, setAssignManagerOpen] = useState(false);
  const [managerEmail, setManagerEmail] = useState("");
  const [managerLoading, setManagerLoading] = useState(false);
  const [managerError, setManagerError] = useState<string | null>(null);

  const [directAddOpen, setDirectAddOpen] = useState(false);
  const [directEmail, setDirectEmail] = useState("");
  const [directRole, setDirectRole] = useState("pharmacist");
  const [directLoading, setDirectLoading] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  const isOwner = user?.primary_role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManagerOfThisStore = store?.manager === user?.id;
  const canManage = isOwner || isManagerOfThisStore;

  const loadAll = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sData, mData] = await Promise.all([
        getStoreDetailApi(storeId),
        getStoreMembersApi(storeId).catch(() => []),
      ]);
      setStore(sData);
      setMembers(mData);
    } catch (err: any) {
      setError(err?.message || "Failed to load store branch details.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [storeId]);

  // Manager Assignment Handler
  const handleAssignManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerEmail.trim()) return;
    setManagerLoading(true);
    setManagerError(null);
    try {
      const updated = await assignStoreManagerApi(storeId, managerEmail.trim().toLowerCase());
      setStore(updated);
      setAssignManagerOpen(false);
      setManagerEmail("");
      setSuccessMsg(`Manager assigned successfully: ${updated.manager_name || managerEmail}`);
      await refreshStores();
      await loadAll();
    } catch (err: any) {
      setManagerError(err?.message || "Failed to assign store manager.");
    } finally {
      setManagerLoading(false);
    }
  };

  // Direct Member Assignment Handler
  const handleDirectAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directEmail.trim()) return;
    setDirectLoading(true);
    setDirectError(null);
    try {
      await addStoreMemberApi(storeId, {
        email: directEmail.trim().toLowerCase(),
        role: directRole,
      });
      setDirectAddOpen(false);
      setDirectEmail("");
      setSuccessMsg("Team member assigned to this store branch.");
      await loadAll();
    } catch (err: any) {
      setDirectError(err?.message || "Failed to add member to store.");
    } finally {
      setDirectLoading(false);
    }
  };

  // Toggle Membership Status Handler
  const handleToggleMemberStatus = async (member: StoreMember) => {
    try {
      await updateStoreMemberStatusApi(storeId, member.id, {
        is_active: !member.is_active,
      });
      setSuccessMsg(
        `Membership for ${member.full_name} set to ${!member.is_active ? "Active" : "Inactive"}.`
      );
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to update membership status.");
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Store Branch Details">
        <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
          Loading store branch details...
        </div>
      </DashboardLayout>
    );
  }

  if (error && !store) {
    return (
      <DashboardLayout title="Store Branch Not Found">
        <div className="bg-white p-6 rounded-2xl border border-rose-200 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <h2 className="text-sm font-bold text-slate-900">Unable to Load Store Branch</h2>
          <p className="text-xs text-slate-600">{error}</p>
          <Link href="/dashboard/stores">
            <Button variant="primary" size="sm">
              Return to Stores List
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  if (!store) return null;

  return (
    <DashboardLayout
      title={store.name}
      subtitle={`Branch Code: ${store.code} • Organization: ${store.organization_name || "PharmaPro"}`}
      action={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/stores">
            <Button variant="outline" size="sm" className="text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              All Stores
            </Button>
          </Link>
          {isOwner && (
            <Link href={`/dashboard/stores/${store.id}/edit`}>
              <Button variant="primary" size="sm" className="text-xs">
                <Edit className="w-3.5 h-3.5 mr-1" />
                Edit Store
              </Button>
            </Link>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {successMsg && (
          <Alert variant="success" onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </Alert>
        )}
        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Store Operational Readiness Status Banner */}
        <div className="p-5 bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                store.status === "active"
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  : "bg-amber-50 text-amber-600 border border-amber-200"
              }`}
            >
              {store.status === "active" ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Clock className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900">
                  Operational Status:
                </span>
                <StatusBadge
                  status={store.status === "active" ? "active" : "pending"}
                  label={store.status === "active" ? "Active Operational" : "Under Setup"}
                />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {store.status === "active"
                  ? "This store branch is active and accepting inventory receiving, staff attendance, and dispensing."
                  : "Store is currently in pre-launch setup mode. Assign managers and staff before setting active."}
              </p>
            </div>
          </div>

          {isOwner && store.status !== "active" && (
            <Link href={`/dashboard/stores/${store.id}/edit`}>
              <Button variant="primary" size="sm" className="text-xs whitespace-nowrap">
                Activate Store Branch
              </Button>
            </Link>
          )}
        </div>

        {/* 2-Column Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Store Information Card */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Location Details
              </h3>
              {isOwner && (
                <Link
                  href={`/dashboard/stores/${store.id}/edit`}
                  className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1"
                >
                  <Edit className="w-3 h-3" />
                  Edit
                </Link>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Street Address</span>
                <span className="font-medium text-slate-800">
                  {store.address || "Not specified"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 block text-[11px]">City</span>
                  <span className="font-medium text-slate-800">
                    {store.city || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">State</span>
                  <span className="font-medium text-slate-800">
                    {store.state || "—"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 block text-[11px]">Postal Code</span>
                  <span className="font-medium text-slate-800 font-mono">
                    {store.postal_code || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Phone</span>
                  <span className="font-medium text-slate-800">
                    {store.phone || "—"}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Branch Email</span>
                <span className="font-medium text-slate-800 font-mono">
                  {store.email || "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Registered On</span>
                <span className="text-slate-600">
                  {store.created_at ? new Date(store.created_at).toLocaleDateString() : "—"}
                </span>
              </div>
            </div>
          </div>



          {/* Column 3: Quick Branch Stats */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-3">
              Branch Team Overview
            </h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Total Assigned Members</span>
                <span className="font-bold text-slate-900 font-mono">
                  {members.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Active Staff</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {members.filter((m) => m.is_active).length}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Inactive Staff</span>
                <span className="font-bold text-slate-500 font-mono">
                  {members.filter((m) => !m.is_active).length}
                </span>
              </div>
            </div>

            {canManage && (
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDirectAddOpen(true)}
                  className="text-xs w-full"
                >
                  <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                  Assign Existing User
                </Button>
                {isOwner && (
                  <Link href="/dashboard/team">
                    <Button
                      variant="primary"
                      size="sm"
                      className="text-xs w-full"
                    >
                      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                      Create New Account
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Store Staff Membership Table */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Branch Team Members ({members.length})
              </h3>
              <p className="text-xs text-slate-500">
                Staff members and pharmacists holding credentials for this branch
              </p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDirectAddOpen(true)}
                  className="text-xs"
                >
                  <UserCheck className="w-3.5 h-3.5 mr-1" />
                  Assign Existing User
                </Button>
                {isOwner && (
                  <Link href="/dashboard/team">
                    <Button
                      variant="primary"
                      size="sm"
                      className="text-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5 mr-1" />
                      Create New Account
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>

          {members.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No staff members assigned to this store branch yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-[#E2E8F0] text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Member</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Joined</th>
                    {canManage && <th className="px-6 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-slate-900">
                          {member.full_name}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {member.email}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 capitalize font-medium text-slate-700">
                        {member.role}
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge
                          status={member.is_active ? "active" : "inactive"}
                          label={member.is_active ? "Active" : "Inactive"}
                        />
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 text-[11px]">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>
                      {canManage && (
                        <td className="px-6 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleMemberStatus(member)}
                            className={`text-xs font-semibold hover:underline ${
                              member.is_active
                                ? "text-rose-600 hover:text-rose-800"
                                : "text-emerald-600 hover:text-emerald-800"
                            }`}
                          >
                            {member.is_active ? "Deactivate" : "Reactivate"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ASSIGN MANAGER MODAL */}
      {assignManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Assign Store Manager</h3>
            <p className="text-xs text-slate-600">
              Designate a registered user account as the operational store manager for{" "}
              <strong>{store.name}</strong>.
            </p>
            {managerError && (
              <Alert variant="error" onClose={() => setManagerError(null)}>
                {managerError}
              </Alert>
            )}
            <form onSubmit={handleAssignManager} className="space-y-4">
              <Input
                label="Manager Email Address"
                type="email"
                placeholder="e.g. manager@PharmaPro.com"
                required
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
                helperText="Must be an existing registered user account"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignManagerOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={managerLoading}
                >
                  Assign Manager
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIRECT ADD EXISTING USER MODAL */}
      {directAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Direct Assign Existing User
            </h3>
            <p className="text-xs text-slate-600">
              Grants branch membership to an existing registered user account directly.
            </p>
            {directError && (
              <Alert variant="error" onClose={() => setDirectError(null)}>
                {directError}
              </Alert>
            )}
            <form onSubmit={handleDirectAdd} className="space-y-4">
              <Input
                label="Registered User Email"
                type="email"
                placeholder="e.g. existing.pharmacist@PharmaPro.com"
                required
                value={directEmail}
                onChange={(e) => setDirectEmail(e.target.value)}
              />
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Store Role
                </label>
                <select
                  value={directRole}
                  onChange={(e) => setDirectRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                >
                  <option value="pharmacist">Pharmacist</option>
                  <option value="cashier">Cashier</option>
                  <option value="staff">Staff Member</option>
                  {isOwner && <option value="manager">Store Manager</option>}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDirectAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={directLoading}
                >
                  Assign to Branch
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function StoreDetailPage() {
  return (
    <DashboardProvider>
      <StoreDetailContent />
    </DashboardProvider>
  );
}

