"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Users,
  ArrowLeft,
  Store,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Save,
  RefreshCw,
  Phone,
  Mail,
  Building2,
  Calendar,
  Lock,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import {
  getTeamMemberDetailApi,
  updateTeamMemberApi,
  updateStoreMemberStatusApi,
  ApiError,
} from "@/lib/api";
import { TeamMember } from "@/types/dashboard";

function TeamMemberDetailContent() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const { user, stores } = useDashboard();

  const [member, setMember] = useState<TeamMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit form state
  const [isEditing, setIsEditing] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<"manager" | "pharmacist" | "cashier" | "staff">("staff");
  const [editStoreIds, setEditStoreIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  // Membership status toggling state
  const [togglingMembershipId, setTogglingMembershipId] = useState<string | null>(null);

  const isOwner = user?.primary_role === "owner" || user?.organizations?.some((o) => o.is_owner);

  const loadMember = async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getTeamMemberDetailApi(userId);
      setMember(data);
      setEditFullName(data.full_name);
      setEditPhone(data.phone_number || "");
      setEditRole(
        (data.role as any) ||
        (data.store_assignments[0]?.role as any) ||
        "staff"
      );
      setEditStoreIds(data.store_assignments.map((s) => s.store_id).filter((id) => id !== "all"));
    } catch (err: any) {
      setError(err?.message || "Failed to load team member details.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMember();
  }, [userId]);

  const handleToggleStoreSelection = (storeId: string) => {
    setEditStoreIds((prev) => {
      if (prev.includes(storeId)) {
        if (prev.length === 1) return prev; // keep at least 1
        return prev.filter((id) => id !== storeId);
      }
      return [...prev, storeId];
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;
    setSuccessMsg(null);
    setSaveErrors({});

    if (!editFullName.trim()) {
      setSaveErrors({ full_name: "Full name is required" });
      return;
    }
    if (editStoreIds.length === 0) {
      setSaveErrors({ store_ids: "At least one store must be assigned" });
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateTeamMemberApi(userId, {
        full_name: editFullName.trim(),
        phone_number: editPhone.trim(),
        role: editRole,
        store_ids: editStoreIds,
      });

      setMember(updated);
      setIsEditing(false);
      setSuccessMsg("Employee details updated successfully.");
    } catch (err: any) {
      if (err instanceof ApiError && err.fieldErrors) {
        setSaveErrors(err.fieldErrors);
      } else {
        setError(err?.message || "Failed to update employee details.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStoreMembership = async (storeId: string, membershipId: string, currentActive: boolean) => {
    if (membershipId === "owner-org" || storeId === "all") return;
    setTogglingMembershipId(membershipId);
    setSuccessMsg(null);
    try {
      await updateStoreMemberStatusApi(storeId, membershipId, {
        is_active: !currentActive,
      });
      setSuccessMsg(
        `Membership status updated to ${!currentActive ? "Active" : "Inactive"} for this branch.`
      );
      await loadMember();
    } catch (err: any) {
      setError(err?.message || "Failed to toggle store membership status.");
    } finally {
      setTogglingMembershipId(null);
    }
  };

  return (
    <DashboardLayout
      title={member ? member.full_name : "Employee Details"}
      subtitle="View, edit, and manage branch store assignments and account permissions."
      action={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/team">
            <Button variant="outline" size="sm" className="text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Back to Team
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={loadMember}
            isLoading={isLoading}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      }
    >
      <div className="max-w-4xl space-y-6">
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

        {isLoading ? (
          <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center text-xs text-slate-500">
            Loading team member record...
          </div>
        ) : !member ? (
          <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center space-y-3">
            <p className="text-xs text-slate-500">Team member record not found.</p>
            <Link href="/dashboard/team">
              <Button variant="primary" size="sm" className="text-xs">
                Return to Team Directory
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Profile Card */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#0F766E] text-white flex items-center justify-center font-bold text-xl uppercase shadow-xs">
                  {member.full_name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{member.full_name}</h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-teal-50 text-[#0F766E] border border-teal-200">
                      {member.role || "Staff"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">{member.email}</p>
                  {member.phone_number && (
                    <p className="text-xs text-slate-400">{member.phone_number}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={isEditing ? "outline" : "primary"}
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs"
                >
                  {isEditing ? "Cancel Editing" : "Edit Employee"}
                </Button>
              </div>
            </div>

            {/* EDIT PROFILE FORM */}
            {isEditing && (
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Edit Employee Details</h3>
                  <span className="text-[11px] text-slate-400">Updates saved to PostgreSQL</span>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Full Name"
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      error={saveErrors.full_name}
                      required
                    />

                    <Input
                      label="Contact Phone"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      error={saveErrors.phone_number}
                    />
                  </div>

                  {/* Role */}
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">Role</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white"
                    >
                      {isOwner && <option value="manager">Store Manager</option>}
                      <option value="pharmacist">Pharmacist</option>
                      <option value="cashier">Cashier</option>
                      <option value="staff">Staff Member</option>
                    </select>
                  </div>

                  {/* Branch Assignments */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Assigned Branches ({editStoreIds.length} selected)
                    </label>
                    {saveErrors.store_ids && (
                      <p className="text-xs text-rose-600">{saveErrors.store_ids}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-[#E2E8F0] rounded-xl p-3 bg-slate-50/50">
                      {stores.map((s) => {
                        const isSelected = editStoreIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border transition-colors ${
                              isSelected ? "bg-teal-50 border-teal-200" : "bg-white border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleStoreSelection(s.id)}
                              className="rounded text-[#0F766E] focus:ring-[#0F766E]"
                            />
                            <span className="font-semibold text-slate-800">{s.name}</span>
                            <span className="font-mono text-[10px] text-slate-400">({s.code})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={isSaving}
                      className="text-xs"
                    >
                      <Save className="w-3.5 h-3.5 mr-1" />
                      Save Changes
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* BRANCH ASSIGNMENTS & MEMBERSHIPS */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Store Branch Memberships ({member.store_assignments.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Active permissions per branch. Deactivating one branch does not affect other branches or account access.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {member.store_assignments.map((sa) => (
                  <div
                    key={sa.membership_id}
                    className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-[#0F766E] flex items-center justify-center font-bold text-xs mt-0.5">
                        <Store className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                          <span>{sa.store_name}</span>
                          <span className="font-mono text-[10px] text-slate-400 font-normal">
                            ({sa.store_code})
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
                            {sa.role}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Status:{" "}
                          <span className={sa.is_active ? "text-emerald-700 font-semibold" : "text-rose-600 font-semibold"}>
                            {sa.is_active ? "Authorized & Active" : "Deactivated for this branch"}
                          </span>
                        </p>
                      </div>
                    </div>

                    {sa.membership_id !== "owner-org" && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleStoreMembership(sa.store_id, sa.membership_id, sa.is_active)}
                          isLoading={togglingMembershipId === sa.membership_id}
                          className={`text-xs ${
                            sa.is_active
                              ? "text-rose-600 hover:text-rose-700 hover:border-rose-300"
                              : "text-emerald-700 hover:text-emerald-800 hover:border-emerald-300"
                          }`}
                        >
                          {sa.is_active ? (
                            <>
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Deactivate for this Branch
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Activate for this Branch
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function TeamMemberDetailPage() {
  return (
    <DashboardProvider>
      <TeamMemberDetailContent />
    </DashboardProvider>
  );
}

