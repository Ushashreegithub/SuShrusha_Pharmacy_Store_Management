"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Mail, ArrowLeft, KeyRound, CheckCircle2 } from "lucide-react";
import { SushrushaLogo } from "@/components/sushrusha/SushrushaLogo";
import { requestPasswordResetApi, ApiError } from "@/lib/api";

export default function SushrushaForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your registered staff email address");
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
        setError("Failed to process password reset request. Please verify your email and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between py-10 px-4 sm:px-6 lg:px-8 selection:bg-teal-100 selection:text-teal-900">
      {/* Top Header */}
      <header className="max-w-md mx-auto w-full mb-6 flex items-center justify-between">
        <SushrushaLogo size="md" href="/" withTagline={true} />
        <Link
          href="/login"
          className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign In</span>
        </Link>
      </header>

      {/* Main Card */}
      <main className="w-full max-w-md mx-auto my-auto">
        <div className="bg-white rounded-2xl shadow-xs border border-[#E2E8F0] p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center mx-auto mb-3.5 text-[#0F766E]">
              <KeyRound className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#164E63] tracking-tight">
              Reset Portal Password
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Enter your verified staff email and we will dispatch a secure single-use password reset link.
            </p>
          </div>

          {error && (
            <Alert variant="error" className="mb-5 text-xs">
              {error}
            </Alert>
          )}

          {submitted ? (
            <div className="space-y-5 text-center">
              <div className="p-4 rounded-xl bg-teal-50/60 border border-teal-200 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-7 h-7 text-[#0F766E]" />
                <p className="text-xs text-teal-900 leading-relaxed font-medium">
                  If an active staff account is registered with <strong>{email}</strong>, a secure password reset link has been dispatched to your inbox.
                </p>
              </div>
              <p className="text-xs text-slate-500">
                The link expires in 1 hour. Please check your spam folder if you do not see it shortly.
              </p>
              <div className="pt-2">
                <Link href="/login">
                  <Button variant="primary" className="w-full bg-[#0F766E] hover:bg-[#0D645D] text-xs font-bold py-2.5">
                    Return to Staff Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Registered Staff Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pharmacist@sushrusha.com"
                leftIcon={<Mail className="w-4 h-4 text-slate-400" />}
                autoComplete="email"
                disabled={isLoading}
              />

              <Button
                type="submit"
                variant="primary"
                className="w-full bg-[#0F766E] hover:bg-[#0D645D] text-xs font-bold py-2.5 shadow-2xs mt-2"
                isLoading={isLoading}
              >
                Send Password Reset Link
              </Button>

              <div className="text-center pt-3 border-t border-slate-100">
                <Link
                  href="/login"
                  className="text-xs font-medium text-[#0F766E] hover:text-[#0D645D] hover:underline transition"
                >
                  Remembered your password? Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 mt-6">
        <p>&copy; {new Date().getFullYear()} Sushrusha Pharmacy. All rights reserved.</p>
      </footer>
    </div>
  );
}

