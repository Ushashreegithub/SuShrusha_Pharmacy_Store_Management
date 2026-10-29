"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, ArrowRight, ShieldCheck } from "lucide-react";

function EmailVerifiedSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryEmail = searchParams.get("email");

  const [verifiedEmail, setVerifiedEmail] = useState(queryEmail || "owner@pharmaPro.com");
  const [organization, setOrganization] = useState("PharmaPro Healthcare Pharmacy");

  useEffect(() => {
    let email = queryEmail;
    if (!email && typeof window !== "undefined") {
      email =
        sessionStorage.getItem("pharmaPro_verified_email") ||
        sessionStorage.getItem("sushrusha_verified_email") ||
        sessionStorage.getItem("pharmaPro_pending_email") ||
        sessionStorage.getItem("sushrusha_pending_email") ||
        "owner@pharmaPro.com";
    }
    if (email) {
      setVerifiedEmail(email);
    }

    if (typeof window !== "undefined") {
      const storedOrg =
        sessionStorage.getItem("pharmaPro_pending_org") ||
        sessionStorage.getItem("sushrusha_pending_org");
      if (storedOrg) {
        setOrganization(storedOrg);
      }
    }
  }, [queryEmail]);

  return (
    <AuthCard
      headerIcon={
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs">
          <CheckCircle2 className="w-10 h-10 stroke-[2]" />
        </div>
      }
      title="Email Verified Successfully"
      subtitle="Your corporate email address has been verified. Your pharmacy owner account is now active in PharmaPro."
      footer={
        <div className="text-xs text-slate-500">
          Need to register a different business?{" "}
          <Link href="/" className="text-[#0F766E] font-medium hover:underline">
            Owner Registration
          </Link>
        </div>
      }
    >
      <div className="space-y-4 text-left">
        {/* Summary Box */}
        <div className="bg-[#F0FDFA] border border-[#CCFBF1] rounded-lg p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F766E]">
            <ShieldCheck className="w-4 h-4" />
            <span>Verified Account Status</span>
          </div>
          <div className="text-xs text-slate-600 space-y-1.5 pt-1 border-t border-[#CCFBF1]">
            <div className="flex justify-between">
              <span className="text-slate-500">Verified Email:</span>
              <span className="font-semibold text-[#164E63] break-all">{verifiedEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Account Type:</span>
              <span className="font-medium text-slate-800">Pharmacy Owner</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Organization:</span>
              <span className="font-medium text-slate-800">{organization}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <span className="font-medium text-emerald-700">Active / Email Verified</span>
            </div>
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-800">Next Steps:</p>
          <p>
            Sign in with your verified credentials to access your store management dashboard.
          </p>
        </div>

        <div className="pt-2">
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push(`/login?verified=true&email=${encodeURIComponent(verifiedEmail)}`)}
            rightIcon={<ArrowRight className="w-4 h-4 ml-1" />}
          >
            Proceed to Sign In
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}

export default function EmailVerifiedSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Loading verified status...</div>}>
      <EmailVerifiedSuccessContent />
    </Suspense>
  );
}
