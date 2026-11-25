"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  LogOut,
  Building2,
  Store,
  ShieldCheck,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Check,
  X,
  Clock,
  Phone,
  Mail,
  Lock,
} from "lucide-react";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import {
  getPlatformUsersApi,
  getPlatformUserDetailApi,
  updatePlatformUserStatusApi,
  generatePlatformTemporaryPasswordApi,
  revokePlatformUserSessionsApi,
  getPlatformOrganizationsApi,
  getCurrentUserApi,
  ApiError,
} from "@/lib/api";
import {
  PlatformUserListItem,
  PlatformUserDetail,
  PlatformPaginatedResponse,
  PlatformOrganizationListItem,
} from "@/types/platform";
import { UserProfile } from "@/types/auth";

export default function PlatformUsersPage() {
  const [data, setData] = useState<PlatformPaginatedResponse<PlatformUserListItem> | null>(null);
  const [organizations, setOrganizations] = useState<PlatformOrganizationListItem[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "suspended" | "">("");
  const [currentPage, setCurrentPage] = useState(1);

  // Action Modals State
  const [inspectUser, setInspectUser] = useState<PlatformUserDetail | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Status Modal
  const [statusModalUser, setStatusModalUser] = useState<PlatformUserListItem | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Temporary Password Modal
  const [tempPassModalUser, setTempPassModalUser] = useState<PlatformUserListItem | null>(null);
  const [tempPassReason, setTempPassReason] = useState("");
  const [tempPassSubmitting, setTempPassSubmitting] = useState(false);
  const [generatedTempPass, setGeneratedTempPass] = useState<string | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);
  const [tempPassError, setTempPassError] = useState<string | null>(null);

  // Revoke Sessions Modal
  const [revokeModalUser, setRevokeModalUser] = useState<PlatformUserListItem | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Load Admin Profile & Orgs once
  useEffect(() => {
    async function init() {
      try {
        const [adminProfile, orgsRes] = await Promise.all([
          getCurrentUserApi(),
          getPlatformOrganizationsApi({ page_size: 100 }),
        ]);
        if (adminProfile) setCurrentAdmin(adminProfile);
        if (orgsRes && orgsRes.results) setOrganizations(orgsRes.results);
      } catch (err) {
        console.warn("Could not pre-fetch organizations or admin profile:", err);
      }
    }
    init();
  }, []);

  // Fetch Users
  const fetchUsers = useCallback(
    async (background = false) => {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const res = await getPlatformUsersApi({
          search: debouncedSearch || undefined,
          organization_id: orgFilter || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
          page: currentPage,
        });
        setData(res);
      } catch (err: any) {
        console.error("Failed to fetch users:", err);
        if (err instanceof ApiError) {
          setError(err.message || "Failed to load user directory.");
        } else {
          setError("Network error communicating with platform service.");
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [debouncedSearch, orgFilter, roleFilter, statusFilter, currentPage]
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Detail inspection
  const handleInspect = async (user: PlatformUserListItem) => {
    setInspectLoading(true);
    setInspectUser(null);
    try {
      const detail = await getPlatformUserDetailApi(user.id);
      setInspectUser(detail);
    } catch (err: any) {
      console.error("Failed to load user details:", err);
      // Fallback to list item if detail fails
      setInspectUser({ ...user, audit_activity: [] });
    } finally {
      setInspectLoading(false);
    }
  };

  // Status Change Submit
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalUser) return;
    if (!statusReason.trim() || statusReason.trim().length < 3) {
      setStatusError("Reason must be at least 3 characters.");
      return;
    }

    setStatusSubmitting(true);
    setStatusError(null);
    const targetStatus = !statusModalUser.is_active;

    try {
      const res = await updatePlatformUserStatusApi(statusModalUser.id, {
        is_active: targetStatus,
        reason: statusReason.trim(),
      });

      setSuccessBanner(
        targetStatus
          ? `User '${statusModalUser.email}' activated successfully.`
          : `User '${statusModalUser.email}' suspended. Revoked ${res.revoked_sessions_count} active database session(s).`
      );
      setStatusModalUser(null);
      fetchUsers(true);
    } catch (err: any) {
      console.error("Failed to change user status:", err);
      setStatusError(err.message || "Failed to change user status.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  // Temporary Password Submit
  const handleTempPassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempPassModalUser) return;
    if (!tempPassReason.trim() || tempPassReason.trim().length < 3) {
      setTempPassError("Reason must be at least 3 characters.");
      return;
    }

    setTempPassSubmitting(true);
    setTempPassError(null);

    try {
      const res = await generatePlatformTemporaryPasswordApi(tempPassModalUser.id, {
        reason: tempPassReason.trim(),
      });
      setGeneratedTempPass(res.temporary_password);
      setCopiedPass(false);
      setSuccessBanner(
        `Temporary password generated for '${tempPassModalUser.email}'. All prior sessions evicted.`
      );
      fetchUsers(true);
    } catch (err: any) {
      console.error("Failed to generate temporary password:", err);
      setTempPassError(err.message || "Failed to generate temporary password.");
    } finally {
      setTempPassSubmitting(false);
    }
  };

  // Revoke Sessions Submit
  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeModalUser) return;

    setRevokeSubmitting(true);
    setRevokeError(null);

    try {
      const res = await revokePlatformUserSessionsApi(revokeModalUser.id, {
        reason: revokeReason.trim() || "Administrator session revocation",
      });
      setSuccessBanner(
        `Successfully terminated ${res.revoked_sessions_count} active session(s) for '${revokeModalUser.email}'.`
      );
      setRevokeModalUser(null);
    } catch (err: any) {
      console.error("Failed to revoke sessions:", err);
      setRevokeError(err.message || "Failed to revoke user sessions.");
    } finally {
      setRevokeSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2500);
  };

  const totalPages = data ? Math.ceil(data.count / 20) : 1;

  return (
    <PlatformLayout
      title="Users & Accounts Management"
      subtitle="Global cross-tenant user directory, security state, temporary credentials, and session eviction."
      actions={
        <button
          onClick={() => fetchUsers(true)}
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

        {/* Global Error Banner */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-rose-900">User Directory Error</h4>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => fetchUsers()}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* ========================================== */}
        {/* SEARCH & FILTERS BAR */}
        {/* ========================================== */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by full name, email, or phone..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Organization Filter */}
            <select
              value={orgFilter}
              onChange={(e) => {
                setOrgFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Organizations</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Roles</option>
              <option value="owner">Pharmacy Owner</option>
              <option value="store_manager">Store Manager</option>
              <option value="pharmacist">Pharmacist</option>
              <option value="cashier">Cashier</option>
              <option value="inventory_staff">Inventory Staff</option>
            </select>

            {/* Status Segmented Buttons */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                onClick={() => {
                  setStatusFilter("");
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 font-medium rounded-md transition-colors ${
                  statusFilter === ""
                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                onClick={() => {
                  setStatusFilter("active");
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 font-medium rounded-md transition-colors ${
                  statusFilter === "active"
                    ? "bg-white text-emerald-700 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => {
                  setStatusFilter("suspended");
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 font-medium rounded-md transition-colors ${
                  statusFilter === "suspended"
                    ? "bg-white text-rose-700 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Suspended
              </button>
            </div>
          </div>
        </div>

        {/* Directory Header Summary */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-800">{data?.results.length || 0}</span> of{" "}
            <span className="font-semibold text-slate-800">{data?.count || 0}</span> registered accounts
            {debouncedSearch && <span> matching &ldquo;{debouncedSearch}&rdquo;</span>}
          </div>
          {data && data.count > 0 && (
            <span>
              Page {currentPage} of {totalPages}
            </span>
          )}
        </div>

        {/* ========================================== */}
        {/* USERS TABLE */}
        {/* ========================================== */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {isLoading && !data ? (
            <div className="p-8 space-y-4 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-lg w-full" />
              ))}
            </div>
          ) : data && data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5">User Identity</th>
                    <th className="px-4 py-3.5">Organizations &amp; Roles</th>
                    <th className="px-4 py-3.5">Assigned Branches</th>
                    <th className="px-4 py-3.5">Security Badges</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {data.results.map((user) => {
                    const isSelf = currentAdmin?.id === user.id;
                    const isSuper = user.is_staff && user.is_superuser;

                    return (
                      <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* User Identity */}
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-xs">
                              {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900">{user.full_name || "Unnamed"}</span>
                                {isSelf && (
                                  <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-semibold border border-indigo-200">
                                    You
                                  </span>
                                )}
                                {isSuper && (
                                  <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded font-semibold border border-purple-200">
                                    Admin
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-500 font-mono text-[11px] mt-0.5">{user.email}</div>
                              {user.phone_number && (
                                <div className="text-slate-400 text-[10px]">{user.phone_number}</div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Organizations & Roles */}
                        <td className="px-4 py-4">
                          {user.organizations && user.organizations.length > 0 ? (
                            <div className="space-y-1 max-w-[200px]">
                              {user.organizations.map((m) => (
                                <div key={m.id} className="flex items-center gap-1.5">
                                  <span className="font-medium text-slate-800 truncate">{m.name}</span>
                                  <span className="text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                                    {m.role}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No org assignment</span>
                          )}
                        </td>

                        {/* Assigned Branches */}
                        <td className="px-4 py-4">
                          {user.stores && user.stores.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {user.stores.map((s) => (
                                <span
                                  key={s.id}
                                  className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] rounded font-mono"
                                  title={`${s.name} (${s.code})`}
                                >
                                  {s.code}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">All branches</span>
                          )}
                        </td>

                        {/* Security Badges */}
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-1 text-[10px]">
                            {user.is_email_verified ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Verified Email</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Unverified Email</span>
                              </span>
                            )}

                            {user.must_change_password && (
                              <span className="inline-flex items-center gap-1 text-indigo-700 font-medium">
                                <KeyRound className="w-3 h-3" />
                                <span>Password Reset Req.</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          {user.is_active ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              <span>Suspended</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            {/* Inspect */}
                            <button
                              onClick={() => handleInspect(user)}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Inspect User Profile"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Temporary Password */}
                            <button
                              onClick={() => {
                                setTempPassModalUser(user);
                                setTempPassReason("");
                                setGeneratedTempPass(null);
                                setTempPassError(null);
                              }}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Issue Temporary Password"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>

                            {/* Revoke Sessions */}
                            <button
                              onClick={() => {
                                setRevokeModalUser(user);
                                setRevokeReason("");
                                setRevokeError(null);
                              }}
                              className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Revoke Active Sessions"
                            >
                              <LogOut className="w-4 h-4" />
                            </button>

                            {/* Suspend / Activate (Protected against self or other platform admin) */}
                            {user.is_active ? (
                              <button
                                onClick={() => {
                                  setStatusModalUser(user);
                                  setStatusReason("");
                                  setStatusError(null);
                                }}
                                disabled={isSelf || isSuper}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-[11px] border border-rose-200 disabled:opacity-40 disabled:hover:bg-rose-50 transition-colors"
                                title={
                                  isSelf
                                    ? "Cannot suspend your own account"
                                    : isSuper
                                    ? "Cannot suspend platform administrator"
                                    : "Suspend User"
                                }
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setStatusModalUser(user);
                                  setStatusReason("");
                                  setStatusError(null);
                                }}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-lg text-[11px] border border-emerald-200 transition-colors"
                              >
                                Activate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <Users className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <h4 className="text-sm font-bold text-slate-800">No users found</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No accounts match your current search and filter criteria.
              </p>
            </div>
          )}

          {/* Pagination */}
          {data && totalPages > 1 && (
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={!data.previous || currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-medium shadow-sm transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <span className="text-slate-500 font-medium">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={!data.next || currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-medium shadow-sm transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================== */}
      {/* 1. USER DETAIL INSPECTION MODAL */}
      {/* ========================================== */}
      {inspectUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">User Profile Audit</h3>
              </div>
              <button
                onClick={() => setInspectUser(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Identity Header */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block font-medium">Full Name</span>
                  <span className="text-slate-900 font-bold text-sm">{inspectUser.full_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Email</span>
                  <span className="text-slate-900 font-semibold truncate block">{inspectUser.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Phone</span>
                  <span className="text-slate-800 font-medium">{inspectUser.phone_number || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Account Status</span>
                  <span className={`font-bold ${inspectUser.is_active ? "text-emerald-700" : "text-rose-600"}`}>
                    {inspectUser.is_active ? "Active" : "Suspended"}
                  </span>
                </div>
              </div>

              {/* Security Status */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2">Authentication &amp; Security State</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-500 block">Email Verified</span>
                    <span className={`font-semibold ${inspectUser.is_email_verified ? "text-emerald-700" : "text-amber-600"}`}>
                      {inspectUser.is_email_verified ? "Verified" : "Pending Verification"}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-500 block">Must Change Password</span>
                    <span className={`font-semibold ${inspectUser.must_change_password ? "text-indigo-700" : "text-slate-600"}`}>
                      {inspectUser.must_change_password ? "Required at next login" : "Standard"}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-500 block">Last Login</span>
                    <span className="font-medium text-slate-800">
                      {inspectUser.last_login ? new Date(inspectUser.last_login).toLocaleString() : "Never"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Memberships */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2">Organization Memberships</h4>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                  {inspectUser.organizations && inspectUser.organizations.length > 0 ? (
                    inspectUser.organizations.map((m) => (
                      <div key={m.id} className="p-3 flex items-center justify-between bg-white">
                        <div>
                          <span className="font-bold text-slate-900">{m.name}</span>
                          <span className="font-mono text-[11px] text-slate-400 block">slug: {m.slug}</span>
                        </div>
                        <div className="text-right">
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold uppercase text-[10px]">
                            {m.role}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-slate-400 italic">No organization memberships.</div>
                  )}
                </div>
              </div>

              {/* Stores */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2">Assigned Stores &amp; Branches</h4>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                  {inspectUser.stores && inspectUser.stores.length > 0 ? (
                    inspectUser.stores.map((s) => (
                      <div key={s.id} className="p-3 flex items-center justify-between bg-white">
                        <div>
                          <span className="font-bold text-slate-900">{s.name}</span>
                          <span className="text-slate-400 text-[11px] block">{s.organization_name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-700">{s.code}</span>
                          <span className="text-[10px] text-slate-400 block uppercase">{s.role}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-slate-400 italic">No specific branch restrictions.</div>
                  )}
                </div>
              </div>

              {/* Recent Audit Activity */}
              {inspectUser.audit_activity && inspectUser.audit_activity.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-900 mb-2">Recent Security Events</h4>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                    {inspectUser.audit_activity.map((ev) => (
                      <div key={ev.id} className="p-2.5 flex items-center justify-between bg-white text-[11px]">
                        <div>
                          <span className="font-mono font-semibold text-slate-800">{ev.event_type}</span>
                          <span className="text-slate-400 block">{ev.ip_address || "IP Unknown"}</span>
                        </div>
                        <span className="text-slate-500">{new Date(ev.timestamp).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setInspectUser(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg text-xs"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 2. TEMPORARY PASSWORD MODAL (ONE-TIME DISPLAY) */}
      {/* ========================================== */}
      {tempPassModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Issue Temporary Password</h3>
                    <p className="text-xs text-slate-500">{tempPassModalUser.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setTempPassModalUser(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!generatedTempPass ? (
                <>
                  <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                    <strong>Security Policy:</strong> Generating a temporary password will{" "}
                    <strong>evict all existing active sessions</strong> and flag the account to force a
                    mandatory password change at their very next login.
                  </div>

                  {tempPassError && (
                    <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-800 font-medium">
                      {tempPassError}
                    </div>
                  )}

                  <form onSubmit={handleTempPassSubmit} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Administrative Audit Reason <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={tempPassReason}
                        onChange={(e) => setTempPassReason(e.target.value)}
                        placeholder="Reason (e.g. Account holder locked out, secure onboarding)..."
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        required
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setTempPassModalUser(null)}
                        disabled={tempPassSubmitting}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={tempPassSubmitting || tempPassReason.trim().length < 3}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs shadow-sm shadow-indigo-600/30 disabled:opacity-50"
                      >
                        {tempPassSubmitting ? "Generating..." : "Generate Password"}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                /* ONE-TIME DISPLAY CONTAINER */
                <div className="mt-4 space-y-4">
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed">
                    <strong>Password Generated Successfully!</strong>
                    <p className="mt-1">
                      This password is shown <strong>only once</strong> and is never stored in persistent browser storage. Securely communicate it to the account holder now.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-center relative">
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold block mb-1">
                      One-Time Temporary Password
                    </span>
                    <span className="font-mono text-lg font-bold text-emerald-400 tracking-wider select-all">
                      {generatedTempPass}
                    </span>

                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedTempPass)}
                      className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      {copiedPass ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400">Copied to Clipboard!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy to Clipboard</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Secure wipe on modal close
                        setGeneratedTempPass(null);
                        setTempPassModalUser(null);
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs"
                    >
                      Done &amp; Securely Wipe
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 3. STATUS CHANGE MODAL (SUSPEND / ACTIVATE) */}
      {/* ========================================== */}
      {statusModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      statusModalUser.is_active
                        ? "bg-rose-50 text-rose-600 border border-rose-200"
                        : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                    }`}
                  >
                    {statusModalUser.is_active ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {statusModalUser.is_active ? "Suspend User Account" : "Activate User Account"}
                    </h3>
                    <p className="text-xs text-slate-500">{statusModalUser.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setStatusModalUser(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div
                className={`mt-4 p-3.5 rounded-xl text-xs leading-relaxed ${
                  statusModalUser.is_active
                    ? "bg-rose-50 border border-rose-200 text-rose-800"
                    : "bg-emerald-50 border border-emerald-200 text-emerald-800"
                }`}
              >
                {statusModalUser.is_active ? (
                  <>
                    <strong>Consequence:</strong> Suspending this user immediately{" "}
                    <strong>terminates all active database sessions</strong> for this user and denies all subsequent sign-ins.
                  </>
                ) : (
                  <>Activating will restore login privileges for this account holder.</>
                )}
              </div>

              {statusError && (
                <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-800 font-medium">
                  {statusError}
                </div>
              )}

              <form onSubmit={handleStatusSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Administrative Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="Enter reason for permanent audit trail..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setStatusModalUser(null)}
                    disabled={statusSubmitting}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={statusSubmitting || statusReason.trim().length < 3}
                    className={`px-4 py-2 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm disabled:opacity-50 ${
                      statusModalUser.is_active
                        ? "bg-rose-600 hover:bg-rose-500"
                        : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                  >
                    {statusSubmitting
                      ? "Processing..."
                      : statusModalUser.is_active
                      ? "Confirm Suspension"
                      : "Confirm Activation"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 4. REVOKE SESSIONS MODAL */}
      {/* ========================================== */}
      {revokeModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Revoke Active Sessions</h3>
                    <p className="text-xs text-slate-500">{revokeModalUser.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setRevokeModalUser(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                This will immediately delete all active Django session records tied to this user, forcing all open browsers and devices to sign in again.
              </div>

              {revokeError && (
                <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-800 font-medium">
                  {revokeError}
                </div>
              )}

              <form onSubmit={handleRevokeSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Administrative Reason (Optional)
                  </label>
                  <input
                    type="text"
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="e.g. Device lost, scheduled security rotation..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setRevokeModalUser(null)}
                    disabled={revokeSubmitting}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={revokeSubmitting}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg text-xs shadow-sm shadow-amber-600/30 disabled:opacity-50"
                  >
                    {revokeSubmitting ? "Revoking..." : "Revoke All Sessions"}
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

