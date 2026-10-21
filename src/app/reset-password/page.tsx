"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { SecurityNotice } from "@/components/auth/SecurityNotice";
import { Lock, ArrowLeft, AlertCircle, RefreshCw } from "lucide-react";
import { confirmPasswordResetApi, ApiError } from "@/lib/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";
  const statusParam = searchParams.get("status");

  // Token & Password fields
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenState, setTokenState] = useState<"valid" | "expired" | "invalid">(
    statusParam === "expired" ? "expired" : statusParam === "invalid" ? "invalid" : "valid"
  );

  // Expired Token State
  if (tokenState === "expired") {
    return (
      <AuthCard
        headerIcon={
          <div className="w-14 h-14 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
            <AlertCircle className="w-7 h-7 stroke-[1.8]" />
          </div>
        }
        title="Reset Link Expired"
        subtitle="This password recovery link has expired (tokens are valid for 2 hours)."
        footer={
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-[#0F766E] font-medium hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Sign In</span>
          </Link>
        }
      >
        <div className="space-y-4 text-left">
          <Alert variant="warning">
            For security, recovery tokens expire after 2 hours. Please request a new link.
          </Alert>

          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push("/forgot-password")}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Request New Reset Link
          </Button>
        </div>
      </AuthCard>
    );
  }

  // Invalid Token State
  if (tokenState === "invalid") {
    return (
      <AuthCard
        headerIcon={
          <div className="w-14 h-14 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
            <AlertCircle className="w-7 h-7 stroke-[1.8]" />
          </div>
        }
        title="Invalid Reset Link"
        subtitle="The password recovery link is invalid, malformed, or has already been used."
        footer={
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-[#0F766E] font-medium hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Sign In</span>
          </Link>
        }
      >
        <div className="space-y-4 text-left">
          <Alert variant="error">
            The security token in your link is unrecognized or has already been used. Please request a fresh reset link.
          </Alert>

          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push("/forgot-password")}
          >
            Go to Forgot Password
          </Button>
        </div>
      </AuthCard>
    );
  }

  const validate = () => {
    const errs: Record<string, string> = {};

    if (!token.trim()) {
      errs.token = "Reset token is required. Follow the link from your email or paste it below.";
    }

    if (!password) {
      errs.password = "New password is required";
    } else if (password.length < 8) {
      errs.password = "Password must be at least 8 characters";
    }

    if (!confirmPassword) {
      errs.confirmPassword = "Confirm password is required";
    } else if (password !== confirmPassword) {
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
      await confirmPasswordResetApi({
        token: token.trim(),
        password,
        confirmPassword,
      });

      router.push("/reset-password/success");
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.message.toLowerCase().includes("expired")) {
          setTokenState("expired");
        } else if (
          err.message.toLowerCase().includes("invalid") ||
          err.message.toLowerCase().includes("already been used")
        ) {
          setTokenState("invalid");
        } else if (err.fieldErrors) {
          setErrors(err.fieldErrors);
          setGeneralError(err.message);
        } else {
          setGeneralError(err.message);
        }
      } else {
        setGeneralError("Failed to reset password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      headerIcon={
        <div className="w-14 h-14 rounded-xl bg-[#F0FDFA] border border-[#CCFBF1] flex items-center justify-center text-[#0F766E] shadow-xs">
          <Lock className="w-7 h-7 stroke-[1.8]" />
        </div>
      }
      title="Create New Password"
      subtitle="Enter a new password for your Sushrusha Pharmacy account."
      footer={
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-[#0F766E] font-medium hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign In</span>
        </Link>
      }
    >
      <div className="space-y-4">
        {/* Security Notice: Session Invalidation */}
        <SecurityNotice type="session-invalidation" />

        {generalError && (
          <Alert variant="error" onClose={() => setGeneralError(null)}>
            {generalError}
          </Alert>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* If token wasn't in URL, allow manual entry */}
          {!tokenFromUrl && (
            <Input
              label="Reset Security Token"
              name="token"
              placeholder="Paste token from console / email"
              required
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (errors.token) setErrors((prev) => ({ ...prev, token: "" }));
              }}
              error={errors.token}
              helperText="Supplied in the recovery link printed in your terminal or email."
            />
          )}

          <div>
            <PasswordInput
              label="New Password"
              name="password"
              placeholder="Enter your new password"
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
            label="Confirm New Password"
            name="confirmPassword"
            placeholder="Re-enter your new password"
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: "" }));
            }}
            error={errors.confirmPassword}
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isLoading}
            >
              Update Password &amp; Invalidate Sessions
            </Button>
          </div>
        </form>
      </div>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Loading reset...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
