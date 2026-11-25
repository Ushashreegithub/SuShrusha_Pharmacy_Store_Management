"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ShieldCheck, Lock, CheckCircle2, ArrowRight } from "lucide-react";
import { SushrushaLogo } from "@/components/sushrusha/SushrushaLogo";
import { changePasswordApi, getCurrentUserApi, ApiError } from "@/lib/api";

export default function SushrushaChangePasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};

    if (!currentPassword) {
      errs.currentPassword = "Current password is required";
    }

    if (!newPassword) {
      errs.newPassword = "New password is required";
    } else if (newPassword.length < 8) {
      errs.newPassword = "Password must be at least 8 characters long";
    } else if (!/[A-Z]/.test(newPassword)) {
      errs.newPassword = "Password must contain at least one uppercase letter";
    } else if (!/[a-z]/.test(newPassword)) {
      errs.newPassword = "Password must contain at least one lowercase letter";
    } else if (!/[0-9]/.test(newPassword)) {
      errs.newPassword = "Password must contain at least one number";
    }

    if (!confirmPassword) {
      errs.confirmPassword = "Confirm password is required";
    } else if (newPassword !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validate()) return;

    setIsLoading(true);

    try {
      await changePasswordApi({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmPassword,
      });

      let destination = "/dashboard";
      try {
        const refreshed = await getCurrentUserApi();
        if (refreshed?.portal_role === "PARTNER_OWNER" || Boolean(refreshed?.active_partner)) {
          destination = "/sushrusha/partner";
        }
      } catch {
        destination = "/dashboard";
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(destination);
      }, 1500);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setGeneralError(err.message || "Failed to update password. Please check your inputs.");
      } else {
        setGeneralError(err?.message || "An unexpected error occurred while updating password.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between py-10 px-4 sm:px-6 lg:px-8 selection:bg-teal-100 selection:text-teal-900">
      {/* Top Header */}
      <header className="max-w-md mx-auto w-full mb-6 flex items-center justify-center">
        <SushrushaLogo size="md" href="/" withTagline={true} />
      </header>

      {/* Main Card */}
      <main className="w-full max-w-md mx-auto my-auto">
        <div className="bg-white rounded-2xl shadow-xs border border-[#E2E8F0] p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-3.5 text-amber-700">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#164E63] tracking-tight">
              Update Temporary Password
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              For security compliance, please choose a permanent personal password to access Sushrusha Pharmacy Portal.
            </p>
          </div>

          {generalError && (
            <Alert variant="error" className="mb-5 text-xs">
              {generalError}
            </Alert>
          )}

          {success ? (
            <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-[#0F766E] mx-auto" />
              <p className="text-xs text-teal-900 font-semibold">
                Password updated successfully!
              </p>
              <p className="text-xs text-teal-700">
                Redirecting you to the portal dashboard...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current / Temporary Password
                </label>
                <PasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  error={errors.currentPassword}
                  disabled={isLoading}
                />
                {errors.currentPassword && (
                  <p className="text-xs text-red-500 mt-1">{errors.currentPassword}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Permanent Password
                </label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 chars, uppercase, lowercase, number"
                  error={errors.newPassword}
                  disabled={isLoading}
                />
                {errors.newPassword && (
                  <p className="text-xs text-red-500 mt-1">{errors.newPassword}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  error={errors.confirmPassword}
                  disabled={isLoading}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>
                )}
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full bg-[#0F766E] hover:bg-[#0D645D] text-xs font-bold py-2.5 flex items-center justify-center gap-1.5"
                  disabled={isLoading}
                >
                  {isLoading ? "Updating Password..." : "Set New Password & Continue"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 mt-8">
        &copy; {new Date().getFullYear()} Sushrusha Pharmacy Management. Secured by DiracAI Services.
      </footer>
    </div>
  );
}
