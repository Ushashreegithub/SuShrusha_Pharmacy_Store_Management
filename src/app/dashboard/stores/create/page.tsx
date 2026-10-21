"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Store,
  Building2,
  MapPin,
  Phone,
  Mail,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { createStoreApi, ApiError } from "@/lib/api";

function CreateStoreContent() {
  const router = useRouter();
  const { user, refreshStores } = useDashboard();

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    phone: "",
    email: "",
    status: "setup" as "setup" | "active" | "inactive",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isOwner = user?.primary_role === "owner" || user?.organizations?.some((o) => o.is_owner);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) {
      errs.name = "Store / branch name is required";
    } else if (formData.name.trim().length < 2) {
      errs.name = "Store name must be at least 2 characters";
    }

    if (formData.code.trim()) {
      const codeRegex = /^[A-Z0-9\-_]{2,20}$/;
      if (!codeRegex.test(formData.code.trim().toUpperCase())) {
        errs.code = "Code must be 2-20 characters (uppercase letters, numbers, hyphens)";
      }
    }

    if (formData.phone.trim() && !/^[0-9+\s-]{8,15}$/.test(formData.phone.trim())) {
      errs.phone = "Please enter a valid phone number";
    }

    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errs.email = "Please enter a valid store email address";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setIsLoading(true);

    try {
      const newStore = await createStoreApi({
        name: formData.name.trim(),
        code: formData.code.trim() ? formData.code.trim().toUpperCase() : undefined,
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        postal_code: formData.postal_code.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() ? formData.email.trim().toLowerCase() : undefined,
        status: formData.status,
      });

      // Refresh stores in shared context
      await refreshStores();

      // Navigate to details page
      router.push(`/dashboard/stores/${newStore.id}?created=true`);
    } catch (err: any) {
      if (err instanceof ApiError && err.fieldErrors) {
        setErrors(err.fieldErrors);
        setServerError(err.message);
      } else {
        setServerError(err?.message || "Failed to create store branch. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOwner) {
    return (
      <DashboardLayout title="Create Store Branch">
        <div className="bg-white p-6 rounded-2xl border border-rose-200 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <h2 className="text-sm font-bold text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-600">
            Only organization owners are authorized to create new store branches.
          </p>
          <Link href="/dashboard/stores">
            <Button variant="outline" size="sm">
              Return to Stores
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Create Store Branch"
      subtitle="Register a new retail branch or hospital pharmacy location under your organization."
      action={
        <Link href="/dashboard/stores">
          <Button variant="outline" size="sm" className="text-xs">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to Stores
          </Button>
        </Link>
      }
    >
      <div className="max-w-2xl bg-white p-6 sm:p-8 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-6">
        {serverError && (
          <Alert variant="error" onClose={() => setServerError(null)}>
            {serverError}
          </Alert>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Store / Branch Name"
                name="name"
                placeholder="e.g. Sushrusha Pharmacy - City Center"
                required
                value={formData.name}
                onChange={handleChange}
                error={errors.name}
                leftIcon={<Store className="w-4 h-4" />}
              />
            </div>
            <div>
              <Input
                label="Branch Code"
                name="code"
                placeholder="e.g. STR-001 (auto if empty)"
                value={formData.code}
                onChange={handleChange}
                error={errors.code}
                helperText="Unique uppercase identifier"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Street Address
            </label>
            <textarea
              name="address"
              rows={2}
              value={formData.address}
              onChange={handleChange}
              placeholder="e.g. Shop 4 & 5, Medical Square, MG Road"
              className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="City"
              name="city"
              placeholder="e.g. Mumbai"
              value={formData.city}
              onChange={handleChange}
              error={errors.city}
            />
            <Input
              label="State / Province"
              name="state"
              placeholder="e.g. Maharashtra"
              value={formData.state}
              onChange={handleChange}
              error={errors.state}
            />
            <Input
              label="Postal Code"
              name="postal_code"
              placeholder="e.g. 400001"
              value={formData.postal_code}
              onChange={handleChange}
              error={errors.postal_code}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Store Phone Number"
              name="phone"
              type="tel"
              placeholder="e.g. +91 22 87654321"
              value={formData.phone}
              onChange={handleChange}
              error={errors.phone}
              leftIcon={<Phone className="w-4 h-4" />}
            />
            <Input
              label="Store Email (Optional)"
              name="email"
              type="email"
              placeholder="e.g. branch.center@sushrusha.com"
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
              leftIcon={<Mail className="w-4 h-4" />}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Initial Operational Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              <option value="setup">Under Setup (Pre-launch preparation)</option>
              <option value="active">Active (Fully operational immediately)</option>
              <option value="inactive">Inactive</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Stores under setup allow inventory setup and staff onboarding before taking live orders.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Link href="/dashboard/stores">
              <Button type="button" variant="outline" size="md">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
            >
              Save &amp; Create Store Branch
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

export default function CreateStorePage() {
  return (
    <DashboardProvider>
      <CreateStoreContent />
    </DashboardProvider>
  );
}

