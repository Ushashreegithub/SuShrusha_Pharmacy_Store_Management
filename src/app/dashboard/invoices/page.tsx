"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Receipt,
  Search,
  Calendar,
  Filter,
  Eye,
  Printer,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileText,
  Building2,
  Phone,
  Mail,
  User,
  CheckCircle2,
  Clock,
  ArrowLeft,
  X,
  CreditCard,
  Banknote,
  QrCode,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { Invoice, getInvoicesApi, getInvoiceDetailApi } from "@/lib/api";
import { InvoicePrintDocument, formatINR } from "@/components/invoice/InvoicePrintDocument";

function InvoicesManagementScreen() {
  const { activeStore, activeStoreId, organization } = useDashboard();
  const storeId = activeStore?.id || activeStoreId;

  // Invoices list state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Detail Modal / Printable Receipt
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const receiptPrintRef = useRef<HTMLDivElement>(null);

  // Load Invoices
  const loadInvoices = useCallback(async () => {
    if (!storeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getInvoicesApi(storeId, {
        search: search.trim() || undefined,
        payment_status: paymentStatus || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page: currentPage,
        page_size: pageSize,
      });
      setInvoices(res.results || []);
      setTotalCount(res.count || 0);
    } catch (err: any) {
      console.error("Failed to load invoices:", err);
      setError(err.message || "Failed to load sales invoices.");
    } finally {
      setIsLoading(false);
    }
  }, [storeId, search, paymentStatus, startDate, endDate, currentPage, pageSize]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // Open Detail
  const handleOpenDetail = async (invoiceId: string) => {
    if (!storeId) return;
    setIsLoadingDetail(true);
    try {
      const detail = await getInvoiceDetailApi(storeId, invoiceId);
      setSelectedInvoice(detail);
    } catch (err: any) {
      console.error("Failed to load invoice details:", err);
      setError(err.message || "Failed to load invoice details.");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Search & Filter Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-50 text-[#0F766E] rounded-xl">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Retail Sales Invoices & Receipts</h2>
              <p className="text-xs text-slate-500">
                Browse, search, and reprint digital GST tax invoices generated at the counter
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/billing"
              className="px-3.5 py-2 bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold rounded-xl shadow-2xs flex items-center gap-1.5 transition"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Open Billing POS</span>
            </Link>
            <button
              type="button"
              onClick={loadInvoices}
              disabled={isLoading}
              className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition"
              title="Refresh list"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-[#0F766E]" : ""}`} />
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice #, customer name, phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>

          <div>
            <select
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            >
              <option value="">All Payment Statuses</option>
              <option value="PAID">Paid in Full</option>
              <option value="PARTIAL">Partially Paid</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </div>

          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              placeholder="From Date"
            />
          </div>

          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              placeholder="To Date"
            />
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Customer Details</th>
                <th className="py-3 px-4">Cashier</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4 text-right">Gross MRP</th>
                <th className="py-3 px-4 text-right">Net Paid</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#0F766E] mb-2" />
                    <span>Loading sales invoices...</span>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No invoices found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Completed counter sales will appear here with full tax and batch traceability.
                    </p>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-slate-900">{inv.invoice_number}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {new Date(inv.created_at).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{inv.customer_name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{inv.customer_phone}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{inv.cashier_name}</td>
                    <td className="py-3 px-4 text-slate-600 font-semibold">{inv.items ? inv.items.length : 0} lines</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(inv.subtotal_gross || inv.gross_total)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#0F766E]">
                      {formatINR(inv.net_total)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          inv.payment_status === "PAID"
                            ? "bg-emerald-100 text-emerald-800"
                            : inv.payment_status === "PARTIAL"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {inv.payment_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(inv.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                          title="View Digital Invoice"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <a
                          href={`/dashboard/invoices/${inv.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold transition"
                          title="Open Standalone Print / PDF"
                        >
                          <Printer className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Print</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {invoices.length} of {totalCount} invoices
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1 || isLoading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages || isLoading}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ================= DIGITAL INVOICE / PRINTABLE RECEIPT MODAL ================= */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
          <div className="max-w-4xl w-full my-8 print:my-0">
            <InvoicePrintDocument
              invoice={selectedInvoice}
              organization={organization}
              showActions={true}
              onPrint={() => window.print()}
              onClose={() => setSelectedInvoice(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <DashboardProvider>
      <DashboardLayout
        title="Invoices & Receipts"
        subtitle="Review, audit, and reprint digital sales invoices and counter cash memos"
      >
        <InvoicesManagementScreen />
      </DashboardLayout>
    </DashboardProvider>
  );
}
