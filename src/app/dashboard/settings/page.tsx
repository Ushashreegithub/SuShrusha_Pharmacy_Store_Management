"use client";

import React, { useState } from "react";
import {
  Settings,
  Building2,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { updateOrganizationSettingsApi, ApiError } from "@/lib/api";

function OrganizationSettingsContent() {
  const { user, refreshUser } = useDashboard();
  const org = user?.organizations?.[0];

  const [orgName, setOrgName] = useState(org?.name || "");
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isOwner = user?.primary_role === "owner" || org?.is_owner;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    setIsLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const updated = await updateOrganizationSettingsApi({ name: orgName.trim() });
      setSuccessMsg(`Organization name updated to "${updated.name}" successfully.`);
      await refreshUser();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to update organization settings.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardLayout
      title="Organization Settings"
      subtitle="Configure your pharmacy business entity and tenant details."
    >
      <div className="max-w-2xl space-y-6">
        {successMsg && (
          <Alert variant="success" onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </Alert>
        )}
        {errorMsg && (
          <Alert variant="error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 text-[#0F766E] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Business Entity Identity
              </h2>
              <p className="text-xs text-slate-500">
                Tenant root for all branches and inventory records
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Organization / Business Name"
              name="orgName"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={!isOwner}
              leftIcon={<Building2 className="w-4 h-4" />}
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Organization Slug (Immutable Identifier)
              </label>
              <input
                type="text"
                disabled
                value={org?.slug || "org-owner"}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-500 cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Used internally for multi-tenant database isolation. Cannot be altered.
              </p>
            </div>

            <div className="pt-2">
              <span className="text-xs font-semibold text-slate-700 block mb-1">
                Account Owner
              </span>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                <div>
                  <span className="font-semibold">{user?.full_name}</span>
                  <span className="font-mono text-slate-500 block text-[11px]">
                    {user?.email}
                  </span>
                </div>
                <span className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Verified
                </span>
              </div>
            </div>

            {isOwner && (
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isLoading}
                >
                  Save Organization Settings
                </Button>
              </div>
            )}
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function SettingsPage() {
  return (
    <DashboardProvider>
      <OrganizationSettingsContent />
    </DashboardProvider>
  );
}

