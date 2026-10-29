"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { Button } from "@/components/ui/Button";
import { UserCheck, ArrowRight } from "lucide-react";

function InviteSetupContent() {
  return (
    <AuthSplitLayout
      title="Direct Account Access"
      subtitle="Invitation workflows have been retired"
    >
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-[#E2E8F0] shadow-2xs space-y-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 text-[#0F766E] flex items-center justify-center mx-auto">
          <UserCheck className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">
            Direct Account Provisioning Active
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
            PharmaPro has retired employee invitation links. All manager and staff
            accounts are provisioned directly by your business owner with your email
            and initial login credentials.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-left space-y-2">
          <div className="font-semibold text-slate-800">How to sign in:</div>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Obtain your login email and initial password from your store owner.</li>
            <li>Proceed to the PharmaPro sign-in screen.</li>
            <li>Sign in directly to access your authorized pharmacy store branches.</li>
          </ul>
        </div>

        <div className="pt-2">
          <Link href="/login" className="block w-full">
            <Button variant="primary" size="lg" className="w-full flex items-center justify-center gap-2">
              <span>Go to Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </AuthSplitLayout>
  );
}

export default function InviteSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
          Loading...
        </div>
      }
    >
      <InviteSetupContent />
    </Suspense>
  );
}
