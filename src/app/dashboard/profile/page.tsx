"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  Calendar,
  KeyRound,
  LogOut,
  Building2,
  Store,
  CheckCircle2,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function ProfileContent() {
  const { user, stores, handleLogout } = useDashboard();
  const [logoutLoading, setLogoutLoading] = useState(false);

  const isOwner = user?.primary_role === "owner" || user?.organizations?.some((o) => o.is_owner);

  return (
    <DashboardLayout
      title="Profile & Security"
      subtitle="View your account credentials, security settings, and authorized store roles."
    >
      <div className="max-w-2xl space-y-6">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-4 pb-5 border-b border-slate-100">
            <div className="w-14 h-14 rounded-2xl bg-[#0F766E] text-white flex items-center justify-center font-bold text-xl uppercase shadow-xs">
              {user?.full_name?.charAt(0) || "U"}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{user?.full_name}</h2>
              <p className="text-xs text-slate-500 font-mono">{user?.email}</p>
              <div className="mt-1">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-[#0F766E] border border-teal-200">
                  {isOwner ? "Organization Owner" : user?.primary_role || "Staff Member"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-slate-400 block text-[11px]">Email Verification</span>
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Verified &amp; Active
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-slate-400 block text-[11px]">Contact Phone</span>
              <span className="font-semibold text-slate-800">
                {user?.phone_number || "None configured"}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-slate-400 block text-[11px]">Organization</span>
              <span className="font-semibold text-slate-800">
                {user?.organizations?.[0]?.name || "Sushrusha Pharmacy Group"}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-slate-400 block text-[11px]">Member Since</span>
              <span className="font-semibold text-slate-800">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Security & Password Reset */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Security &amp; Password</h3>
              <p className="text-xs text-slate-500">
                Update your account password or revoke active sessions
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Need to change or update your account password? Request a password reset
            link to receive a single-use token.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href={`/forgot-password?email=${encodeURIComponent(user?.email || "")}`}
            >
              <Button variant="outline" size="sm" className="text-xs">
                Request Password Reset
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-xs text-rose-600 hover:text-rose-700 hover:border-rose-300"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              Sign Out from this Device
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function ProfilePage() {
  return (
    <DashboardProvider>
      <ProfileContent />
    </DashboardProvider>
  );
}

