"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { SecurityNotice } from "@/components/auth/SecurityNotice";
import {
  Mail,
  RefreshCw,
  ExternalLink,
  ArrowLeft,
  CheckCircle2,
  Terminal,
  Loader2,
} from "lucide-react";
import { verifyEmailApi, resendVerificationApi, ApiError } from "@/lib/api";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tokenParam = searchParams.get("token");
  const emailParam = searchParams.get("email");
  const stateParam = searchParams.get("state");
  const registeredParam = searchParams.get("registered") === "true";

  const [email, setEmail] = useState<string>(() => {
    return emailParam || "owner@pharmaPro.com";
  });
  const [isRegistered, setIsRegistered] = useState(registeredParam);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(stateParam === "resent" ? 50 : 0);
  const [resendSuccess, setResendSuccess] = useState(stateParam === "resent");
  const [resendError, setResendError] = useState<string | null>(null);

  // Real backend token verification state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState("");

  // Resolve email from session storage if not in query
  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    } else if (typeof window !== "undefined") {
      const stored =
        sessionStorage.getItem("pharmaPro_pending_email") ||
        sessionStorage.getItem("sushrusha_pending_email");
      if (stored) {
        setEmail(stored);
        setIsRegistered(true);
      }
    }
  }, [emailParam]);

  // If token is present in the URL (e.g. from the terminal link), verify it with Django
  useEffect(() => {
    if (tokenParam) {
      setIsVerifying(true);
      setVerificationError(null);

      verifyEmailApi(tokenParam)
        .then((res) => {
          if (typeof window !== "undefined") {
            sessionStorage.setItem("pharmaPro_verified_email", res.email);
            sessionStorage.setItem("sushrusha_verified_email", res.email);
          }
          router.push(`/verify-email/success?email=${encodeURIComponent(res.email)}`);
        })
        .catch((err: any) => {
          setVerificationError(
            err?.message || "Invalid or expired verification token."
          );
        })
        .finally(() => {
          setIsVerifying(false);
        });
    }
  }, [tokenParam, router]);

  // Cooldown timer countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    setResendError(null);

    try {
      await resendVerificationApi(email);
      setResendSuccess(true);
      setResendCooldown(60);
    } catch (err: any) {
      setResendError(err?.message || "Failed to dispatch verification email.");
    } finally {
      setIsResending(false);
    }
  };

  const handleOpenEmailApp = () => {
    if (email.includes("@gmail.com")) {
      window.open("https://mail.google.com", "_blank");
    } else if (email.includes("@outlook.com") || email.includes("@hotmail.com")) {
      window.open("https://outlook.live.com", "_blank");
    } else {
      window.location.href = `mailto:${email}`;
    }
  };

  const handleManualVerify = async () => {
    if (!manualToken.trim()) return;

    setIsVerifying(true);
    setVerificationError(null);

    try {
      const res = await verifyEmailApi(manualToken.trim());
      if (typeof window !== "undefined") {
        sessionStorage.setItem("pharmaPro_verified_email", res.email);
        sessionStorage.setItem("sushrusha_verified_email", res.email);
      }
      router.push(`/verify-email/success?email=${encodeURIComponent(res.email)}`);
    } catch (err: any) {
      setVerificationError(
        err?.message || "Verification failed. The token is invalid, expired, or already used."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <AuthCard
      headerIcon={
        <div className="w-14 h-14 rounded-xl bg-[#F0FDFA] border border-[#CCFBF1] flex items-center justify-center text-[#0F766E] shadow-xs">
          <Mail className="w-7 h-7 stroke-[1.8]" />
        </div>
      }
      title="Verify Your Email"
      subtitle={
        isRegistered
          ? "Owner account registered. Please verify your email before accessing store management."
          : "We have dispatched a verification link to your registered email address."
      }
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
        {/* Automatic Token Validation Loader */}
        {isVerifying && (
          <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-3 text-xs text-teal-800">
            <Loader2 className="w-5 h-5 animate-spin text-[#0F766E]" />
            <div>
              <p className="font-semibold">Validating Verification Token...</p>
              <p className="text-[11px] text-teal-700">Connecting to Django backend to activate your account.</p>
            </div>
          </div>
        )}

        {/* Verification Failure Error */}
        {verificationError && (
          <Alert variant="error" onClose={() => setVerificationError(null)} title="Verification Failed">
            {verificationError}
          </Alert>
        )}

        {/* Email Highlight Box */}
        <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg text-center">
          <span className="text-xs text-slate-500 block">Verification Link Dispatched To:</span>
          <span className="text-sm font-semibold text-[#164E63] break-all">{email}</span>
        </div>

        {/* Resend Notifications */}
        {resendSuccess && (
          <Alert
            variant="info"
            onClose={() => setResendSuccess(false)}
            title="Verification Email Dispatched"
          >
            A verification link was generated and dispatched. During local development, check your <strong>Django terminal console output</strong> to access the link.
          </Alert>
        )}

        {resendError && (
          <Alert variant="error" onClose={() => setResendError(null)}>
            {resendError}
          </Alert>
        )}

        <SecurityNotice type="email-verification" />

        {/* Actions */}
        <div className="space-y-2.5 pt-2">
          <Button
            type="button"
            variant="primary"
            size="md"
            fullWidth
            onClick={handleOpenEmailApp}
            rightIcon={<ExternalLink className="w-4 h-4 ml-1" />}
          >
            Open Email App
          </Button>

          <Button
            type="button"
            variant="outline"
            size="md"
            fullWidth
            onClick={handleResend}
            isLoading={isResending}
            disabled={resendCooldown > 0}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />}
          >
            {resendCooldown > 0
              ? `Resend Verification Email (${resendCooldown}s)`
              : "Resend Verification Email"}
          </Button>
        </div>

        {/* Local Development Terminal Token Verifier */}
        <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-left">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              Local Development Verification
            </span>
            <span className="text-[10px] bg-slate-200 text-slate-700 font-mono font-medium px-1.5 py-0.5 rounded">
              Console Backend
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed mb-2.5">
            Django is using the console email backend. You can either <strong>click the verification link printed in your backend terminal</strong> or paste the token below to verify against PostgreSQL:
          </p>

          <div className="space-y-2">
            <Input
              name="token"
              placeholder="Paste verification token here"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              className="text-xs"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              fullWidth
              onClick={handleManualVerify}
              isLoading={isVerifying}
              disabled={!manualToken.trim()}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E]" />}
            >
              Verify Token with Backend &rarr;
            </Button>
          </div>
        </div>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Loading verification...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
