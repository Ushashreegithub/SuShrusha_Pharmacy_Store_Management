"use client";

import React, { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { LogOut, Clock, ShieldCheck, ArrowRight } from "lucide-react";
import { logoutApi } from "@/lib/api";

function LogoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const isExpired = reason === "expired";

  useEffect(() => {
    logoutApi().catch(() => {});
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("sushrusha_pending_email");
      sessionStorage.removeItem("sushrusha_pending_org");
      sessionStorage.removeItem("sushrusha_verified_email");
    }
  }, []);

  return (
    <AuthCard
      headerIcon={
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-xs ${
            isExpired
              ? "bg-amber-50 border border-amber-200 text-amber-600"
              : "bg-[#F0FDFA] border border-[#CCFBF1] text-[#0F766E]"
          }`}
        >
          {isExpired ? (
            <Clock className="w-7 h-7 stroke-[1.8]" />
          ) : (
            <LogOut className="w-7 h-7 stroke-[1.8] ml-0.5" />
          )}
        </div>
      }
      title={isExpired ? "Session Expired" : "You Have Been Signed Out"}
      subtitle={
        isExpired
          ? "Your session has expired due to inactivity. Please sign in again to continue."
          : "Your Sushrusha Pharmacy session has been ended and security credentials cleared."
      }
      footer={
        <div className="text-xs text-slate-500">
          For security on shared store terminals, always close your browser tab after signing out.
        </div>
      }
    >
      <div className="space-y-4 text-left">
        {isExpired ? (
          <Alert variant="warning" title="Inactivity Timeout">
            To protect patient prescription data and pharmacy store billing, sessions are automatically terminated after a period of inactivity.
          </Alert>
        ) : (
          <div className="bg-[#F0FDFA] border border-[#CCFBF1] rounded-lg p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-[#0F766E]">
              <ShieldCheck className="w-4 h-4" />
              <span>Session Termination Protocol Executed:</span>
            </div>
            <ul className="space-y-1 text-slate-600 pl-1">
              <li>• Client authentication tokens cleared</li>
              <li>• Server session marked for revocation in Django API</li>
              <li>• Store workspace locked</li>
            </ul>
          </div>
        )}

        <div className="pt-2 space-y-2">
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push("/login")}
            rightIcon={<ArrowRight className="w-4 h-4 ml-1" />}
          >
            Sign In Again
          </Button>

          {/* Test toggle between manual logout and session expired */}
          <div className="pt-1 text-center">
            {isExpired ? (
              <Link
                href="/logout"
                className="text-xs text-slate-500 hover:text-[#0F766E] underline"
              >
                View Standard Logout State
              </Link>
            ) : (
              <Link
                href="/logout?reason=expired"
                className="text-xs text-slate-500 hover:text-[#0F766E] underline"
              >
                Preview Session-Expired State
              </Link>
            )}
          </div>
        </div>
      </div>
    </AuthCard>
  );
}

export default function LogoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Loading logout...</div>}>
      <LogoutContent />
    </Suspense>
  );
}
