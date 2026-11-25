"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Building2,
  Upload,
  Trash2,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Mail,
  Phone,
  Globe,
  MapPin,
  ShieldCheck,
  Clock,
  Sparkles,
  RefreshCw,
  ImageIcon,
} from "lucide-react";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import {
  getPartnerOrganizationProfileApi,
  updatePartnerOrganizationProfileApi,
  uploadPartnerLogoApi,
  removePartnerLogoApi,
  ApiError,
} from "@/lib/api";
import { PartnerOrganizationProfile, PartnerUpdateProfilePayload } from "@/types/partner";
import { usePartnerBranding } from "@/context/PartnerContext";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export default function PartnerOrganizationSettingsPage() {
  return (
    <PartnerLayout
      title="Organization Settings"
      subtitle="Manage Sushrusha Partner organization profile, dynamic branding, and legal registration details."
    >
      <OrganizationSettingsContent />
    </PartnerLayout>
  );
}

function OrganizationSettingsContent() {
  const { refreshBranding, updateBrandingState } = usePartnerBranding();

  // Initial & form states
  const [profile, setProfile] = useState<PartnerOrganizationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [gstin, setGstin] = useState("");
  const [drugLicenseNumber, setDrugLicenseNumber] = useState("");

  // Logo file state
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feedback states
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const populateFields = useCallback((data: PartnerOrganizationProfile) => {
    setName(data.name || "");
    setDescription(data.description || "");
    setContactEmail(data.contact_email || "");
    setContactPhone(data.contact_phone || "");
    setWebsite(data.website || "");
    setAddress(data.address || "");
    setCity(data.city || "");
    setStateVal(data.state || "");
    setPostalCode(data.postal_code || "");
    setGstin(data.gstin || "");
    setDrugLicenseNumber(data.drug_license_number || "");
    setSelectedLogoFile(null);
    setLogoPreviewUrl(data.logo_url || null);
    setFieldErrors({});
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await getPartnerOrganizationProfileApi();
      setProfile(data);
      populateFields(data);
    } catch (err: any) {
      setErrorMessage(
        err instanceof ApiError ? err.message : "Failed to load partner organization profile."
      );
    } finally {
      setLoading(false);
    }
  }, [populateFields]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Clean up object preview URL on unmount or file change
  useEffect(() => {
    return () => {
      if (logoPreviewUrl && logoPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  // Handle Logo file select
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setErrorMessage("Invalid logo format. Please upload a PNG, JPG, JPEG, or WEBP image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage(
        `Logo file size exceeds 5MB (${(file.size / (1024 * 1024)).toFixed(2)}MB). Please choose a smaller image.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedLogoFile(file);
    const preview = URL.createObjectURL(file);
    setLogoPreviewUrl(preview);
  };

  // Immediate remove logo action
  const handleRemoveLogo = async () => {
    if (!profile?.logo_url && !selectedLogoFile) return;

    if (selectedLogoFile && !profile?.logo_url) {
      setSelectedLogoFile(null);
      setLogoPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to remove the organization logo? The default Sushrusha branding icon will be restored."
    );
    if (!confirmed) return;

    setRemovingLogo(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await removePartnerLogoApi();
      setSelectedLogoFile(null);
      setLogoPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (profile) {
        setProfile({ ...profile, logo: null, logo_url: null });
      }
      updateBrandingState({ logo_url: null });
      await refreshBranding();
      setSuccessMessage("Organization logo removed successfully. Default branding restored.");
    } catch (err: any) {
      setErrorMessage(
        err instanceof ApiError ? err.message : "Failed to remove organization logo."
      );
    } finally {
      setRemovingLogo(false);
    }
  };

  // Validate form fields before submission
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "Organization name is required.";
    }

    if (contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) {
      errors.contactEmail = "Please enter a valid contact email address.";
    }

    if (gstin.trim() && gstin.trim().length > 15) {
      errors.gstin = "GSTIN must not exceed 15 characters.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save profile changes and upload logo if modified
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload: PartnerUpdateProfilePayload = {
        name: name.trim(),
        description: description.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        website: website.trim(),
        address: address.trim(),
        city: city.trim(),
        state: stateVal.trim(),
        postal_code: postalCode.trim(),
        gstin: gstin.trim().toUpperCase(),
        drug_license_number: drugLicenseNumber.trim(),
      };

      // 1. Update text profile
      const updatedProfile = await updatePartnerOrganizationProfileApi(payload);
      let finalLogoUrl = updatedProfile.logo_url;

      // 2. Upload new logo if selected
      if (selectedLogoFile) {
        setUploadingLogo(true);
        const logoRes = await uploadPartnerLogoApi(selectedLogoFile);
        finalLogoUrl = logoRes.logo_url;
        setSelectedLogoFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }

      setProfile({ ...updatedProfile, logo_url: finalLogoUrl });
      setLogoPreviewUrl(finalLogoUrl);

      // 3. Update global branding state
      updateBrandingState({
        name: updatedProfile.name,
        logo_url: finalLogoUrl,
        website: updatedProfile.website,
        contact_email: updatedProfile.contact_email,
        contact_phone: updatedProfile.contact_phone,
      });

      await refreshBranding();
      setSuccessMessage("Partner organization profile and branding saved successfully.");
    } catch (err: any) {
      setErrorMessage(
        err instanceof ApiError ? err.message : "Failed to update partner organization profile."
      );
    } finally {
      setSaving(false);
      setUploadingLogo(false);
    }
  };

  const handleReset = () => {
    if (profile) {
      populateFields(profile);
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  };

  return (
    <>
      {/* Top action bar */}
      <div className="flex items-center justify-between pb-3 mb-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Organization Governance & Profile</h2>
          <p className="text-xs text-slate-500">Configure public partner identity, dynamic branding, and legal compliance</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={loadProfile}
          disabled={loading || saving}
          className="text-xs flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Alert Banners */}
      {successMessage && (
        <div className="mb-5">
          <Alert variant="success">{successMessage}</Alert>
        </div>
      )}
      {errorMessage && (
        <div className="mb-5">
          <Alert variant="error">{errorMessage}</Alert>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center shadow-xs">
          <div className="w-10 h-10 border-4 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">
            Loading organization settings...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Top Info Banner */}
          <div className="bg-gradient-to-r from-teal-900 to-[#0F292E] text-white rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-800/80 border border-teal-700/60 flex items-center justify-center shrink-0">
                {logoPreviewUrl ? (
                  <img
                    src={logoPreviewUrl}
                    alt="Organization Brand"
                    className="w-10 h-10 object-contain rounded"
                  />
                ) : (
                  <Building2 className="w-6 h-6 text-teal-200" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold truncate">
                    {name || profile?.name || "Janjeevan Org Pvt. Ltd"}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-200 border border-teal-400/30 text-[10px] font-semibold tracking-wider uppercase">
                    Partner Entity
                  </span>
                </div>
                <p className="text-xs text-teal-200/80 mt-0.5 font-mono truncate">
                  Slug: {profile?.slug} · ID: {profile?.id}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-teal-200/90 shrink-0">
              <Clock className="w-3.5 h-3.5 text-teal-300" />
              <span>
                Last updated:{" "}
                {profile?.updated_at
                  ? new Date(profile.updated_at).toLocaleString()
                  : "Never"}
              </span>
            </div>
          </div>

          {/* Section 1: Organization Branding & Logo */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Branding & Organization Logo
                  </h3>
                  <p className="text-xs text-slate-500">
                    Your logo is dynamically displayed in the sidebar, mobile header, and browser tab.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Preview Cards */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Logo Live Preview
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Dark Background (Sidebar context) */}
                  <div className="bg-[#0F292E] p-4 rounded-xl border border-teal-950 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-medium text-teal-300/80 mb-2">
                      Sidebar Header
                    </span>
                    <div className="w-16 h-16 rounded-lg bg-[#0F766E]/40 border border-teal-700/50 flex items-center justify-center overflow-hidden">
                      {logoPreviewUrl ? (
                        <img
                          src={logoPreviewUrl}
                          alt="Dark theme preview"
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <Building2 className="w-8 h-8 text-teal-200" />
                      )}
                    </div>
                  </div>

                  {/* Light Background (Invoice/Doc context) */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-medium text-slate-500 mb-2">
                      Light Surface
                    </span>
                    <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-2xs">
                      {logoPreviewUrl ? (
                        <img
                          src={logoPreviewUrl}
                          alt="Light theme preview"
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <Building2 className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {selectedLogoFile && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 shrink-0 text-amber-600" />
                    <span className="truncate">
                      Pending upload: <strong>{selectedLogoFile.name}</strong> (
                      {(selectedLogoFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                )}
              </div>

              {/* Upload Controls & Actions */}
              <div className="lg:col-span-2 space-y-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLogoFileChange}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  id="partner-logo-input"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-[#0F766E] bg-slate-50/60 hover:bg-teal-50/20 rounded-xl p-6 text-center cursor-pointer transition-colors"
                >
                  <Upload className="w-8 h-8 mx-auto text-slate-400 group-hover:text-[#0F766E] mb-2" />
                  <p className="text-xs font-semibold text-slate-800">
                    Click to browse or replace logo
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Supports PNG, JPG, JPEG, and WEBP. Maximum file size: 5 MB.
                  </p>
                  <p className="text-[10px] text-teal-700 font-medium mt-1">
                    Tip: Transparent PNG or SVG-style WEBP with at least 256×256px looks best.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Choose Image</span>
                  </Button>

                  {(profile?.logo_url || selectedLogoFile) && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={handleRemoveLogo}
                      disabled={removingLogo || saving}
                      className="text-xs flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{removingLogo ? "Removing..." : "Remove Logo"}</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: General Profile Information */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Organization Profile
                  </h3>
                  <p className="text-xs text-slate-500">
                    Primary partner identity and organization overview.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Organization Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: "" });
                  }}
                  placeholder="e.g., Sushrusha E-Clinic Pvt. Ltd."
                  className={`w-full px-3.5 py-2 text-sm rounded-xl border ${
                    fieldErrors.name
                      ? "border-rose-400 focus:ring-rose-200"
                      : "border-slate-300 focus:border-[#0F766E] focus:ring-teal-100"
                  } focus:outline-hidden focus:ring-2 transition`}
                />
                {fieldErrors.name && (
                  <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.name}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / About Organization
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Provide an overview of your healthcare & pharmacy network, services, or regional coverage..."
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:border-[#0F766E] focus:outline-hidden focus:ring-2 focus:ring-teal-100 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Partner Identifier Slug
                </label>
                <input
                  type="text"
                  value={profile?.slug || ""}
                  disabled
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed font-mono text-xs"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  System slug immutable for DNS host routing stability.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status
                </label>
                <div className="flex items-center gap-2 h-10 px-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Active Partner Organization</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Contact Information */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Contact Information
                  </h3>
                  <p className="text-xs text-slate-500">
                    Official email, phone, and website for customer communications.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => {
                      setContactEmail(e.target.value);
                      if (fieldErrors.contactEmail)
                        setFieldErrors({ ...fieldErrors, contactEmail: "" });
                    }}
                    placeholder="partner@sushrusaeclinic.com"
                    className={`w-full pl-9 pr-3 py-2 text-sm rounded-xl border ${
                      fieldErrors.contactEmail
                        ? "border-rose-400 focus:ring-rose-200"
                        : "border-slate-300 focus:border-[#0F766E] focus:ring-teal-100"
                    } focus:outline-hidden focus:ring-2 transition`}
                  />
                </div>
                {fieldErrors.contactEmail && (
                  <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.contactEmail}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Phone
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:border-[#0F766E] focus:outline-hidden focus:ring-2 focus:ring-teal-100 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Website URL
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://sushrusaeclinic.com"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:border-[#0F766E] focus:outline-hidden focus:ring-2 focus:ring-teal-100 transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Business Registration & Compliance */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Business Registration & Compliance
                  </h3>
                  <p className="text-xs text-slate-500">
                    Registered office address, GSTIN, and statutory pharmacy licenses.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Registered Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Plot / Flat / Street address"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:border-[#0F766E] focus:outline-hidden focus:ring-2 focus:ring-teal-100 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g., Bhubaneswar"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:border-[#0F766E] focus:outline-hidden focus:ring-2 focus:ring-teal-100 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  State / Province
                </label>
                <input
                  type="text"
                  value={stateVal}
                  onChange={(e) => setStateVal(e.target.value)}
                  placeholder="e.g., Odisha"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:border-[#0F766E] focus:outline-hidden focus:ring-2 focus:ring-teal-100 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="e.g., 751001"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:border-[#0F766E] focus:outline-hidden focus:ring-2 focus:ring-teal-100 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  GSTIN
                </label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => {
                    setGstin(e.target.value.toUpperCase());
                    if (fieldErrors.gstin) setFieldErrors({ ...fieldErrors, gstin: "" });
                  }}
                  maxLength={15}
                  placeholder="e.g., 21AAAAA0000A1Z5"
                  className={`w-full px-3.5 py-2 text-sm uppercase font-mono rounded-xl border ${
                    fieldErrors.gstin
                      ? "border-rose-400 focus:ring-rose-200"
                      : "border-slate-300 focus:border-[#0F766E] focus:ring-teal-100"
                  } focus:outline-hidden focus:ring-2 transition`}
                />
                {fieldErrors.gstin && (
                  <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.gstin}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Drug Licence Number
                </label>
                <input
                  type="text"
                  value={drugLicenseNumber}
                  onChange={(e) => setDrugLicenseNumber(e.target.value)}
                  placeholder="e.g., DL-20B-123456 / 21B-123456"
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-300 focus:border-[#0F766E] focus:outline-hidden focus:ring-2 focus:ring-teal-100 transition"
                />
              </div>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 pb-8">
            <p className="text-xs text-slate-500">
              Changes to Organization Name and Logo reflect immediately across the Partner Portal.
            </p>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleReset}
                disabled={saving || uploadingLogo}
                className="w-full sm:w-auto text-xs flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cancel Changes</span>
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={saving || uploadingLogo}
                className="w-full sm:w-auto text-xs bg-[#0F766E] hover:bg-[#0D645D] flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {saving || uploadingLogo ? "Saving Organization Profile..." : "Save Changes"}
                </span>
              </Button>
            </div>
          </div>
        </form>
      )}
    </>
  );
}
