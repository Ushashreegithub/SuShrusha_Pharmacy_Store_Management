"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Settings,
  Building2,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Trash2,
  Image as ImageIcon,
  RefreshCw,
  AlertCircle,
  X,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  updateOrganizationSettingsApi,
  uploadOrganizationLogoApi,
  removeOrganizationLogoApi,
  ApiError,
} from "@/lib/api";

function OrganizationSettingsContent() {
  const { user, refreshUser } = useDashboard();
  const org = user?.organizations?.[0];

  const [orgName, setOrgName] = useState(org?.name || "");
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Logo management state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(org?.logo_url || null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isRemovingLogo, setIsRemovingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSuccess, setLogoSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOwner = user?.primary_role === "owner" || org?.is_owner;

  // Sync state if org changes
  useEffect(() => {
    if (org?.name && !orgName) {
      setOrgName(org.name);
    }
    if (org?.logo_url !== undefined && !selectedFile) {
      setLogoPreview(org.logo_url || null);
    }
  }, [org, selectedFile]);

  // Clean up object URL on unmount or file reset
  useEffect(() => {
    return () => {
      if (selectedFile && logoPreview && logoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [selectedFile, logoPreview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setLogoError(null);
    setLogoSuccess(null);

    if (!file) return;

    // Validate size (2MB)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setLogoError(
        `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the 2MB limit. Please choose a smaller file.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate format
    const validTypes = ["image/png", "image/jpeg", "image/webp"];
    const validExts = [".png", ".jpg", ".jpeg", ".webp"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      setLogoError("Unsupported file format. Please upload a PNG, JPG, or WebP image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
  };

  const handleCancelSelectedFile = () => {
    if (selectedFile && logoPreview && logoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(logoPreview);
    }
    setSelectedFile(null);
    setLogoPreview(org?.logo_url || null);
    setLogoError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUploadLogo = async () => {
    if (!selectedFile) return;

    setIsUploadingLogo(true);
    setLogoError(null);
    setLogoSuccess(null);

    try {
      const res = await uploadOrganizationLogoApi(selectedFile);
      setLogoSuccess("Organization logo updated successfully.");
      setSelectedFile(null);
      setLogoPreview(res.logo_url || null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Refresh current user in DashboardContext so the top header branding updates immediately
      await refreshUser();
    } catch (err: any) {
      console.error("Logo upload failed:", err);
      setLogoError(err?.message || "Failed to upload logo image. Please verify the file and retry.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm("Are you sure you want to remove the organization logo? The default organization icon will be displayed instead.")) {
      return;
    }

    setIsRemovingLogo(true);
    setLogoError(null);
    setLogoSuccess(null);

    try {
      await removeOrganizationLogoApi();
      setLogoSuccess("Organization logo removed successfully.");
      setSelectedFile(null);
      setLogoPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refreshUser();
    } catch (err: any) {
      console.error("Logo removal failed:", err);
      setLogoError(err?.message || "Failed to remove organization logo.");
    } finally {
      setIsRemovingLogo(false);
    }
  };

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
      subtitle="Configure your pharmacy business entity, branding identity and tenant details."
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

        {/* Business Entity Identity & Logo Section */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 text-[#0F766E] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Business Entity Identity & Branding
              </h2>
              <p className="text-xs text-slate-500">
                Tenant root for all branches, inventory records, and authenticated dashboard branding
              </p>
            </div>
          </div>

          {/* ================= ORGANIZATION LOGO SECTION ================= */}
          <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-800">
                  Organization Logo
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Displayed in the top navigation header across all authorized store branches
                </p>
              </div>
              <span className="text-[10px] font-mono font-medium text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                PNG, JPG, WebP &bull; Max 2MB
              </span>
            </div>

            {logoSuccess && (
              <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{logoSuccess}</span>
              </div>
            )}

            {logoError && (
              <div className="flex items-center gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{logoError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Logo Preview Box */}
              <div className="w-24 h-24 rounded-2xl border-2 border-slate-200 bg-white p-1.5 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-xs relative group">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Organization Logo"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 gap-1">
                    <Building2 className="w-8 h-8 text-teal-600/70" />
                    <span className="text-[10px] font-medium text-slate-400">No Logo</span>
                  </div>
                )}
                {selectedFile && (
                  <span className="absolute bottom-1 right-1 bg-amber-500 text-white text-[9px] font-bold px-1 rounded shadow-xs">
                    New
                  </span>
                )}
              </div>

              {/* Actions & File Selection */}
              <div className="space-y-2.5 flex-1 text-center sm:text-left">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={!isOwner || isUploadingLogo || isRemovingLogo}
                />

                {isOwner ? (
                  <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                    {!selectedFile ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingLogo || isRemovingLogo}
                          leftIcon={<Upload className="w-3.5 h-3.5 text-[#0F766E]" />}
                        >
                          {org?.logo_url ? "Replace Logo" : "Upload Logo"}
                        </Button>

                        {org?.logo_url && (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={handleRemoveLogo}
                            isLoading={isRemovingLogo}
                            disabled={isUploadingLogo}
                            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                          >
                            Remove Logo
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={handleUploadLogo}
                          isLoading={isUploadingLogo}
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        >
                          Save New Logo
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleCancelSelectedFile}
                          disabled={isUploadingLogo}
                          leftIcon={<X className="w-3.5 h-3.5" />}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Only the organization owner can change or remove the branding logo.
                  </p>
                )}

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {selectedFile ? (
                    <span className="text-[#0F766E] font-medium">
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB). Click &quot;Save New Logo&quot; to apply.
                    </span>
                  ) : (
                    "Square or horizontal transparent PNG, JPG, or WebP recommended. Displays at 32px height in the navigation bar."
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* ================= ORGANIZATION NAME FORM ================= */}
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


