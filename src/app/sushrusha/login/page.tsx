"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  ShieldCheck,
  Building2,
  Lock,
  ArrowRight,
  CheckCircle2,
  Users,
  Store,
  ArrowLeft,
} from "lucide-react";
import { SushrushaLogo } from "@/components/sushrusha/SushrushaLogo";
import { loginApi, getCurrentUserApi, ApiError } from "@/lib/api";
import { UserProfile } from "@/types/auth";

function resolvePostLoginPath(user?: UserProfile | null, mustChangePassword?: boolean): string {
  if (mustChangePassword || user?.must_change_password) {
    return "/change-password";
  }
  if (user?.portal_role === "PARTNER_OWNER" || Boolean(user?.active_partner)) {
    return "/sushrusha/partner";
  }
  return "/dashboard";
}

function SushrushaLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";

  // Form State - Starts empty with zero prefilled credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Sync emailParam from URL only if user was redirected from a verified invite/action
  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  // If already authenticated on this host, route by authoritative server role
  useEffect(() => {
    let active = true;
    async function checkExistingSession() {
      try {
        const u = await getCurrentUserApi();
        if (!active || !u) return;
        if (u.portal_role === "PLATFORM_OWNER") return;
        router.replace(resolvePostLoginPath(u, u.must_change_password));
      } catch {
        // Stay on login page
      }
    }
    checkExistingSession();
    return () => {
      active = false;
    };
  }, [router]);

  // Status & Validation State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email.trim()) {
      errs.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = "Please enter a valid email address";
    }

    if (!password) {
      errs.password = "Password is required";
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
      // Authenticate against existing secure Django session API
      const res = await loginApi({
        email: email.trim().toLowerCase(),
        password,
        rememberMe,
      });

      const target = resolvePostLoginPath(res.user, res.must_change_password);
      router.push(target);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setGeneralError(
          err.message || "Invalid credentials. Please verify your email and password."
        );
      } else {
        setGeneralError(err?.message || "An unexpected error occurred during sign in.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8 selection:bg-teal-100 selection:text-teal-900">
      {/* Top Header Bar */}
      <header className="max-w-5xl mx-auto w-full mb-6 flex items-center justify-between">
        <SushrushaLogo size="md" href="/sushrusha" withTagline={true} />
        <Link
          href="/sushrusha"
          className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Homepage</span>
        </Link>
      </header>

      {/* Main Form Split Container */}
      <main className="max-w-5xl mx-auto w-full my-auto">
        <div className="bg-white rounded-2xl shadow-xs border border-[#E2E8F0] overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[540px]">
          {/* Left Branded Panel */}
          <div className="lg:col-span-5 bg-gradient-to-b from-[#F0FDFA] to-teal-50/40 p-6 sm:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#E2E8F0]">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0F766E]/10 text-xs font-semibold text-[#0F766E] mb-5">
                <Store className="w-3.5 h-3.5" />
                <span>Pharmacy Operations Portal</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-[#164E63] leading-snug tracking-tight">
                Sushrusha Pharmacy Store Management
              </h2>

              <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">
                Secure access for authorized pharmacy owners, store managers, pharmacists, and counter billing staff.
              </p>

              {/* Verified Operational Standards */}
              <div className="mt-8 space-y-3.5 text-xs">
                <div className="flex items-start gap-2.5 text-slate-700">
                  <div className="w-5 h-5 rounded bg-[#0F766E]/10 flex items-center justify-center flex-shrink-0 text-[#0F766E] mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 block">Synchronized Multi-Branch Inventory:</span>
                    <span className="text-slate-500">Live batch tracking across all authorized stores and dispensing counters.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-slate-700">
                  <div className="w-5 h-5 rounded bg-[#0F766E]/10 flex items-center justify-center flex-shrink-0 text-[#0F766E] mt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 block">Pharmacist Dispensing Verification:</span>
                    <span className="text-slate-500">Mandatory sign-off on Schedule H and prescription medicines.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-slate-700">
                  <div className="w-5 h-5 rounded bg-[#0F766E]/10 flex items-center justify-center flex-shrink-0 text-[#0F766E] mt-0.5">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 block">Role-Based Access Control:</span>
                    <span className="text-slate-500">Strictly enforced permissions for Owners, Store Managers, and Billing Staff.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-[#E2E8F0] text-[11px] text-slate-400 flex items-center justify-between">
              <span>Encrypted Session</span>
              <span>Product provider: DiracAI Services</span>
            </div>
          </div>

          {/* Right Login Form Panel */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
            <div className="max-w-md mx-auto w-full space-y-4">
              <div className="mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Sign In to Sushrusha Pharmacy
                </h1>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Enter your registered credentials to access your store counter and pharmacy workspace.
                </p>
              </div>

              {/* Error Alert */}
              {generalError && (
                <Alert variant="error">
                  {generalError}
                </Alert>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="Enter your registered email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                  }}
                  error={errors.email}
                  required
                  autoComplete="username"
                />

                <PasswordInput
                  label="Password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
                  }}
                  error={errors.password}
                  required
                  autoComplete="current-password"
                />

                <div className="flex items-center justify-between pt-1">
                  <Checkbox
                    id="sushrusha-remember-me"
                    label="Remember my session"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />

                  <Link
                    href="/forgot-password"
                    className="text-xs font-semibold text-[#0F766E] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full justify-center bg-[#0F766E] hover:bg-[#0D645D] text-white font-bold py-2.5 rounded-xl shadow-xs"
                  isLoading={isLoading}
                >
                  <span>Sign In to Pharmacy Workspace</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </form>

              {/* Security Note */}
              <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
                Staff accounts are provisioned by Store Owners. Contact your pharmacy administrator for access assistance.
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Attribution */}
      <footer className="max-w-5xl mx-auto w-full text-center text-xs text-slate-400 mt-6 select-none">
        <p>
          © {new Date().getFullYear()} <strong>Sushrusha Pharmacy Management</strong>. Product provider:{" "}
          <span className="text-teal-700 font-semibold">DiracAI Services</span>. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

export default function SushrushaLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
          <div className="w-8 h-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SushrushaLoginContent />
    </Suspense>
  );
}
