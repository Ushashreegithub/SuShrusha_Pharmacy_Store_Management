"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Building2,
  Store,
  ShieldCheck,
  ChevronRight,
  Eye,
  Edit,
  X,
  Phone,
  Mail,
  Lock,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import {
  getOrganizationTeamApi,
  createEmployeeApi,
  ApiError,
} from "@/lib/api";
import { TeamMember } from "@/types/dashboard";

function TeamManagementContent() {
  const { user, stores } = useDashboard();

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add Employee Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"manager" | "pharmacist" | "cashier" | "staff">("pharmacist");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [initialPassword, setInitialPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [addLoading, setAddLoading] = useState(false);
  const [addGeneralError, setAddGeneralError] = useState<string | null>(null);

  const isOwner = user?.primary_role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = user?.primary_role === "manager";

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const members = await getOrganizationTeamApi();
      setTeamMembers(members);
      if (stores.length > 0 && selectedStoreIds.length === 0) {
        setSelectedStoreIds([stores[0].id]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load team data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAddModal = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setRole(isOwner ? "pharmacist" : "staff");
    setSelectedStoreIds(stores.length > 0 ? [stores[0].id] : []);
    setInitialPassword("");
    setConfirmPassword("");
    setAddErrors({});
    setAddGeneralError(null);
    setAddModalOpen(true);
  };

  const handleToggleStoreSelection = (storeId: string) => {
    setSelectedStoreIds((prev) => {
      if (prev.includes(storeId)) {
        if (prev.length === 1) return prev; // keep at least 1
        return prev.filter((id) => id !== storeId);
      }
      return [...prev, storeId];
    });
  };

  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddGeneralError(null);
    const errs: Record<string, string> = {};

    if (!fullName.trim()) errs.full_name = "Full name is required";
    if (!email.trim()) {
      errs.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = "Please enter a valid email address";
    }
    if (selectedStoreIds.length === 0) {
      errs.store_ids = "At least one store must be assigned";
    }
    if (!initialPassword) {
      errs.password = "Initial password is required";
    } else if (initialPassword.length < 8) {
      errs.password = "Password must be at least 8 characters";
    }
    if (!confirmPassword) {
      errs.confirm_password = "Confirmation is required";
    } else if (initialPassword !== confirmPassword) {
      errs.confirm_password = "Passwords do not match";
    }

    if (Object.keys(errs).length > 0) {
      setAddErrors(errs);
      return;
    }
    setAddErrors({});
    setAddLoading(true);

    try {
      const res = await createEmployeeApi({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone_number: phone.trim(),
        role,
        store_ids: selectedStoreIds,
        password: initialPassword,
        confirm_password: confirmPassword,
      });

      setAddModalOpen(false);
      setSuccessMsg(res.message || `Account for ${fullName} created successfully.`);
      await loadData();
    } catch (err: any) {
      if (err instanceof ApiError && err.code === "email_already_exists") {
        setAddGeneralError("An account with this email address already exists in the system.");
      } else if (err instanceof ApiError && err.fieldErrors) {
        setAddErrors(err.fieldErrors);
      } else {
        setAddGeneralError(err?.message || "Failed to create employee account. Please verify input fields.");
      }
    } finally {
      setAddLoading(false);
    }
  };

  // Filtered members list
  const filteredMembers = teamMembers.filter((m) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        m.full_name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.store_assignments.some(
          (sa) => sa.store_name.toLowerCase().includes(q) || sa.role.toLowerCase().includes(q)
        );
      if (!matchesSearch) return false;
    }

    if (roleFilter !== "all") {
      const hasRole = m.store_assignments.some((sa) => sa.role === roleFilter);
      if (!hasRole) return false;
    }

    if (storeFilter !== "all") {
      const hasStore = m.store_assignments.some((sa) => sa.store_id === storeFilter);
      if (!hasStore) return false;
    }

    return true;
  });

  return (
    <DashboardLayout
      title="Team & Access Management"
      subtitle="Create, configure, and manage employee accounts and branch store assignments directly."
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

          {(isOwner || isManager) && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenAddModal}
              className="text-xs"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              Add Employee
            </Button>
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

        {/* Search & Filter Controls */}
        <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or role..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-700 bg-white"
            >
              <option value="all">All Roles</option>
              <option value="owner">Owner</option>
              <option value="manager">Store Manager</option>
              <option value="pharmacist">Pharmacist</option>
              <option value="cashier">Cashier</option>
              <option value="staff">Staff Member</option>
            </select>

            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-700 bg-white"
            >
              <option value="all">All Branches</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Team Members Table */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Active Organization Directory ({filteredMembers.length})
              </h3>
              <p className="text-xs text-slate-500">
                Directly managed employee and manager accounts with store authorization
              </p>
            </div>
          </div>

          {filteredMembers.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500 font-medium">
                No team members match the search or filter criteria.
              </p>
              {(isOwner || isManager) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenAddModal}
                  className="text-xs mx-auto"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1" />
                  Add New Employee
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-[#E2E8F0] text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Employee</th>
                    <th className="px-6 py-3">Assigned Branches</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Joined</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((member) => (
                    <tr key={member.user_id} className="hover:bg-slate-50/60 transition-colors">
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
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Active
                        </span>
                      </td>

                      <td className="px-6 py-3.5 text-slate-500 text-[11px]">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-6 py-3.5 text-right">
                        <Link
                          href={`/dashboard/team/${member.user_id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Details</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ADD EMPLOYEE MODAL */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Add New Team Member
                </h3>
                <p className="text-xs text-slate-500">
                  Create an account directly with initial login credentials
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addGeneralError && (
              <Alert variant="error" onClose={() => setAddGeneralError(null)}>
                {addGeneralError}
              </Alert>
            )}

            <form onSubmit={handleAddEmployeeSubmit} className="space-y-4">
              <Input
                label="Full Name"
                placeholder="e.g. Ramesh Kumar"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (addErrors.full_name) setAddErrors((prev) => ({ ...prev, full_name: "" }));
                }}
                error={addErrors.full_name}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="ramesh@PharmaPro.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (addErrors.email) setAddErrors((prev) => ({ ...prev, email: "" }));
                  }}
                  error={addErrors.email}
                  required
                />

                <Input
                  label="Contact Phone"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  error={addErrors.phone_number}
                />
              </div>

              {/* Role selection */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Assigned Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                >
                  {isOwner && <option value="manager">Store Manager</option>}
                  <option value="pharmacist">Pharmacist</option>
                  <option value="cashier">Cashier</option>
                  <option value="staff">Staff Member</option>
                </select>
                <p className="text-[11px] text-slate-400">
                  {role === "manager"
                    ? "Full managerial access across designated store branches."
                    : "Staff access restricted to operational functions in assigned stores."}
                </p>
              </div>

              {/* Store branches assignment */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Assign Store Branches ({selectedStoreIds.length} selected)
                </label>
                {addErrors.store_ids && (
                  <p className="text-xs text-rose-600">{addErrors.store_ids}</p>
                )}
                <div className="max-h-36 overflow-y-auto border border-[#E2E8F0] rounded-xl p-2 space-y-1.5 bg-slate-50/50">
                  {stores.map((s) => {
                    const isSelected = selectedStoreIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                          isSelected ? "bg-teal-50/80 border border-teal-200" : "bg-white border border-slate-100 hover:bg-slate-50"
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

              {/* Initial Password Section */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Initial Login Credentials</span>
                  <span className="text-[11px] text-slate-500 block">
                    Set a secure initial password. The employee can use this immediately and change it voluntarily anytime.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Initial Password"
                    type="password"
                    placeholder="Min 8 characters"
                    value={initialPassword}
                    onChange={(e) => {
                      setInitialPassword(e.target.value);
                      if (addErrors.password) setAddErrors((prev) => ({ ...prev, password: "" }));
                    }}
                    error={addErrors.password}
                    required
                  />

                  <Input
                    label="Confirm Password"
                    type="password"
                    placeholder="Repeat initial password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (addErrors.confirm_password) setAddErrors((prev) => ({ ...prev, confirm_password: "" }));
                    }}
                    error={addErrors.confirm_password}
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={addLoading}
                  className="text-xs"
                >
                  Create Account
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
