"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Store,
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
import { getStoreDetailApi, updateStoreApi, ApiError } from "@/lib/api";

function EditStoreContent() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.id as string;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOwner = user?.primary_role === "owner" || user?.organizations?.some((o) => o.is_owner);

  useEffect(() => {
    let isMounted = true;
    async function loadStore() {
      setIsLoading(true);
      setServerError(null);
      try {
        const store = await getStoreDetailApi(storeId);
        if (!isMounted) return;
        setFormData({
          name: store.name || "",
          code: store.code || "",
          address: store.address || "",
          city: store.city || "",
          state: store.state || "",
          postal_code: store.postal_code || "",
          phone: store.phone || "",
          email: store.email || "",
          status: store.status || "setup",
        });
      } catch (err: any) {
        if (isMounted) setServerError(err?.message || "Failed to load store branch.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadStore();
    return () => {
      isMounted = false;
    };
  }, [storeId]);

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
      errs.email = "Please enter a valid email address";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;
    setIsSubmitting(true);

    try {
      await updateStoreApi(storeId, {
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

      await refreshStores();
      router.push(`/dashboard/stores/${storeId}?updated=true`);
    } catch (err: any) {
      if (err instanceof ApiError && err.fieldErrors) {
        setErrors(err.fieldErrors);
        setServerError(err.message);
      } else {
        setServerError(err?.message || "Failed to update store branch.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      title={`Edit ${formData.name || "Store Branch"}`}
      subtitle={`Branch Code: ${formData.code || "—"}`}
      action={
        <Link href={`/dashboard/stores/${storeId}`}>
          <Button variant="outline" size="sm" className="text-xs">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Cancel &amp; Return
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

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading current branch details...
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Store / Branch Name"
                  name="name"
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
                placeholder="Shop number, street, landmark"
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="City"
                name="city"
                value={formData.city}
                onChange={handleChange}
                error={errors.city}
              />
              <Input
                label="State / Province"
                name="state"
                value={formData.state}
                onChange={handleChange}
                error={errors.state}
              />
              <Input
                label="Postal Code"
                name="postal_code"
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
                value={formData.phone}
                onChange={handleChange}
                error={errors.phone}
                leftIcon={<Phone className="w-4 h-4" />}
              />
              <Input
                label="Store Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                error={errors.email}
                leftIcon={<Mail className="w-4 h-4" />}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Operational Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              >
                <option value="active">Active (Fully operational &amp; open)</option>
                <option value="setup">Under Setup (Pre-launch configuration)</option>
                <option value="inactive">Inactive (Temporarily suspended)</option>
              </select>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <Link href={`/dashboard/stores/${storeId}`}>
                <Button type="button" variant="outline" size="md">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSubmitting}
              >
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function EditStorePage() {
  return (
    <DashboardProvider>
      <EditStoreContent />
    </DashboardProvider>
  );
}

