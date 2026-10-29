"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, ShieldCheck, ArrowRight } from "lucide-react";

export default function PasswordResetSuccessPage() {
  const router = useRouter();

  return (
    <AuthCard
      headerIcon={
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs">
          <CheckCircle2 className="w-10 h-10 stroke-[2]" />
        </div>
      }
      title="Password Reset Successful"
      subtitle="Your account password has been updated successfully."
      footer={
        <div className="text-xs text-slate-500">
          Need support?{" "}
          <span className="text-[#0F766E] font-medium">
            support@pharmaPro.com
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Security Session Revocation Feedback */}
        <div className="bg-[#F0FDFA] border border-[#CCFBF1] rounded-lg p-3.5 text-left space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F766E]">
            <ShieldCheck className="w-4 h-4" />
            <span>Active Sessions Invalidated</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            All previous active login sessions across all browsers and devices have been terminated. Please sign in with your new password.
          </p>
        </div>

        <div className="pt-2">
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push("/login?resetSuccess=true")}
            rightIcon={<ArrowRight className="w-4 h-4 ml-1" />}
          >
            Sign In with New Password
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
