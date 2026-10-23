"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  Calendar,
  KeyRound,
  LogOut,
  Building2,
  Store,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { changePasswordApi, ApiError } from "@/lib/api";

function ProfileContent() {
  const { user, stores, handleLogout } = useDashboard();
  const [logoutLoading, setLogoutLoading] = useState(false);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwGeneralError, setPwGeneralError] = useState<string | null>(null);

  const isOwner = user?.primary_role === "owner" || user?.organizations?.some((o) => o.is_owner);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwSuccess(null);
    setPwGeneralError(null);
    const errs: Record<string, string> = {};

    if (!currentPassword) {
      errs.current_password = "Current password is required";
    }
    if (!newPassword) {
      errs.new_password = "New password is required";
    } else if (newPassword.length < 8) {
      errs.new_password = "New password must be at least 8 characters";
    }
    if (!confirmPassword) {
      errs.confirm_new_password = "Confirmation is required";
    } else if (newPassword !== confirmPassword) {
      errs.confirm_new_password = "New passwords do not match";
    }

    if (Object.keys(errs).length > 0) {
      setPwErrors(errs);
      return;
    }
    setPwErrors({});
    setPwLoading(true);

    try {
      const res = await changePasswordApi({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmPassword,
      });

      setPwSuccess(res.message || "Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      if (err instanceof ApiError && err.fieldErrors) {
        setPwErrors(err.fieldErrors);
      } else {
        setPwGeneralError(err?.message || "Failed to update password. Please check your credentials.");
      }
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <DashboardLayout
      title="Profile & Security"
      subtitle="View your account credentials, security settings, and authorized store roles."
    >
      <div className="max-w-2xl space-y-6">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-4 pb-5 border-b border-slate-100">
            <div className="w-14 h-14 rounded-2xl bg-[#0F766E] text-white flex items-center justify-center font-bold text-xl uppercase shadow-xs">
              {user?.full_name?.charAt(0) || "U"}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{user?.full_name}</h2>
              <p className="text-xs text-slate-500 font-mono">{user?.email}</p>
              <div className="mt-1">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-[#0F766E] border border-teal-200">
                  {isOwner ? "Organization Owner" : user?.primary_role || "Staff Member"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-slate-400 block text-[11px]">Email Verification</span>
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Verified &amp; Active
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-slate-400 block text-[11px]">Contact Phone</span>
              <span className="font-semibold text-slate-800">
                {user?.phone_number || "None configured"}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-slate-400 block text-[11px]">Organization</span>
              <span className="font-semibold text-slate-800">
                {user?.organizations?.[0]?.name || "DiracPharma Group"}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-slate-400 block text-[11px]">Member Since</span>
              <span className="font-semibold text-slate-800">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Security & Change Password Section */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Change Account Password</h3>
              <p className="text-xs text-slate-500">
                Update your login password securely at any time
              </p>
            </div>
          </div>

          {pwSuccess && (
            <Alert variant="success" onClose={() => setPwSuccess(null)}>
              {pwSuccess}
            </Alert>
          )}

          {pwGeneralError && (
            <Alert variant="error" onClose={() => setPwGeneralError(null)}>
              {pwGeneralError}
            </Alert>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <Input
              label="Current Password"
              type="password"
              placeholder="Enter your current password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                if (pwErrors.current_password) setPwErrors((prev) => ({ ...prev, current_password: "" }));
              }}
              error={pwErrors.current_password}
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="New Password"
                type="password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (pwErrors.new_password) setPwErrors((prev) => ({ ...prev, new_password: "" }));
                }}
                error={pwErrors.new_password}
                helperText="Must be strong and distinct"
                required
              />

              <Input
                label="Confirm New Password"
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (pwErrors.confirm_new_password) setPwErrors((prev) => ({ ...prev, confirm_new_password: "" }));
                }}
                error={pwErrors.confirm_new_password}
                required
              />
            </div>

            <div className="pt-2 flex items-center justify-between">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={pwLoading}
                className="text-xs"
              >
                Update Password
              </Button>

              <Link
                href={`/forgot-password?email=${encodeURIComponent(user?.email || "")}`}
                className="text-xs font-semibold text-[#0F766E] hover:underline"
              >
                Forgot Password?
              </Link>
            </div>
          </form>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">Need to exit this session?</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-xs text-rose-600 hover:text-rose-700 hover:border-rose-300"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              Sign Out from this Device
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function ProfilePage() {
  return (
    <DashboardProvider>
      <ProfileContent />
    </DashboardProvider>
  );
}

