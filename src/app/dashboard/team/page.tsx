"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Mail,
  UserPlus,
  Send,
  RotateCcw,
  Ban,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Building2,
  Store,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatusBadge } from "@/components/auth/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import {
  getOrganizationTeamApi,
  getInvitationsApi,
  createInvitationApi,
  resendInvitationApi,
  revokeInvitationApi,
} from "@/lib/api";
import { TeamMember, Invitation } from "@/types/dashboard";

function TeamManagementContent() {
  const { user, stores } = useDashboard();
  const [activeTab, setActiveTab] = useState<"members" | "invitations">("members");

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStoreId, setInviteStoreId] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "pharmacist" | "cashier" | "staff">("pharmacist");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const isOwner = user?.primary_role === "owner" || user?.organizations?.some((o) => o.is_owner);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [membersData, invitesData] = await Promise.all([
        getOrganizationTeamApi().catch(() => []),
        getInvitationsApi({
          status: statusFilter !== "all" ? statusFilter : undefined,
        }).catch(() => []),
      ]);
      setTeamMembers(membersData);
      setInvitations(invitesData);
      if (stores.length > 0 && !inviteStoreId) {
        setInviteStoreId(stores[0].id);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load team data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteStoreId) return;

    setInviteLoading(true);
    setInviteError(null);
    try {
      const invite = await createInvitationApi({
        email: inviteEmail.trim().toLowerCase(),
        store_id: inviteStoreId,
        role: inviteRole,
      });

      setInviteModalOpen(false);
      setInviteEmail("");
      setSuccessMsg(
        `Invitation issued for ${invite.email}. ${
          invite.emailDispatched
            ? "Invitation email dispatched."
            : "Invitation link generated in local console."
        }`
      );
      await loadData();
    } catch (err: any) {
      setInviteError(err?.message || "Failed to issue invitation.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleResendInvite = async (invitationId: string) => {
    try {
      const res = await resendInvitationApi(invitationId);
      setSuccessMsg(`Invitation resent to ${res.email}.`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to resend invitation.");
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    try {
      await revokeInvitationApi(invitationId);
      setSuccessMsg("Invitation revoked successfully.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to revoke invitation.");
    }
  };

  // Filtered lists
  const filteredMembers = teamMembers.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.full_name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.store_assignments.some((sa) => sa.store_name.toLowerCase().includes(q) || sa.role.toLowerCase().includes(q))
    );
  });

  const filteredInvitations = invitations.filter((inv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inv.email.toLowerCase().includes(q) ||
      inv.store_name.toLowerCase().includes(q) ||
      inv.role.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout
      title="Team & Access Management"
      subtitle="Manage organization staff, branch managers, and employee onboarding invitations."
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            isLoading={isLoading}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setInviteModalOpen(true)}
            className="text-xs"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1" />
            Invite Team Member
          </Button>
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

        {/* Tab Controls & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab("members")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "members"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Active Team ({teamMembers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("invitations")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "invitations"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Invitations ({invitations.length})
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, or branch..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </div>

            {activeTab === "invitations" && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-700 bg-white"
              >
                <option value="all">All States</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            )}
          </div>
        </div>

        {/* TAB 1: ACTIVE TEAM DIRECTORY */}
        {activeTab === "members" && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Organization Team Directory
                </h3>
                <p className="text-xs text-slate-500">
                  All active staff, pharmacists, and managers across organization branches
                </p>
              </div>
            </div>

            {filteredMembers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No team members match your filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-[#E2E8F0] text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Team Member</th>
                      <th className="px-6 py-3">Branch Assignments</th>
                      <th className="px-6 py-3">Roles</th>
                      <th className="px-6 py-3">Verification</th>
                      <th className="px-6 py-3">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMembers.map((member) => (
                      <tr key={member.user_id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3.5">
                          <div className="font-bold text-slate-900">
                            {member.full_name}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {member.email}
                          </div>
                          {member.phone_number && (
                            <div className="text-[10px] text-slate-400">
                              {member.phone_number}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {member.store_assignments.map((sa) => (
                              <span
                                key={sa.membership_id}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                                  sa.is_active
                                    ? "bg-slate-50 border-slate-200 text-slate-700"
                                    : "bg-rose-50 border-rose-200 text-rose-700 line-through"
                                }`}
                              >
                                {sa.store_name} ({sa.store_code})
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="px-6 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {member.store_assignments.map((sa) => (
                              <span
                                key={sa.membership_id}
                                className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-teal-50 text-[#0F766E] border border-teal-200"
                              >
                                {sa.role}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="px-6 py-3.5">
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Verified
                          </span>
                        </td>

                        <td className="px-6 py-3.5 text-slate-500 text-[11px]">
                          {new Date(member.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INVITATIONS DIRECTORY */}
        {activeTab === "invitations" && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Staff &amp; Manager Invitations
                </h3>
                <p className="text-xs text-slate-500">
                  Single-use onboarding links issued for organization branches
                </p>
              </div>
            </div>

            {filteredInvitations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No invitations found matching filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-[#E2E8F0] text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Invitee</th>
                      <th className="px-6 py-3">Target Branch</th>
                      <th className="px-6 py-3">Role</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Expires</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvitations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3.5">
                          <span className="font-mono text-slate-900 font-semibold">
                            {inv.email}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            Invited by: {inv.invited_by_name}
                          </span>
                        </td>

                        <td className="px-6 py-3.5 text-slate-700 font-medium">
                          {inv.store_name}{" "}
                          <span className="font-mono text-slate-400 text-[10px]">
                            ({inv.store_code})
                          </span>
                        </td>

                        <td className="px-6 py-3.5 capitalize font-medium text-slate-700">
                          {inv.role}
                        </td>

                        <td className="px-6 py-3.5">
                          <StatusBadge
                            status={
                              inv.status === "pending"
                                ? "pending"
                                : inv.status === "accepted"
                                ? "active"
                                : inv.status === "expired"
                                ? "expired"
                                : "inactive"
                            }
                            label={inv.status.toUpperCase()}
                          />
                        </td>

                        <td className="px-6 py-3.5 text-slate-500 text-[11px]">
                          {new Date(inv.expires_at).toLocaleString()}
                        </td>

                        <td className="px-6 py-3.5 text-right space-x-2">
                          {inv.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleResendInvite(inv.id)}
                                className="text-xs font-semibold text-[#0F766E] hover:underline"
                              >
                                Resend
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevokeInvite(inv.id)}
                                className="text-xs font-semibold text-rose-600 hover:underline"
                              >
                                Revoke
                              </button>
                            </>
                          )}
                          {inv.status === "expired" && (
                            <button
                              type="button"
                              onClick={() => handleResendInvite(inv.id)}
                              className="text-xs font-semibold text-[#0F766E] hover:underline"
                            >
                              Renew
                            </button>
                          )}
                          {inv.status === "accepted" && (
                            <span className="text-[11px] text-emerald-700 font-medium">
                              Onboarded
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CREATE INVITATION MODAL */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Invite Team Member
            </h3>
            <p className="text-xs text-slate-600">
              Dispatches a secure single-use invitation. The employee will configure their password upon accepting.
            </p>

            {inviteError && (
              <Alert variant="error" onClose={() => setInviteError(null)}>
                {inviteError}
              </Alert>
            )}

            <form onSubmit={handleSendInvite} className="space-y-4">
              <Input
                label="Recipient Email Address"
                type="email"
                placeholder="e.g. staff@sushrusha.com"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assign to Store Branch
                </label>
                <select
                  value={inviteStoreId}
                  onChange={(e) => setInviteStoreId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Intended Staff Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
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
                  onClick={() => setInviteModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={inviteLoading}
                >
                  Send Invitation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function TeamPage() {
  return (
    <DashboardProvider>
      <TeamManagementContent />
    </DashboardProvider>
  );
}

