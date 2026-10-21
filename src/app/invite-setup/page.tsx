"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/auth/StatusBadge";
import { SecurityNotice } from "@/components/auth/SecurityNotice";
import { Alert } from "@/components/ui/Alert";
import {
  UserPlus,
  Clock,
  CheckCircle,
  Store,
  AlertTriangle,
  ArrowRight,
  User,
} from "lucide-react";
import { verifyInvitationTokenApi, acceptInvitationApi, ApiError } from "@/lib/api";

function InviteSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token") || "";

  const [status, setStatus] = useState<"valid" | "expired" | "used" | "invalid" | "checking">(
    tokenParam ? "checking" : "invalid"
  );

  // Form State
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeToPolicy, setAgreeToPolicy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Invitation data loaded from backend
  const [inviteData, setInviteData] = useState({
    email: "",
    role: "Pharmacist",
    primaryStore: "Sushrusha Pharmacy",
    storeCode: "STR-001",
    expiresIn: "Expires in 24 hours (Single-use security token)",
  });

  useEffect(() => {
    if (!tokenParam) {
      setStatus("invalid");
      return;
    }

    async function verify() {
      try {
        const res = await verifyInvitationTokenApi(tokenParam);
        setInviteData({
          email: res.email,
          role: res.role_display || res.role,
          primaryStore: res.store_name,
          storeCode: res.store_code,
          expiresIn: `Expires: ${new Date(res.expires_at).toLocaleString()}`,
        });
        setStatus("valid");
      } catch (err: any) {
        if (err instanceof ApiError) {
          const detail = (err.message || "").toLowerCase();
          if (detail.includes("expired")) {
            setStatus("expired");
          } else if (detail.includes("used") || detail.includes("redeemed")) {
            setStatus("used");
          } else {
            setStatus("invalid");
          }
        } else {
          setStatus("invalid");
        }
      }
    }

    verify();
  }, [tokenParam]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) {
      errs.fullName = "Please enter your full name";
    }

    if (!password) {
      errs.password = "Please create a password";
    } else if (password.length < 8) {
      errs.password = "Password must be at least 8 characters";
    }

    if (!confirmPassword) {
      errs.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }

    if (!agreeToPolicy) {
      errs.agreeToPolicy = "You must agree to the employee system usage policy";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;
    setIsLoading(true);

    try {
      await acceptInvitationApi({
        token: tokenParam,
        fullName: fullName.trim(),
        password,
        confirmPassword,
      });

      router.push("/login?activated=true");
    } catch (err: any) {
      setServerError(err?.message || "Failed to complete account setup.");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-600">
          Verifying single-use invitation token...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* STATE 1: VALID INVITATION LINK */}
      {status === "valid" && (
        <AuthCard
          headerIcon={
            <div className="w-14 h-14 rounded-xl bg-[#F0FDFA] border border-[#CCFBF1] flex items-center justify-center text-[#0F766E] shadow-xs">
              <UserPlus className="w-7 h-7 stroke-[1.8]" />
            </div>
          }
          title="Employee Account Setup"
          subtitle="You have been invited to join Sushrusha Pharmacy store operations."
          footer={
            <div className="text-xs text-slate-500">
              Already set up your password?{" "}
              <Link
                href="/login"
                className="text-[#0F766E] font-semibold hover:underline"
              >
                Sign In
              </Link>
            </div>
          }
        >
          <div className="space-y-4">
            {serverError && (
              <Alert variant="error" onClose={() => setServerError(null)}>
                {serverError}
              </Alert>
            )}

            {/* Invitation Details Card */}
            <div className="bg-[#F0FDFA] border border-[#CCFBF1] rounded-lg p-3.5 text-left space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#CCFBF1]">
                <div className="flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span className="font-semibold text-xs text-[#164E63]">
                    {inviteData.primaryStore}
                  </span>
                </div>
                <StatusBadge status="store" label={inviteData.storeCode} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 block">Invited Email:</span>
                  <span className="font-semibold text-slate-800 font-mono text-[11px]">
                    {inviteData.email}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Assigned Role:</span>
                  <span className="font-medium text-[#0F766E] capitalize">
                    {inviteData.role}
                  </span>
                </div>
              </div>

              {/* 24-Hour Expiry Indicator */}
              <div className="pt-1.5 border-t border-[#CCFBF1] flex items-center justify-between text-[11px]">
                <span className="text-slate-600 flex items-center gap-1 font-medium">
                  <Clock className="w-3 h-3 text-amber-600" />
                  {inviteData.expiresIn}
                </span>
                <span className="text-slate-400">Single-use</span>
              </div>
            </div>

            <SecurityNotice type="employee-link" />

            {/* Set Password Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-3.5 pt-1">
              <Input
                label="Your Full Name"
                name="fullName"
                placeholder="e.g. Amit Kumar"
                required
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: "" }));
                }}
                error={errors.fullName}
                leftIcon={<User className="w-4 h-4" />}
              />

              <div>
                <PasswordInput
                  label="Create Your Password"
                  name="password"
                  placeholder="Enter a secure password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
                  }}
                  error={errors.password}
                />
                {password && <PasswordStrengthMeter password={password} />}
              </div>

              <PasswordInput
                label="Confirm Your Password"
                name="confirmPassword"
                placeholder="Re-enter password to confirm"
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: "" }));
                }}
                error={errors.confirmPassword}
              />

              <Checkbox
                name="agreeToPolicy"
                checked={agreeToPolicy}
                onChange={(e) => setAgreeToPolicy(e.target.checked)}
                error={errors.agreeToPolicy}
                label={
                  <span>
                    I confirm my identity as <strong>{inviteData.email}</strong> and agree to follow pharmacy security and data handling policies.
                  </span>
                }
              />

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  isLoading={isLoading}
                >
                  Activate Employee Account
                </Button>
              </div>
            </form>
          </div>
        </AuthCard>
      )}

      {/* STATE 2: EXPIRED INVITATION LINK */}
      {status === "expired" && (
        <AuthCard
          headerIcon={
            <div className="w-14 h-14 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
              <Clock className="w-7 h-7 stroke-[1.8]" />
            </div>
          }
          title="Invitation Link Expired"
          subtitle="This employee onboarding link is no longer valid."
          footer={
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs text-[#0F766E] font-medium hover:underline"
            >
              <span>Back to Sign In</span>
            </Link>
          }
        >
          <div className="space-y-4 text-left">
            <Alert variant="error" title="24-Hour Expiration Enforced">
              For security, Sushrusha Pharmacy invitation links expire 24 hours after issuance.
            </Alert>

            <div className="p-3.5 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs space-y-1.5">
              <h4 className="font-semibold text-slate-800">What to do:</h4>
              <p className="text-slate-600 leading-relaxed">
                Please contact your store administrator or pharmacy owner and request a fresh invitation link.
              </p>
            </div>

            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => router.push("/login")}
            >
              Return to Sign In
            </Button>
          </div>
        </AuthCard>
      )}

      {/* STATE 3: ALREADY USED INVITATION LINK */}
      {status === "used" && (
        <AuthCard
          headerIcon={
            <div className="w-14 h-14 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shadow-xs">
              <CheckCircle className="w-7 h-7 stroke-[1.8]" />
            </div>
          }
          title="Invitation Already Redeemed"
          subtitle="This setup link has already been used to activate an account."
          footer={
            <span className="text-xs text-slate-400">
              Single-use security protection active
            </span>
          }
        >
          <div className="space-y-4 text-left">
            <Alert variant="info" title="Account Already Setup">
              Your password has already been created. You can sign in directly with your email and password.
            </Alert>

            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => router.push("/login")}
              rightIcon={<ArrowRight className="w-4 h-4 ml-1" />}
            >
              Proceed to Sign In
            </Button>
          </div>
        </AuthCard>
      )}

      {/* STATE 4: INVALID INVITATION LINK */}
      {status === "invalid" && (
        <AuthCard
          headerIcon={
            <div className="w-14 h-14 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
              <AlertTriangle className="w-7 h-7 stroke-[1.8]" />
            </div>
          }
          title="Invalid Invitation Link"
          subtitle="The invitation token is missing, unrecognized, or corrupted."
          footer={
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-[#0F766E] font-medium hover:underline"
            >
              <span>Return to Home</span>
            </Link>
          }
        >
          <div className="space-y-4 text-left">
            <Alert variant="warning" title="Link Unrecognized">
              The security token in this URL does not match any active invitation records. Please ensure you copied the entire URL from your email.
            </Alert>

            <Button
              type="button"
              variant="outline"
              size="lg"
              fullWidth
              onClick={() => router.push("/login")}
            >
              Go to Sign In
            </Button>
          </div>
        </AuthCard>
      )}
    </div>
  );
}

export default function InviteSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Loading invitation...</div>}>
      <InviteSetupContent />
    </Suspense>
  );
}
