"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  Clock,
  Building2,
  Mail,
  Phone,
  RefreshCw,
  LogOut,
  CheckCircle2,
  Lock,
  CreditCard,
} from "lucide-react";
import { getCurrentUserApi, logoutApi } from "@/lib/api";
import { UserProfile } from "@/types/auth";

export default function SubscriptionExpiredPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function checkUser() {
      try {
        const u = await getCurrentUserApi();
        if (!mounted) return;
        if (!u) {
          router.replace("/login");
          return;
        }
        // If partner owner, they don't belong here
        if (u.portal_role === "PARTNER_OWNER" || Boolean(u.active_partner)) {
          router.replace("/sushrusha/partner");
          return;
        }
        // If subscription is not expired or is valid, redirect back to dashboard
        const sub = u.active_organization?.subscription;
        if (sub && !sub.is_expired && sub.is_valid) {
          router.replace("/dashboard");
          return;
        }
        setUser(u);
      } catch {
        if (mounted) router.replace("/login");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    checkUser();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleRecheck = async () => {
    setChecking(true);
    try {
      const u = await getCurrentUserApi();
      const sub = u?.active_organization?.subscription;
      if (sub && !sub.is_expired && sub.is_valid) {
        router.replace("/dashboard");
        return;
      }
      setUser(u);
    } catch {
      // Ignore
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logoutApi();
    } catch {
      // Ignore
    } finally {
      router.push("/login");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-500">Checking subscription status...</p>
      </div>
    );
  }

  const orgName = user?.active_organization?.name || "Customer Pharmacy Entity";
  const subInfo = user?.active_organization?.subscription;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 sm:p-6 text-slate-800">
      <div className="max-w-lg w-full bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-center">
        {/* Warning Icon Badge */}
        <div className="w-16 h-16 mx-auto bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center text-rose-600 shadow-xs">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Pharmacy Subscription Expired
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            Operational access for this pharmacy entity has been paused because the subscription period has expired.
          </p>
        </div>

        {/* Pharmacy Details Card */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-2.5 text-xs">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-200/80">
            <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-[#0F766E] shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">{orgName}</p>
              <p className="text-[11px] text-slate-400 truncate">Account: {user?.email}</p>
            </div>
          </div>

          <div className="flex justify-between items-center text-slate-600">
            <span>License Status:</span>
            <span className="font-bold text-rose-600 uppercase tracking-wider text-[11px]">
              {subInfo?.status || "Expired"}
            </span>
          </div>

          {subInfo?.current_period_end && (
            <div className="flex justify-between items-center text-slate-600">
              <span>Expired On:</span>
              <span className="font-semibold text-slate-800">
                {new Date(subInfo.current_period_end).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Data Protection Reassurance */}
        <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-left text-xs text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Your data remains completely safe.</strong> All store inventories, billing records, medicine catalogues, and invoices are safely preserved and will immediately be unlocked once renewed.
          </p>
        </div>

        {/* Partner Support & Renewal Actions */}
        <div className="pt-2 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Contact Janjeevan Partner Support to Renew
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5 justify-center text-xs">
            <Link
              href="/dashboard/subscription"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold rounded-xl transition"
            >
              <CreditCard className="w-4 h-4 text-slate-500" />
              <span>View Subscription & Plan</span>
            </Link>
            <a
              href="mailto:support@sushrusaeclinic.com"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl transition"
            >
              <Mail className="w-4 h-4 text-slate-500" />
              <span>Email Support</span>
            </a>
            <button
              type="button"
              onClick={handleRecheck}
              disabled={checking}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F766E] hover:bg-[#0D645D] text-white font-semibold rounded-xl transition shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
              <span>{checking ? "Verifying..." : "Check Renewal Status"}</span>
            </button>
          </div>
        </div>

        {/* Sign Out */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            PharmaPro Security Protection
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-rose-600 hover:text-rose-700 font-medium inline-flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{signingOut ? "Signing out..." : "Sign Out"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
