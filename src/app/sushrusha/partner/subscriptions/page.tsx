"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import {
  CreditCard,
  Search,
  RefreshCw,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  History,
  ShieldCheck,
  ChevronRight,
  X,
  FileText,
  DollarSign,
  AlertTriangle,
  Building2,
  Lock,
} from "lucide-react";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import {
  getPartnerSubscriptionsApi,
  getPartnerSubscriptionMetricsApi,
  getPartnerSubscriptionDetailApi,
  confirmSubscriptionPaymentApi,
  renewSubscriptionApi,
  ApiError,
} from "@/lib/api";
import {
  PartnerSubscriptionItem,
  SubscriptionPaymentItem,
  SubscriptionMetrics,
  SubscriptionStatus,
} from "@/types/subscription";

function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoStr;
  }
}

function formatCurrency(amount: string | number, currency: string = "INR"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
  }).format(num);
}

function StatusBadge({ status, effectiveStatus }: { status: SubscriptionStatus; effectiveStatus?: SubscriptionStatus }) {
  const current = effectiveStatus || status;

  switch (current) {
    case "active":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Active
        </span>
      );
    case "trialing":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <Clock className="w-3.5 h-3.5" />
          Trial (365d)
        </span>
      );
    case "expired":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertCircle className="w-3.5 h-3.5" />
          Expired
        </span>
      );
    case "not_started":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3.5 h-3.5" />
          Not Started
        </span>
      );
    case "grandfathered":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <ShieldCheck className="w-3.5 h-3.5" />
          Grandfathered
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
          {status}
        </span>
      );
  }
}

function PartnerSubscriptionsContent() {
  const [subscriptions, setSubscriptions] = useState<PartnerSubscriptionItem[]>([]);
  const [metrics, setMetrics] = useState<SubscriptionMetrics | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Modals state
  const [paymentTarget, setPaymentTarget] = useState<PartnerSubscriptionItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>("15000.00");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [paymentNotes, setPaymentNotes] = useState<string>("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  const [renewTarget, setRenewTarget] = useState<PartnerSubscriptionItem | null>(null);
  const [renewNotes, setRenewNotes] = useState<string>("");
  const [renewReference, setRenewReference] = useState<string>("");
  const [renewSubmitting, setRenewSubmitting] = useState(false);

  const [historyTarget, setHistoryTarget] = useState<PartnerSubscriptionItem | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPayments, setHistoryPayments] = useState<SubscriptionPaymentItem[]>([]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [listRes, metricsRes] = await Promise.all([
        getPartnerSubscriptionsApi({
          search: search.trim() || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          page_size: 50,
        }),
        getPartnerSubscriptionMetricsApi().catch(() => null),
      ]);
      setSubscriptions(listRes.results);
      if (metricsRes) setMetrics(metricsRes);
    } catch (err: any) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load partner pharmacy subscriptions."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Manual Payment Confirm
  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTarget) return;

    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setError("Please provide a valid payment amount greater than zero.");
      return;
    }

    setPaymentSubmitting(true);
    setError(null);

    try {
      const res = await confirmSubscriptionPaymentApi(paymentTarget.id, {
        amount: amt,
        currency: "INR",
        payment_reference: paymentReference.trim(),
        notes: paymentNotes.trim(),
      });
      setActionNotice(res.message);
      setPaymentTarget(null);
      setPaymentAmount("15000.00");
      setPaymentReference("");
      setPaymentNotes("");
      loadData(true);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to confirm manual payment.");
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Handle One-Year Renewal
  const handleRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewTarget) return;

    setRenewSubmitting(true);
    setError(null);

    try {
      const res = await renewSubscriptionApi(renewTarget.id, {
        notes: renewNotes.trim() || "Annual 365-day renewal confirmed by Partner Owner.",
        payment_reference: renewReference.trim() || "ANNUAL-RENEWAL",
      });
      setActionNotice(res.message);
      setRenewTarget(null);
      setRenewNotes("");
      setRenewReference("");
      loadData(true);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to renew subscription.");
    } finally {
      setRenewSubmitting(false);
    }
  };

  // Open Payment History Modal
  const openHistory = async (sub: PartnerSubscriptionItem) => {
    setHistoryTarget(sub);
    setHistoryLoading(true);
    try {
      const detail = await getPartnerSubscriptionDetailApi(sub.id);
      setHistoryPayments(detail.payments || []);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to load payment history.");
      setHistoryPayments([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <PartnerLayout
      title="Subscription Management"
      subtitle="Janjeevan Partner Pharmacy Licenses, Validity Tracking & Payment Confirmations"
      actions={
        <button
          type="button"
          onClick={() => loadData(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-[#E2E8F0] rounded-xl hover:bg-slate-50 transition shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#0F766E]" : ""}`} />
          <span>Refresh</span>
        </button>
      }
    >
      <div className="space-y-6">
        {/* Alerts */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1">
              <p className="font-semibold">Error</p>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {actionNotice && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-800 text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-semibold">Success</p>
              <p>{actionNotice}</p>
            </div>
            <button type="button" onClick={() => setActionNotice(null)} className="text-emerald-500 hover:text-emerald-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Overview Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-xs">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{metrics?.total ?? subscriptions.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Linked Pharmacies</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Active</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{metrics?.active ?? 0}</p>
            <p className="text-[11px] text-emerald-700/80 mt-0.5">Paid License</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">In Trial</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{metrics?.trialing ?? 0}</p>
            <p className="text-[11px] text-blue-700/80 mt-0.5">365-Day Initial</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-xs">
            <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Expired</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{metrics?.expired ?? 0}</p>
            <p className="text-[11px] text-rose-700/80 mt-0.5">Requires Renewal</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-xs">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Not Started</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{metrics?.not_started ?? 0}</p>
            <p className="text-[11px] text-amber-700/80 mt-0.5">Pending 1st Login</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-purple-100 shadow-xs">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Grandfathered</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{metrics?.grandfathered ?? 0}</p>
            <p className="text-[11px] text-purple-700/80 mt-0.5">Legacy Exemption</p>
          </div>
        </div>

        {/* Toolbar: Search & Status Filters */}
        <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pharmacy name, slug, email..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:bg-white transition"
            />
          </div>

          {/* Status Tab Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {[
              { id: "all", label: "All" },
              { id: "active", label: "Active" },
              { id: "trialing", label: "Trialing" },
              { id: "expired", label: "Expired" },
              { id: "not_started", label: "Not Started" },
              { id: "grandfathered", label: "Grandfathered" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  statusFilter === tab.id
                    ? "bg-[#0F766E] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subscriptions Table Card */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Linked Customer Pharmacies</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {subscriptions.length} {subscriptions.length === 1 ? "subscription" : "subscriptions"} found
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center">
              <div className="w-9 h-9 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs font-semibold text-slate-600">Loading subscription records...</p>
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto mb-3">
                <CreditCard className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">No subscriptions found</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {search || statusFilter !== "all"
                  ? "Try clearing your search query or switching status filters."
                  : "Newly created Janjeevan customer pharmacies will automatically appear here with a not_started status."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-[#E2E8F0] text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Pharmacy</th>
                    <th className="py-3 px-4">Owner Contact</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Trial Start</th>
                    <th className="py-3 px-4">Expiry & Validity</th>
                    <th className="py-3 px-4">Payments</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {subscriptions.map((sub) => {
                    const isExp = sub.is_expired || sub.effective_status === "expired";
                    const isGrandfathered = sub.status === "grandfathered";
                    const isNotStarted = sub.status === "not_started";

                    return (
                      <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Pharmacy Column */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 text-[#0F766E] flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{sub.organization_name}</p>
                              <p className="text-[11px] text-slate-400 truncate">slug: {sub.organization_slug}</p>
                            </div>
                          </div>
                        </td>

                        {/* Owner Contact */}
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-slate-800">{sub.owner_name || "Unassigned Owner"}</p>
                          <p className="text-[11px] text-slate-500 truncate">{sub.owner_email}</p>
                          {sub.owner_phone && <p className="text-[11px] text-slate-400">{sub.owner_phone}</p>}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <StatusBadge status={sub.status} effectiveStatus={sub.effective_status} />
                        </td>

                        {/* Trial Start */}
                        <td className="py-3.5 px-4">
                          {sub.trial_started_at ? (
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>{formatDateTime(sub.trial_started_at)}</span>
                            </div>
                          ) : isNotStarted ? (
                            <span className="text-amber-600 text-[11px] font-medium">Pending 1st Login</span>
                          ) : isGrandfathered ? (
                            <span className="text-purple-600 text-[11px] font-medium">Exempt</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Expiry & Validity */}
                        <td className="py-3.5 px-4">
                          {isGrandfathered ? (
                            <div className="text-purple-700 font-semibold text-[11px]">
                              Permanent Access (Grandfathered)
                            </div>
                          ) : isNotStarted ? (
                            <div className="text-slate-500 text-[11px]">
                              Activates 365 days on first login
                            </div>
                          ) : sub.current_period_end ? (
                            <div>
                              <div className="font-semibold text-slate-800 flex items-center gap-1">
                                <span>{formatDateTime(sub.current_period_end)}</span>
                              </div>
                              {isExp ? (
                                <span className="inline-block mt-0.5 text-[11px] text-rose-600 font-bold">
                                  {sub.days_remaining !== null && sub.days_remaining < 0
                                    ? `Expired ${Math.abs(sub.days_remaining)} days ago`
                                    : "Subscription Expired"}
                                </span>
                              ) : (
                                <span className="inline-block mt-0.5 text-[11px] text-emerald-600 font-medium">
                                  {sub.days_remaining !== null
                                    ? `${sub.days_remaining} days remaining`
                                    : "Valid"}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Payments Count */}
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => openHistory(sub)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
                          >
                            <History className="w-3.5 h-3.5 text-slate-500" />
                            <span>{sub.payments_count} paid</span>
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPaymentTarget(sub)}
                              className="px-2.5 py-1.5 bg-[#0F766E] hover:bg-[#0D645D] text-white text-xs font-semibold rounded-lg transition shadow-xs"
                            >
                              Confirm Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenewTarget(sub)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                            >
                              Renew 1 Year
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal: Confirm Manual Payment */}
        {paymentTarget && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-[#0F766E]">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Confirm Manual Subscription Payment</h3>
                    <p className="text-xs text-slate-500">{paymentTarget.organization_name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentTarget(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleConfirmPayment} className="p-5 space-y-4">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Status:</span>
                    <span className="font-semibold text-slate-800 capitalize">{paymentTarget.effective_status || paymentTarget.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Expiry:</span>
                    <span className="font-semibold text-slate-800">
                      {paymentTarget.current_period_end ? formatDateTime(paymentTarget.current_period_end) : "Not Started / None"}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 text-[#0F766E] font-semibold">
                    <span>New Validity:</span>
                    <span>+365 Days Extended</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Amount (INR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="e.g. 15000.00"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Reference / Cheque / UTR
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. UTR-982138120 or Cheque #49281"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Verification Notes
                  </label>
                  <textarea
                    rows={2}
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="e.g. Annual renewal payment verified by Partner Account Manager."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:bg-white transition"
                  />
                </div>

                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px]">
                  <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    This records an <strong>append-only</strong> payment record, updates status to <strong>Active</strong>, and extends pharmacy operations by 365 days.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setPaymentTarget(null)}
                    disabled={paymentSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={paymentSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D645D] rounded-xl transition shadow-xs flex items-center gap-2"
                  >
                    {paymentSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Confirming...</span>
                      </>
                    ) : (
                      <span>Confirm & Activate 365 Days</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: One-Year Renewal */}
        {renewTarget && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Renew Subscription for 365 Days</h3>
                    <p className="text-xs text-slate-500">{renewTarget.organization_name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRenewTarget(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleRenew} className="p-5 space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Renewing this subscription extends its operational period by <strong>365 days</strong>.
                  {renewTarget.is_expired
                    ? " Because the subscription is currently expired, the 365-day validity will start immediately from today."
                    : " The additional 365 days will be added on top of the existing expiry date."}
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Renewal Reference
                  </label>
                  <input
                    type="text"
                    value={renewReference}
                    onChange={(e) => setRenewReference(e.target.value)}
                    placeholder="e.g. ANNUAL-RENEWAL-2026"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={renewNotes}
                    onChange={(e) => setRenewNotes(e.target.value)}
                    placeholder="e.g. 1-Year Partner Owner License Extension granted."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:bg-white transition"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRenewTarget(null)}
                    disabled={renewSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={renewSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D645D] rounded-xl transition shadow-xs flex items-center gap-2"
                  >
                    {renewSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Renewing...</span>
                      </>
                    ) : (
                      <span>Apply 365-Day Renewal</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Payment History */}
        {historyTarget && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Payment & Renewal History</h3>
                    <p className="text-xs text-slate-500">{historyTarget.organization_name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryTarget(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1">
                {historyLoading ? (
                  <div className="py-12 text-center">
                    <div className="w-8 h-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs text-slate-500">Loading audit payments...</p>
                  </div>
                ) : historyPayments.length === 0 ? (
                  <div className="py-12 text-center px-4">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No payment records found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Manual payments or renewals recorded by the Partner Owner will be logged here as immutable audit records.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyPayments.map((p) => (
                      <div
                        key={p.id}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-sm">
                            {formatCurrency(p.amount, p.currency)}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            Confirmed {formatDateTime(p.confirmed_at)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                          <div>
                            <span className="text-slate-400">Reference: </span>
                            <span className="font-semibold text-slate-800">{p.payment_reference || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Confirmed By: </span>
                            <span className="font-semibold text-slate-800">{p.confirmed_by_name || p.confirmed_by_email}</span>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-slate-400">Validity Period: </span>
                            <span className="font-medium text-slate-800">
                              {formatDateTime(p.period_start)} → {formatDateTime(p.period_end)}
                            </span>
                          </div>
                          {p.notes && (
                            <div className="sm:col-span-2 text-slate-500 italic bg-white p-2 rounded-lg border border-slate-200/60">
                              "{p.notes}"
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Append-only immutable transaction log
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryTarget(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}

export default function PartnerSubscriptionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
          <div className="w-8 h-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PartnerSubscriptionsContent />
    </Suspense>
  );
}
