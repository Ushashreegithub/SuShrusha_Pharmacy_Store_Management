"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CreditCard,
  Calendar,
  Clock,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  RefreshCw,
  Lock,
  ArrowRight,
  Receipt,
  Sparkles,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { getCustomerSubscriptionApi } from "@/lib/api";
import { CustomerSubscriptionResponse, SubscriptionStatus } from "@/types/subscription";

function CustomerSubscriptionContent() {
  const { user, organization } = useDashboard();
  const [subData, setSubData] = useState<CustomerSubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);

  const fetchSubscription = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = await getCustomerSubscriptionApi();
      setSubData(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load subscription details.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  // Status visual mapping
  const getStatusBadge = (status?: SubscriptionStatus, effective?: SubscriptionStatus) => {
    const s = effective || status || "not_started";
    switch (s) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Active License
          </span>
        );
      case "trialing":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Sparkles className="w-3.5 h-3.5" />
            365-Day Trial
          </span>
        );
      case "grandfathered":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-[#0F766E] border border-teal-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            Grandfathered (Permanent)
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="w-3.5 h-3.5" />
            License Expired
          </span>
        );
      case "not_started":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5" />
            Not Started
          </span>
        );
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        title="Subscription & Plan"
        subtitle={`${organization?.name || "Pharmacy Organization"} • License Validity & Renewal Management`}
      >
        <div className="space-y-6 animate-pulse">
          <div className="h-28 bg-slate-100 rounded-2xl border border-slate-200" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="h-32 bg-slate-100 rounded-2xl border border-slate-200" />
            <div className="h-32 bg-slate-100 rounded-2xl border border-slate-200" />
            <div className="h-32 bg-slate-100 rounded-2xl border border-slate-200" />
          </div>
          <div className="h-64 bg-slate-100 rounded-2xl border border-slate-200" />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout
        title="Subscription & Plan"
        subtitle={`${organization?.name || "Pharmacy Organization"} • License Validity & Renewal Management`}
      >
        <div className="p-6 rounded-2xl border border-rose-200 bg-rose-50/70 space-y-4 max-w-xl mx-auto text-center">
          <div className="w-12 h-12 mx-auto bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-rose-900">Failed to Load Subscription Information</h3>
            <p className="text-xs text-rose-700">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSubscription()}
            className="border-rose-300 text-rose-800 hover:bg-rose-100"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Retry Connection
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // Case: Direct PharmaPro Organization (No partner subscription)
  if (subData && (!subData.has_subscription || !subData.is_managed_by_partner)) {
    return (
      <DashboardLayout
        title="Subscription & Plan"
        subtitle={`${organization?.name || "Pharmacy Organization"} • License Status`}
      >
        <div className="max-w-2xl mx-auto bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center space-y-5 shadow-xs">
          <div className="w-14 h-14 mx-auto bg-teal-50 border border-teal-200 text-[#0F766E] rounded-2xl flex items-center justify-center">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">Direct PharmaPro Platform Organization</h2>
            <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
              This pharmacy organization operates directly on the core PharmaPro platform. It is not affiliated with or managed through an external channel partner.
            </p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 text-left space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Organization Name:</span>
              <span className="font-semibold text-slate-800">{subData.organization_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">License Model:</span>
              <span className="font-semibold text-emerald-700">Platform Standard (Unrestricted)</span>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isGrandfathered = Boolean(subData?.is_grandfathered || subData?.status === "grandfathered");
  const isExpired = Boolean(subData?.is_expired || subData?.effective_status === "expired");
  const daysRemaining = subData?.days_remaining ?? null;
  const partner = subData?.partner;
  const payments = subData?.payments || [];

  // Expiry progress calculation (for active or trialing)
  let percentRemaining = 100;
  if (!isGrandfathered && daysRemaining !== null) {
    percentRemaining = Math.max(0, Math.min(100, Math.round((daysRemaining / 365) * 100)));
  }

  return (
    <DashboardLayout
      title="Subscription & Plan"
      subtitle={`${organization?.name || "Pharmacy Organization"} • License Validity & Renewal Management`}
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchSubscription(true)}
          isLoading={refreshing}
          className="text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh Status
        </Button>
      }
    >
      <div className="space-y-6">
        {/* =========================================================================
            RENEWAL NOTIFICATION BANNERS (Based on Real Days Remaining)
        ========================================================================== */}
        {!isGrandfathered && isExpired && (
          <div className="p-5 rounded-2xl border border-rose-300 bg-rose-50 text-rose-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-rose-950">
                  Pharmacy Subscription Expired on {formatDate(subData?.current_period_end)}
                </h3>
                <p className="text-xs text-rose-700 leading-relaxed max-w-2xl">
                  Operational features (POS Billing, Inventory adjustments, Batch receiving) are paused. Your database records remain 100% safe and intact. Please contact your Janjeevan Partner Representative immediately to renew.
                </p>
              </div>
            </div>
            {partner?.contact_email && (
              <a
                href={`mailto:${partner.contact_email}?subject=Subscription Renewal Request: ${encodeURIComponent(subData?.organization_name || "Pharmacy")}`}
                className="shrink-0 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                Contact Partner to Renew
              </a>
            )}
          </div>
        )}

        {!isGrandfathered && !isExpired && daysRemaining !== null && (
          <>
            {daysRemaining <= 1 && (
              <div className="p-5 rounded-2xl border border-rose-300 bg-rose-50/90 text-rose-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-rose-950">
                      Immediate Action Required: Subscription Expires in {daysRemaining} Day!
                    </h3>
                    <p className="text-xs text-rose-700 leading-relaxed">
                      Your license expires on <strong>{formatDate(subData?.current_period_end)}</strong>. Pharmacy operational tools will pause unless renewed before midnight.
                    </p>
                  </div>
                </div>
                {partner?.contact_email && (
                  <a
                    href={`mailto:${partner.contact_email}?subject=Urgent: 1-Day Expiry Renewal for ${encodeURIComponent(subData?.organization_name || "Pharmacy")}`}
                    className="shrink-0 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Renew with Janjeevan
                  </a>
                )}
              </div>
            )}

            {daysRemaining > 1 && daysRemaining <= 3 && (
              <div className="p-4 sm:p-5 rounded-2xl border border-orange-300 bg-orange-50 text-orange-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 border border-orange-200 text-orange-700 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-orange-950">
                      Urgent Renewal Notice: {daysRemaining} Days Remaining
                    </h3>
                    <p className="text-xs text-orange-700 leading-relaxed">
                      Your subscription expires on <strong>{formatDate(subData?.current_period_end)}</strong>. Please contact Janjeevan Organisation to confirm manual renewal payment to prevent disruption.
                    </p>
                  </div>
                </div>
                {partner?.contact_email && (
                  <a
                    href={`mailto:${partner.contact_email}?subject=Renewal Request for ${encodeURIComponent(subData?.organization_name || "Pharmacy")}`}
                    className="shrink-0 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Contact Partner
                  </a>
                )}
              </div>
            )}

            {daysRemaining > 3 && daysRemaining <= 7 && (
              <div className="p-4 sm:p-5 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-amber-950">
                      Renewal Approaching: {daysRemaining} Days Remaining
                    </h3>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Your current subscription period concludes on <strong>{formatDate(subData?.current_period_end)}</strong>. Please arrange payment with your Janjeevan Partner Representative.
                    </p>
                  </div>
                </div>
                {partner?.contact_email && (
                  <a
                    href={`mailto:${partner.contact_email}?subject=Subscription Renewal Inquiry: ${encodeURIComponent(subData?.organization_name || "Pharmacy")}`}
                    className="shrink-0 px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Arrange Renewal
                  </a>
                )}
              </div>
            )}

            {daysRemaining > 7 && daysRemaining <= 15 && (
              <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/70 text-amber-900 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Subscription Reminder:</strong> {daysRemaining} days remaining before license expiry on {formatDate(subData?.current_period_end)}.
                  </span>
                </div>
                {partner?.contact_email && (
                  <a
                    href={`mailto:${partner.contact_email}`}
                    className="font-semibold text-amber-800 underline hover:text-amber-950 shrink-0"
                  >
                    Contact Partner
                  </a>
                )}
              </div>
            )}

            {daysRemaining > 15 && daysRemaining <= 30 && (
              <div className="p-4 rounded-2xl border border-sky-200 bg-sky-50/70 text-sky-900 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <Info className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>
                    <strong>Upcoming Renewal Notice:</strong> Your subscription renews in {daysRemaining} days (expires {formatDate(subData?.current_period_end)}).
                  </span>
                </div>
                {partner?.contact_email && (
                  <a
                    href={`mailto:${partner.contact_email}`}
                    className="font-semibold text-sky-800 underline hover:text-sky-950 shrink-0"
                  >
                    Contact Partner
                  </a>
                )}
              </div>
            )}
          </>
        )}

        {/* Grandfathered Exemption Badge Card */}
        {isGrandfathered && (
          <div className="p-5 rounded-2xl border border-teal-200 bg-teal-50/70 text-teal-900 flex items-start gap-3.5 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-teal-100 border border-teal-200 text-[#0F766E] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-teal-950">
                Grandfathered Legacy Exemption Active
              </h3>
              <p className="text-xs text-teal-800 leading-relaxed max-w-3xl">
                This pharmacy organisation is registered with permanent exemption status under Janjeevan Partner Administration. You are exempt from recurring subscription expiry, renewals, and periodic license fees.
              </p>
            </div>
          </div>
        )}

        {/* =========================================================================
            SUBSCRIPTION OVERVIEW CARDS
        ========================================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Plan & Status */}
          <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan & License</span>
              {getStatusBadge(subData?.status, subData?.effective_status)}
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-bold text-slate-900">{subData?.plan_name || "Janjeevan 365-Day License"}</h4>
              <p className="text-xs text-slate-500">
                Resold & Managed by <strong>{partner?.partner_name || "Janjeevan Organisation"}</strong>
              </p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>Organization:</span>
              <span className="font-semibold text-slate-900 truncate max-w-[160px]">{subData?.organization_name}</span>
            </div>
          </div>

          {/* Card 2: Validity & Expiry Countdown */}
          <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Validity Period</span>
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>
            <div className="space-y-1">
              {isGrandfathered ? (
                <>
                  <p className="text-lg font-bold text-teal-700">Permanent</p>
                  <p className="text-xs text-slate-500">No expiration date</p>
                </>
              ) : isExpired ? (
                <>
                  <p className="text-lg font-bold text-rose-600">Expired</p>
                  <p className="text-xs text-slate-500">Ended on {formatDate(subData?.current_period_end)}</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-slate-900">
                    {daysRemaining !== null ? `${daysRemaining} Days Remaining` : "Valid"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Expires on <strong>{formatDate(subData?.current_period_end)}</strong>
                  </p>
                </>
              )}
            </div>

            {/* Countdown Progress Bar (Hidden for Grandfathered) */}
            {!isGrandfathered && (
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Yearly Cycle</span>
                  <span>{percentRemaining}% remaining</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      isExpired
                        ? "bg-rose-500 w-full"
                        : daysRemaining && daysRemaining <= 7
                        ? "bg-amber-500"
                        : "bg-[#0F766E]"
                    }`}
                    style={{ width: isExpired ? "100%" : `${percentRemaining}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Key Dates */}
          <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] space-y-3 shadow-2xs text-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block pb-1 border-b border-slate-100">
              License Timestamps
            </span>
            <div className="flex justify-between items-center text-slate-600">
              <span>Trial Activated:</span>
              <span className="font-semibold text-slate-800">{formatDate(subData?.trial_started_at)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Current Period Start:</span>
              <span className="font-semibold text-slate-800">{formatDate(subData?.current_period_start)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Current Period End:</span>
              <span className="font-semibold text-slate-800">
                {isGrandfathered ? "Permanent Exemption" : formatDate(subData?.current_period_end)}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Renewal Cycle:</span>
              <span className="font-semibold text-slate-800">
                {isGrandfathered ? "None (Exempt)" : "365-Day Annual"}
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================================
            PARTNER SUPPORT & RENEWAL INSTRUCTIONS CARD
        ========================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E2E8F0] p-6 space-y-5 shadow-2xs">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-[#0F766E] flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Renewal Instructions & Policy</h3>
                <p className="text-xs text-slate-500">
                  Official renewal workflow for partner-affiliated pharmacy organizations
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-teal-700" />
                  Manual Payment & Partner Renewal Verification
                </p>
                <p>
                  PharmaPro licenses for organizations created by <strong>{partner?.partner_name || "Janjeevan Organisation"}</strong> are managed manually through your authorized Partner Owner. There is no automated credit card checkout or self-service payment gateway.
                </p>
              </div>

              <div className="space-y-2.5">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Step-by-Step Renewal Process:
                </h4>
                <ol className="space-y-2 list-decimal list-inside text-slate-700">
                  <li>
                    <strong>Initiate Renewal:</strong> Contact your Janjeevan Partner Representative via email or phone prior to expiration.
                  </li>
                  <li>
                    <strong>Payment Settlement:</strong> Remit the agreed 365-day license renewal fee through Janjeevan Organisation&apos;s standard banking or corporate payment methods.
                  </li>
                  <li>
                    <strong>Partner Confirmation:</strong> The Janjeevan Partner Owner enters your transaction reference into the Partner Administration Console, which immediately extends your validity by 365 days.
                  </li>
                  <li>
                    <strong>Instant Activation:</strong> Once extended by Janjeevan, your dashboard immediately unlocks without any downtime or manual configuration.
                  </li>
                </ol>
              </div>

              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Data Safety Guarantee:</strong> All customer records, medicine batches, transactions, and store settings are permanently preserved even during expired intervals.
                </span>
              </div>
            </div>
          </div>

          {/* Partner Support Contact Card */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 space-y-5 shadow-2xs">
            <div className="pb-3 border-b border-slate-100 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Authorized Partner
              </span>
              <h3 className="text-base font-bold text-slate-900">
                {partner?.partner_name || "Janjivan Organisation Pvt. Ltd"}
              </h3>
              <p className="text-xs text-slate-500">Official Channel & License Partner</p>
            </div>

            <div className="space-y-3.5 text-xs">
              {partner?.contact_email && (
                <div className="flex items-start gap-2.5 text-slate-600">
                  <Mail className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-slate-400 block text-[11px]">Support Email</span>
                    <a
                      href={`mailto:${partner.contact_email}?subject=Subscription Renewal: ${encodeURIComponent(subData?.organization_name || "Pharmacy")}`}
                      className="font-medium text-teal-700 hover:underline break-all"
                    >
                      {partner.contact_email}
                    </a>
                  </div>
                </div>
              )}

              {partner?.contact_phone && (
                <div className="flex items-start gap-2.5 text-slate-600">
                  <Phone className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-slate-400 block text-[11px]">Telephone / Mobile</span>
                    <a href={`tel:${partner.contact_phone}`} className="font-medium text-slate-800 hover:underline">
                      {partner.contact_phone}
                    </a>
                  </div>
                </div>
              )}

              {(partner?.address || partner?.city) && (
                <div className="flex items-start gap-2.5 text-slate-600">
                  <MapPin className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-slate-400 block text-[11px]">Partner Office</span>
                    <span className="text-slate-800 leading-snug">
                      {[partner?.address, partner?.city, partner?.state].filter(Boolean).join(", ")}
                    </span>
                  </div>
                </div>
              )}

              {partner?.website && (
                <div className="flex items-start gap-2.5 text-slate-600">
                  <Globe className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-slate-400 block text-[11px]">Partner Portal</span>
                    <a
                      href={partner.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-teal-700 hover:underline break-all"
                    >
                      {partner.website}
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100">
              {partner?.contact_email ? (
                <a
                  href={`mailto:${partner.contact_email}?subject=Subscription Inquiry: ${encodeURIComponent(subData?.organization_name || "Pharmacy")}`}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl transition"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Send Renewal Email</span>
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {/* =========================================================================
            READ-ONLY PAYMENT & RENEWAL HISTORY TABLE
        ========================================================================== */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden shadow-2xs">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#0F766E]" />
                <h3 className="text-base font-bold text-slate-900">Payment & Extension History</h3>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-semibold">
                  Read-Only
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Official chronological record of confirmed subscription payments and license extensions
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {payments.length} {payments.length === 1 ? "Record" : "Records"}
            </span>
          </div>

          {payments.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 mx-auto bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center">
                <Receipt className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-700">No Payment Records Yet</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Initial 365-day trial activations and grandfathered exemptions do not generate payment transactions. Payment records will appear here as annual renewals are confirmed by Janjeevan.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-slate-600 uppercase text-[11px] font-semibold">
                  <tr>
                    <th className="py-3 px-5">Confirmed At</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Period Covered</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Confirmed By</th>
                    <th className="py-3 px-5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-5 font-medium text-slate-900 whitespace-nowrap">
                        {formatDateTime(p.confirmed_at)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-800">
                        {p.payment_reference || "—"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        {formatDate(p.period_start)} → {formatDate(p.period_end)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} {p.currency}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-semibold text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          Confirmed
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 truncate max-w-[140px]">
                        {p.confirmed_by_name || "Partner Admin"}
                      </td>
                      <td className="py-3.5 px-5 text-slate-500 max-w-[200px] truncate">
                        {p.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Append-only audit-grade record • Maintained by Janjeevan Administration
            </span>
            <span>Immutable history</span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function CustomerSubscriptionPage() {
  return (
    <DashboardProvider>
      <CustomerSubscriptionContent />
    </DashboardProvider>
  );
}
