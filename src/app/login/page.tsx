"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Mail, ShieldCheck } from "lucide-react";
import { loginApi, getCurrentUserApi, ApiError } from "@/lib/api";
import { UserProfile } from "@/types/auth";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registeredNotice = searchParams.get("registered") === "true";
  const verifiedNotice = searchParams.get("verified") === "true";
  const resetSuccessNotice = searchParams.get("resetSuccess") === "true";
  const activatedNotice = searchParams.get("activated") === "true";
  const emailParam = searchParams.get("email") || "";

  // Form State
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Sync emailParam from URL if present
  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  // If already authenticated, redirect according to role
  useEffect(() => {
    let isMounted = true;
    async function checkAuth() {
      try {
        const u = await getCurrentUserApi();
        if (!isMounted || !u) return;

        if (u.must_change_password) {
          router.replace("/sushrusha/change-password");
          return;
        }

        const isPlatformOwner = Boolean(
          u.is_platform_admin || (u.is_staff && u.is_superuser)
        );
        const isPartnerOwner =
          u.portal_role === "PARTNER_OWNER" || Boolean(u.active_partner);

        const nextParam = searchParams.get("next");

        if (isPlatformOwner) {
          if (nextParam && nextParam.startsWith("/platform") && !nextParam.startsWith("//")) {
            router.replace(nextParam);
          } else {
            router.replace("/platform");
          }
        } else if (isPartnerOwner) {
          if (nextParam && nextParam.startsWith("/sushrusha/partner") && !nextParam.startsWith("//")) {
            router.replace(nextParam);
          } else {
            router.replace("/sushrusha/partner");
          }
        } else {
          if (
            nextParam &&
            !nextParam.startsWith("/platform") &&
            !nextParam.startsWith("/sushrusha/partner") &&
            nextParam.startsWith("/") &&
            !nextParam.startsWith("//")
          ) {
            router.replace(nextParam);
          } else {
            router.replace("/dashboard");
          }
        }
      } catch {
        // Stay on login page
      }
    }

    checkAuth();
    return () => {
      isMounted = false;
    };
  }, [router, searchParams]);

  // Status & Validation State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<UserProfile | null>(null);

  // Development Quick-Fill Utility
  const isDev = process.env.NODE_ENV !== "production";
  const handleDevPreset = (type: "owner" | "platform_owner" | "partner_owner" | "invalid") => {
    setGeneralError(null);
    setErrors({});
    setLoginSuccess(false);

    if (type === "owner") {
      setEmail("dr.rajesh@sushrusha.com");
      setPassword("StrongPassword@2026");
    } else if (type === "platform_owner") {
      setEmail("admin@diracpharma.com");
      setPassword("PlatformSuperPass@2026");
    } else if (type === "partner_owner") {
      setEmail("janjeevangeneric@gmail.com");
      setPassword("PartnerOwner@2026!");
    } else if (type === "invalid") {
      setEmail("unknown.user@sushrusha.com");
      setPassword("WrongPassword123");
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email.trim()) {
      errs.email = "Business email is required";
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
    setLoginSuccess(false);

    if (!validate()) return;

    setIsLoading(true);

    try {
      const res = await loginApi({
        email: email.trim().toLowerCase(),
        password,
        rememberMe,
      });

      setLoginSuccess(true);
      setAuthenticatedUser(res.user);

      const nextParam = searchParams.get("next");
      const isPlatformOwner = Boolean(
        res.user?.is_platform_admin || (res.user?.is_staff && res.user?.is_superuser)
      );
      const isPartnerOwner =
        res.user?.portal_role === "PARTNER_OWNER" || Boolean(res.user?.active_partner);

      if (res.must_change_password || res.user?.must_change_password) {
        router.push("/sushrusha/change-password");
      } else if (isPlatformOwner) {
        if (nextParam && nextParam.startsWith("/platform") && !nextParam.startsWith("//")) {
          router.push(nextParam);
        } else {
          router.push("/platform");
        }
      } else if (isPartnerOwner) {
        if (nextParam && nextParam.startsWith("/sushrusha/partner") && !nextParam.startsWith("//")) {
          router.push(nextParam);
        } else {
          router.push("/sushrusha/partner");
        }
      } else {
        if (
          nextParam &&
          !nextParam.startsWith("/platform") &&
          !nextParam.startsWith("/sushrusha/partner") &&
          nextParam.startsWith("/") &&
          !nextParam.startsWith("//")
        ) {
          router.push(nextParam);
        } else {
          router.push("/dashboard");
        }
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setGeneralError(
          err.message || "Invalid email or password. Please verify your credentials and try again."
        );
      } else {
        setGeneralError(err?.message || "An unexpected error occurred during sign in.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout
      title="Sign In to Your Account"
      subtitle="Access your PharmaPro store dashboard and multi-branch operations."
    >
      <div className="space-y-4">
        {/* Development-Only Sample Presets (Gated for development only) */}
        {isDev && (
          <div className="p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Development Quick-Fill:</span>
              <span className="text-[10px] bg-slate-200 text-slate-700 font-mono font-medium px-1.5 py-0.5 rounded">
                Local Dev Only
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => handleDevPreset("owner")}
                className="px-2 py-0.5 bg-white border border-[#E2E8F0] hover:border-teal-400 hover:bg-teal-50/50 rounded text-[11px] font-medium text-slate-700 transition-colors"
              >
                Sample Owner
              </button>
              <button
                type="button"
                onClick={() => handleDevPreset("platform_owner")}
                className="px-2 py-0.5 bg-white border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50 rounded text-[11px] font-medium text-indigo-700 transition-colors"
              >
                Platform Owner
              </button>
              <button
                type="button"
                onClick={() => handleDevPreset("partner_owner")}
                className="px-2 py-0.5 bg-white border border-purple-200 hover:border-purple-400 hover:bg-purple-50/50 rounded text-[11px] font-medium text-purple-700 transition-colors"
              >
                Partner Owner
              </button>
              <button
                type="button"
                onClick={() => handleDevPreset("invalid")}
                className="px-2 py-0.5 bg-white border border-rose-300 hover:bg-rose-50 rounded text-[11px] font-medium text-rose-700 transition-colors"
              >
                Invalid Credentials
              </button>
            </div>
          </div>
        )}

        {/* Incoming notifications */}
        {registeredNotice && (
          <Alert variant="success">
            <strong>Registration successful!</strong> Your pharmacy owner account is ready. Please sign in to access your dashboard.
          </Alert>
        )}

        {verifiedNotice && (
          <Alert variant="success">
            <strong>Email verified!</strong> Please sign in with your credentials.
          </Alert>
        )}

        {resetSuccessNotice && (
          <Alert variant="success">
            <strong>Password reset complete.</strong> Please sign in with your new password.
          </Alert>
        )}

        {activatedNotice && (
          <Alert variant="success">
            <strong>Account activated!</strong> You can now sign in with your new employee password.
          </Alert>
        )}

        {/* Successful real sign-in notice */}
        {loginSuccess && authenticatedUser && (
          <Alert variant="success" title="Authentication Successful">
            <div className="space-y-1.5">
              <p>
                Signed in as <strong>{authenticatedUser.email}</strong> ({authenticatedUser.full_name}).
              </p>
              {authenticatedUser.organizations && authenticatedUser.organizations.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Organization: {authenticatedUser.organizations[0].name} (Owner)</span>
                </div>
              )}
              <p className="text-[11px] text-emerald-700 pt-1">
                Session established securely via HttpOnly cookies. In Phase 4, you will proceed directly to the Owner Dashboard.
              </p>
            </div>
          </Alert>
        )}

        {/* General Error Banner */}
        {generalError && (
          <Alert
            variant="error"
            onClose={() => setGeneralError(null)}
          >
            <p>{generalError}</p>
          </Alert>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
          <Input
            label="Business Email"
            type="email"
            name="email"
            placeholder="e.g. owner@PharmaPro.com"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
            }}
            error={errors.email}
            leftIcon={<Mail className="w-4 h-4" />}
          />

          <div>
            <PasswordInput
              label="Password"
              name="password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
              }}
              error={errors.password}
            />

            <div className="flex items-center justify-between mt-2 text-xs">
              <Checkbox
                name="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                label="Remember this device"
              />
              <Link
                href="/forgot-password"
                className="font-medium text-[#0F766E] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
          >
            Sign In
          </Button>
        </form>

        <div className="pt-3 border-t border-[#E2E8F0] text-center space-y-2">
          <p className="text-xs text-slate-600">
            New pharmacy owner?{" "}
            <Link
              href="/"
              className="text-[#0F766E] font-semibold hover:underline"
            >
              Register your business organization
            </Link>
          </p>

          <p className="text-[11px] text-slate-400">
            Pharmacy staff &amp; managers: Sign in directly using credentials provided by your store owner.
          </p>
        </div>
      </div>
    </AuthSplitLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Loading sign-in...</div>}>
      <LoginContent />
    </Suspense>
  );
}
