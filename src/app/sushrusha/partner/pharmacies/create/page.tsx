"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Store,
  UserCog,
  Plus,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import {
  CredentialsRevealModal,
  RevealedCredentials,
} from "@/components/partner/CredentialsRevealModal";
import { createPartnerPharmacyApi, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface StoreDraft {
  name: string;
  code: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  status: "active" | "setup";
}

export default function CreateCustomerPharmacyPage() {
  const router = useRouter();

  // Organization details
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [gstin, setGstin] = useState("");
  const [notes, setNotes] = useState("");

  // Stores list
  const [includeStores, setIncludeStores] = useState(true);
  const [stores, setStores] = useState<StoreDraft[]>([
    { name: "", code: "", city: "", state: "", address: "", phone: "", status: "active" },
  ]);

  // Primary Manager
  const [includeManager, setIncludeManager] = useState(true);
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [managerPassword, setManagerPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedCredentials | null>(null);

  const addStoreRow = () => {
    setStores((prev) => [
      ...prev,
      { name: "", code: "", city: "", state: "", address: "", phone: "", status: "active" },
    ]);
  };

  const removeStoreRow = (idx: number) => {
    setStores((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateStoreRow = (idx: number, field: keyof StoreDraft, value: string) => {
    setStores((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (name.trim().length < 2) {
      setError("Customer pharmacy organization name must be at least 2 characters.");
      return;
    }

    const preparedStores = includeStores
      ? stores
          .filter((s) => s.name.trim().length > 0)
          .map((s) => ({
            name: s.name.trim(),
            code: s.code.trim() || undefined,
            city: s.city.trim(),
            state: s.state.trim(),
            address: s.address.trim(),
            phone: s.phone.trim(),
            status: s.status,
          }))
      : [];

    if (includeStores && preparedStores.length === 0) {
      setError("Enter at least one store name or uncheck 'Create Initial Stores'.");
      return;
    }

    if (includeManager) {
      if (managerName.trim().length < 2 || !managerEmail.trim()) {
        setError("Enter the primary manager's full name and email address.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await createPartnerPharmacyApi({
        name: name.trim(),
        contact_email: contactEmail.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        postal_code: postalCode.trim() || undefined,
        license_number: licenseNumber.trim() || undefined,
        gstin: gstin.trim() || undefined,
        notes: notes.trim() || undefined,
        stores: preparedStores,
        manager: includeManager
          ? {
              full_name: managerName.trim(),
              email: managerEmail.trim().toLowerCase(),
              phone_number: managerPhone.trim(),
              password: managerPassword.trim() || undefined,
            }
          : null,
      });

      setSuccessMsg(res.message);

      if (res.manager_credentials) {
        setRevealed({
          title: "Customer Pharmacy Provisioned",
          subtitle: "Initial pharmacy, stores, and primary manager credentials are ready.",
          pharmacyName: res.pharmacy.name,
          fullName: res.manager_credentials.full_name,
          email: res.manager_credentials.email,
          temporaryPassword: res.manager_credentials.temporary_password,
        });
      } else {
        setTimeout(() => {
          router.push(`/sushrusha/partner/pharmacies?selected=${res.pharmacy.id}`);
        }, 800);
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to create customer pharmacy.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PartnerLayout
      title="Create Customer Pharmacy"
      subtitle="Provision an isolated pharmacy organization with optional stores and primary manager."
    >
      <CredentialsRevealModal
        credentials={revealed}
        onClose={() => {
          setRevealed(null);
          router.push("/sushrusha/partner/pharmacies");
        }}
      />

      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {successMsg && (
        <div className="mb-4">
          <Alert variant="success">{successMsg}</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
        {/* Section 1: Customer Organization */}
        <section className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-[#0F766E]" />
            <h2 className="text-sm font-bold text-slate-900">1. Customer Pharmacy Organization</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Pharmacy Organization Name *"
              placeholder="e.g. Arogya Medicos Pvt Ltd"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Business Contact Email"
              type="email"
              placeholder="contact@arogyamedicos.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
            <Input
              label="Contact Phone"
              placeholder="+91 9876543210"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
            <Input
              label="Drug License Number (Optional)"
              placeholder="DL-20B/21B-..."
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
            />
            <Input
              label="GSTIN (Optional)"
              placeholder="21ABCDE1234F1Z5"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
            />
            <Input
              label="City"
              placeholder="Bhubaneswar"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <Input
              label="State"
              placeholder="Odisha"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
            <Input
              label="Postal Code"
              placeholder="751001"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
            />
            <div className="sm:col-span-2">
              <Input
                label="Registered Address"
                placeholder="Street, Locality, Landmark"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Onboarding Notes (Partner Governance Only)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Plan notes or onboarding context..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          </div>
        </section>

        {/* Section 2: Initial Store(s) */}
        <section className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-[#0F766E]" />
              <h2 className="text-sm font-bold text-slate-900">2. Initial Store Branches</h2>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeStores}
                onChange={(e) => setIncludeStores(e.target.checked)}
                className="rounded border-slate-300 text-[#0F766E]"
              />
              <span>Create Initial Stores Now</span>
            </label>
          </div>

          {includeStores && (
            <div className="space-y-4">
              {stores.map((st, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Store #{idx + 1}</span>
                    {stores.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStoreRow(idx)}
                        className="text-xs text-rose-600 hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      label="Store Name *"
                      placeholder="Main Pharmacy Branch"
                      value={st.name}
                      onChange={(e) => updateStoreRow(idx, "name", e.target.value)}
                    />
                    <Input
                      label="Store Code (Auto if blank)"
                      placeholder="STR-001"
                      value={st.code}
                      onChange={(e) => updateStoreRow(idx, "code", e.target.value)}
                    />
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Initial Status
                      </label>
                      <select
                        value={st.status}
                        onChange={(e) => updateStoreRow(idx, "status", e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#0F766E]"
                      >
                        <option value="active">Active</option>
                        <option value="setup">Under Setup</option>
                      </select>
                    </div>
                    <Input
                      label="City"
                      placeholder="City"
                      value={st.city}
                      onChange={(e) => updateStoreRow(idx, "city", e.target.value)}
                    />
                    <Input
                      label="Phone"
                      placeholder="Branch Phone"
                      value={st.phone}
                      onChange={(e) => updateStoreRow(idx, "phone", e.target.value)}
                    />
                    <Input
                      label="Address"
                      placeholder="Branch Address"
                      value={st.address}
                      onChange={(e) => updateStoreRow(idx, "address", e.target.value)}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addStoreRow}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Add Another Store Branch
              </button>
            </div>
          )}
        </section>

        {/* Section 3: Primary Customer Manager */}
        <section className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <UserCog className="w-4 h-4 text-[#0F766E]" />
              <h2 className="text-sm font-bold text-slate-900">3. Primary Customer Pharmacy Manager</h2>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeManager}
                onChange={(e) => setIncludeManager(e.target.checked)}
                className="rounded border-slate-300 text-[#0F766E]"
              />
              <span>Create Primary Manager Now</span>
            </label>
          </div>

          {includeManager && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Manager Full Name *"
                placeholder="Dr. Ananya Das"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
              />
              <Input
                label="Manager Login Email *"
                type="email"
                placeholder="manager@arogyamedicos.com"
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
              />
              <Input
                label="Phone Number"
                placeholder="+91 9876543210"
                value={managerPhone}
                onChange={(e) => setManagerPhone(e.target.value)}
              />
              <Input
                label="Temporary Password (Auto-generated if left blank)"
                type="text"
                placeholder="Leave blank for secure random password"
                value={managerPassword}
                onChange={(e) => setManagerPassword(e.target.value)}
              />
            </div>
          )}
        </section>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/sushrusha/partner/pharmacies")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={submitting}
            className="bg-[#0F766E] hover:bg-[#0D645D] flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Provision Customer Pharmacy</span>
          </Button>
        </div>
      </form>
    </PartnerLayout>
  );
}
