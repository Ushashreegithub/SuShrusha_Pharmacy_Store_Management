"use client";

import React, { useState } from "react";
import { Check, Copy, KeyRound, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface RevealedCredentials {
  title: string;
  subtitle?: string;
  fullName?: string;
  email: string;
  temporaryPassword: string;
  pharmacyName?: string;
}

interface CredentialsRevealModalProps {
  credentials: RevealedCredentials | null;
  onClose: () => void;
}

export function CredentialsRevealModal({
  credentials,
  onClose,
}: CredentialsRevealModalProps) {
  const [copiedField, setCopiedField] = useState<"email" | "password" | "all" | null>(null);

  if (!credentials) return null;

  const copyText = async (text: string, field: "email" | "password" | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const fullBundle = [
    credentials.pharmacyName ? `Pharmacy: ${credentials.pharmacyName}` : null,
    credentials.fullName ? `Manager: ${credentials.fullName}` : null,
    `Login URL: https://erp.sushrusaeclinic.com/login`,
    `Email: ${credentials.email}`,
    `Temporary Password: ${credentials.temporaryPassword}`,
    `Note: Password change is required on first sign-in.`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 bg-teal-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F766E] text-white flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{credentials.title}</h3>
              {credentials.subtitle && (
                <p className="text-xs text-slate-600 mt-0.5">{credentials.subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition"
            aria-label="Close credentials dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">One-Time Credential Display</span>
              <span>
                This temporary password is displayed only once and cannot be retrieved later. Share it securely with the pharmacy manager. They will be prompted to set a new password upon signing in.
              </span>
            </div>
          </div>

          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            {credentials.pharmacyName && (
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Customer Pharmacy
                </span>
                <p className="text-sm font-semibold text-slate-900">{credentials.pharmacyName}</p>
              </div>
            )}

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Sign-In Email
              </span>
              <div className="flex items-center justify-between gap-2 mt-1">
                <code className="text-sm font-mono text-slate-800 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 flex-1 truncate">
                  {credentials.email}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(credentials.email, "email")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700"
                >
                  {copiedField === "email" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedField === "email" ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Temporary Password
              </span>
              <div className="flex items-center justify-between gap-2 mt-1">
                <code className="text-sm font-mono font-bold text-[#0F766E] bg-white px-2.5 py-1.5 rounded-lg border border-teal-200 flex-1 select-all">
                  {credentials.temporaryPassword}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(credentials.temporaryPassword, "password")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700"
                >
                  {copiedField === "password" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedField === "password" ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => copyText(fullBundle, "all")}
              className="text-xs flex items-center gap-1.5"
            >
              {copiedField === "all" ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedField === "all" ? "Full Credentials Copied" : "Copy All Details"}</span>
            </Button>
            <Button type="button" variant="primary" onClick={onClose} className="bg-[#0F766E] hover:bg-[#0D645D]">
              Done, I Have Saved These Credentials
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
