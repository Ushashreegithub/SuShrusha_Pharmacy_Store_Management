"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { KeyRound, Mail, ArrowLeft, ShieldCheck, Terminal } from "lucide-react";
import { requestPasswordResetApi, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const isDev = process.env.NODE_ENV !== "production";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your business email");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    setIsLoading(true);

    try {
      await requestPasswordResetApi(email.trim().toLowerCase());
      setSubmitted(true);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to process password reset request. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      headerIcon={
        <div className="w-14 h-14 rounded-xl bg-[#F0FDFA] border border-[#CCFBF1] flex items-center justify-center text-[#0F766E] shadow-xs">
          <KeyRound className="w-7 h-7 stroke-[1.8]" />
        </div>
      }
      title="Forgot Password"
      subtitle={
        submitted
          ? "Check your email or backend console for recovery instructions."
          : "Enter your registered business email and we will send you a password reset link."
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
      {!submitted ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="Registered Business Email"
            type="email"
            name="email"
            placeholder="e.g. owner@diracpharma.com"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            error={error}
            helperText="We will send a secure single-use recovery link valid for 2 hours."
            leftIcon={<Mail className="w-4 h-4" />}
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isLoading}
            >
              Send Password Reset Link
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4 text-left">
          {/* Non-enumerating feedback */}
          <Alert variant="info" title="Request Dispatched">
            If an account matching <strong>{email}</strong> exists in our system, password reset instructions have been generated and dispatched.
          </Alert>

          <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-[#0F766E]" />
              <span>Anti-Enumeration Protection</span>
            </div>
            <p className="text-[11px] text-slate-500">
              For security, DiracPharma never reveals whether an account exists for a submitted email.
            </p>
          </div>

          {/* Local Development Terminal Notice */}
          {isDev && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-slate-500" />
                  Local Development Notice
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-700 font-mono font-medium px-1.5 py-0.5 rounded">
                  Console Backend
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Django console email backend is active. Check your <strong>Django terminal output</strong> to copy the real generated reset link (e.g. <code>/reset-password?token=...</code>).
              </p>
            </div>
          )}

          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              fullWidth
              onClick={() => setSubmitted(false)}
            >
              Request for another email
            </Button>
          </div>
        </div>
      )}
    </AuthCard>
  );
}
