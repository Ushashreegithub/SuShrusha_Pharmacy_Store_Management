"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { SecurityNotice } from "@/components/auth/SecurityNotice";
import { Alert } from "@/components/ui/Alert";
import { User, Mail, Phone, Building2, AlertCircle, Lock } from "lucide-react";
import { registerOwnerApi, getPublicRegistrationStatusApi, ApiError } from "@/lib/api";

export default function OwnerRegistrationPage() {
  const router = useRouter();

  const [registrationEnabled, setRegistrationEnabled] = useState<boolean>(true);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    async function checkStatus() {
      try {
        const res = await getPublicRegistrationStatusApi();
        if (isMounted) {
          setRegistrationEnabled(Boolean(res.public_registration_enabled));
        }
      } catch {
        // Fallback safely; server enforces on submit regardless
      } finally {
        if (isMounted) {
          setCheckingStatus(false);
        }
      }
    }
    checkStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  // Form State
  const [formData, setFormData] = useState({
    fullName: "",
    organizationName: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
    agreeToTerms: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isDuplicateEmail, setIsDuplicateEmail] = useState(false);

  // Field change handler
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    if (name === "email" && isDuplicateEmail) {
      setIsDuplicateEmail(false);
      setServerError(null);
    }

    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Quick Mock Autofill for testing
  const handleAutofill = () => {
    setFormData({
      fullName: "Dr. Rajesh Nayak",
      organizationName: "Healthcare Pharmacy",
      email: "rajesh.nayak@pharmacy.com",
      phoneNumber: "+91 98765 43210",
      password: "PharmacyOwner@2026",
      confirmPassword: "PharmacyOwner@2026",
      agreeToTerms: true,
    });
    setErrors({});
  };

  // Client-side validation
  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = "Owner full name is required";
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = "Name must be at least 2 characters";
    }

    if (!formData.organizationName.trim()) {
      newErrors.organizationName = "Pharmacy / business name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Business email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = "Please enter a valid business email address";
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = "Phone number is required";
    } else if (!/^[0-9+\s-]{8,15}$/.test(formData.phoneNumber.trim())) {
      newErrors.phoneNumber = "Please enter a valid phone number";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Confirm password is required";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (!formData.agreeToTerms) {
      newErrors.agreeToTerms = "You must agree to the Terms of Service & Privacy Policy";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setIsLoading(true);

    try {
      const res = await registerOwnerApi({
        fullName: formData.fullName,
        organizationName: formData.organizationName,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      });

      // Save non-sensitive metadata for session reference
      if (typeof window !== "undefined") {
        sessionStorage.setItem("pharmaPro_pending_email", res.email);
        sessionStorage.setItem("pharmaPro_pending_org", res.organizationName);
        sessionStorage.setItem("sushrusha_pending_email", res.email);
        sessionStorage.setItem("sushrusha_pending_org", res.organizationName);
      }

      router.push(`/login?registered=true&email=${encodeURIComponent(res.email)}`);
    } catch (err: any) {
      if (
        err instanceof ApiError &&
        (err.code === "registration_disabled" || err.status === 403)
      ) {
        setRegistrationEnabled(false);
        setIsDuplicateEmail(false);
        setServerError(
          err.message ||
            "Public pharmacy registration is currently disabled by the platform administrator."
        );
      } else if (
        err instanceof ApiError &&
        (err.code === "email_already_registered" || err.status === 409)
      ) {
        setIsDuplicateEmail(true);
        setServerError(
          err.message ||
            "An account with this email may already exist. Please sign in or reset your password if needed."
        );
      } else if (err instanceof ApiError && err.fieldErrors) {
        setIsDuplicateEmail(false);
        setErrors(err.fieldErrors);
        setServerError(err.message);
      } else {
        setIsDuplicateEmail(false);
        setServerError(err?.message || "Failed to register owner account. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!checkingStatus && !registrationEnabled) {
    return (
      <AuthSplitLayout
        title="Registration Currently Closed"
        subtitle="Public pharmacy onboarding is restricted by the platform administrator."
      >
        <div className="space-y-5">
          <div className="p-5 rounded-xl border border-amber-200 bg-amber-50 text-amber-950 space-y-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-amber-950">
                  Public Registration Disabled
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {serverError ||
                    "New public pharmacy owner signups are temporarily paused. Existing pharmacy owners, managers, and staff members can continue signing in normally."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-[#0F766E] hover:bg-[#0d655e] text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
            >
              Sign In to Existing Account &rarr;
            </Link>
          </div>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout
      title="Create Owner Account"
      subtitle="Register your pharmacy business to start managing branches, inventory, and staff."
    >
      <div className="space-y-4">
        {/* Prototype demo autofill banner */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs">
          <span className="text-slate-600 font-medium">
            Frontend Prototype (Mock State)
          </span>
          <button
            type="button"
            onClick={handleAutofill}
            className="text-xs font-semibold text-[#0F766E] hover:underline"
          >
            Autofill Sample Data
          </button>
        </div>

        {isDuplicateEmail ? (
          <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 space-y-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold text-sm text-amber-950">
                  Account Already Exists
                </p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {serverError ||
                    "An account with this email may already exist. Please sign in or reset your password if needed."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-amber-200">
              <Link
                href={`/login?email=${encodeURIComponent(formData.email.trim())}`}
                className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0d655e] transition-colors shadow-sm"
              >
                Sign In with this Email &rarr;
              </Link>
              <Link
                href={`/forgot-password?email=${encodeURIComponent(formData.email.trim())}`}
                className="text-xs font-medium text-amber-900 hover:text-amber-950 underline underline-offset-2"
              >
                Forgot your password?
              </Link>
            </div>
          </div>
        ) : serverError ? (
          <Alert variant="error" onClose={() => setServerError(null)}>
            {serverError}
          </Alert>
        ) : null}

        {/* Business Rule Notice */}
        <SecurityNotice type="owner-only" />

        <form onSubmit={handleSubmit} noValidate className="space-y-3.5 mt-2">
          {/* Owner Full Name */}
          <Input
            label="Owner Full Name"
            name="fullName"
            placeholder="e.g. Dr. Rajesh Nayak"
            required
            value={formData.fullName}
            onChange={handleChange}
            error={errors.fullName}
            leftIcon={<User className="w-4 h-4" />}
          />

          {/* Pharmacy / Business Name */}
          <Input
            label="Pharmacy / Business Name"
            name="organizationName"
            placeholder="e.g. Healthcare Pharmacy"
            required
            value={formData.organizationName}
            onChange={handleChange}
            error={errors.organizationName}
            leftIcon={<Building2 className="w-4 h-4" />}
          />

          {/* Business Email */}
          <Input
            label="Business Email"
            type="email"
            name="email"
            placeholder="e.g. owner@gmail.com"
            required
            value={formData.email}
            onChange={handleChange}
            error={errors.email}
            helperText="A verification link will be sent to this email before access is granted."
            leftIcon={<Mail className="w-4 h-4" />}
          />

          {/* Phone Number */}
          <Input
            label="Phone Number"
            type="tel"
            name="phoneNumber"
            placeholder="e.g. +91 98765 43210"
            required
            value={formData.phoneNumber}
            onChange={handleChange}
            error={errors.phoneNumber}
            leftIcon={<Phone className="w-4 h-4" />}
          />

          {/* Password */}
          <div>
            <PasswordInput
              label="Password"
              name="password"
              placeholder="Create a strong password"
              required
              value={formData.password}
              onChange={handleChange}
              error={errors.password}
            />
            {formData.password && (
              <PasswordStrengthMeter password={formData.password} />
            )}
          </div>

          {/* Confirm Password */}
          <PasswordInput
            label="Confirm Password"
            name="confirmPassword"
            placeholder="Re-enter your password"
            required
            value={formData.confirmPassword}
            onChange={handleChange}
            error={errors.confirmPassword}
          />

          {/* Terms Agreement */}
          <div className="pt-1">
            <Checkbox
              name="agreeToTerms"
              checked={formData.agreeToTerms}
              onChange={handleChange}
              error={errors.agreeToTerms}
              label={
                <span>
                  I agree to the{" "}
                  <a href="#terms" className="text-[#0F766E] font-medium underline">
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a href="#privacy" className="text-[#0F766E] font-medium underline">
                    Privacy Policy
                  </a>
                </span>
              }
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isLoading}
            >
              Register Pharmacy Business
            </Button>
          </div>
        </form>

        {/* Footer Navigation */}
        <div className="text-center pt-3 text-xs text-slate-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-[#0F766E] font-semibold hover:underline ml-1"
          >
            Sign In
          </Link>
        </div>
      </div>
    </AuthSplitLayout>
  );
}
