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
                    <td className="py-3 px-4 text-slate-600 font-semibold">{inv.items.length} lines</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">₹{inv.subtotal_gross}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#0F766E]">
                      ₹{inv.net_total}
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
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(inv.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View / Print</span>
                      </button>
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl my-8 overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Controls Bar (Hidden during print) */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Tax Invoice: {selectedInvoice.invoice_number}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Digital Invoice Content */}
            <div ref={receiptPrintRef} className="p-8 text-slate-800 space-y-6 text-xs bg-white">
              {/* Header: Organization Identity & Store Credentials */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-5">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight">
                    {organization?.name || selectedInvoice.store_name}
                  </h1>
                  <p className="text-xs font-semibold text-[#0F766E] mt-0.5">
                    {selectedInvoice.store_name} ({selectedInvoice.store_code})
                  </p>
                  <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                    {selectedInvoice.store_address && <div>{selectedInvoice.store_address}</div>}
                    {selectedInvoice.store_phone && <div>Phone: {selectedInvoice.store_phone}</div>}
                    {selectedInvoice.store_gstin && <div>GSTIN: {selectedInvoice.store_gstin}</div>}
                    {selectedInvoice.store_dl_number && (
                      <div>D.L. No: {selectedInvoice.store_dl_number}</div>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block bg-teal-50 text-[#0F766E] font-bold px-3 py-1 rounded-lg text-xs uppercase tracking-wider mb-2">
                    Retail Tax Invoice / Cash Memo
                  </span>
                  <div className="text-sm font-bold font-mono text-slate-900">
                    #{selectedInvoice.invoice_number}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    Date:{" "}
                    {new Date(selectedInvoice.created_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Cashier: {selectedInvoice.cashier_name}
                  </div>
                </div>
              </div>

              {/* Customer & Prescription Details */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                    Customer Information
                  </span>
                  <div className="font-bold text-slate-900">{selectedInvoice.customer_name}</div>
                  <div className="text-slate-600 font-mono mt-0.5">
                    Phone: {selectedInvoice.customer_phone}
                  </div>
                </div>

                {selectedInvoice.has_prescription_items && (
                  <div>
                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                      Prescription Dispensing Record
                    </span>
                    <div className="text-slate-800">
                      Doctor: <span className="font-semibold">{selectedInvoice.rx_doctor_name || "—"}</span>
                    </div>
                    <div className="text-slate-800 font-mono">
                      Rx No: {selectedInvoice.rx_number || "—"}
                    </div>
                    {selectedInvoice.is_prescription_verified && (
                      <div className="text-emerald-700 font-semibold text-[11px] mt-0.5 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Dispensed under Pharmacist Supervision</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Itemized Medicine Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Medicine Description</th>
                      <th className="py-2.5 px-3">HSN</th>
                      <th className="py-2.5 px-3">Batch / Expiry</th>
                      <th className="py-2.5 px-3 text-center">Unit & Qty</th>
                      <th className="py-2.5 px-3 text-right">MRP</th>
                      <th className="py-2.5 px-3 text-right">Taxable</th>
                      <th className="py-2.5 px-3 text-right">GST %</th>
                      <th className="py-2.5 px-3 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900">{item.product_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">SKU: {item.product_sku}</div>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                          {item.hsn_code || "3004"}
                        </td>
                        <td className="py-2 px-3">
                          {item.batch_allocations && item.batch_allocations.length > 0 ? (
                            item.batch_allocations.map((ba, bi) => (
                              <div key={bi} className="font-mono text-[11px] text-slate-700">
                                {ba.batch_number} <span className="text-slate-400">({ba.expiry_date})</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-slate-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-semibold text-slate-700">
                          {item.quantity} {item.unit_name}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">₹{item.unit_mrp}</td>
                        <td className="py-2 px-3 text-right font-mono">₹{item.taxable_amount}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">{item.tax_rate}%</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          ₹{item.line_net}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals & Payment Summary */}
              <div className="grid grid-cols-2 gap-6 pt-2">
                {/* Payments Section */}
                <div className="space-y-2">
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                    Payment Tender Breakdown
                  </span>
                  <div className="space-y-1.5 border border-slate-200 rounded-xl p-3 bg-slate-50 text-xs">
                    {selectedInvoice.payments.map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center text-slate-700">
                        <span className="font-semibold flex items-center gap-1.5">
                          {p.payment_method === "CASH" ? (
                            <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                          ) : p.payment_method === "UPI" ? (
                            <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                          ) : (
                            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                          )}
                          <span>{p.payment_method}</span>
                          {p.reference_number && (
                            <span className="font-mono text-[10px] text-slate-400">
                              ({p.reference_number})
                            </span>
                          )}
                        </span>
                        <span className="font-mono font-bold">₹{p.amount}</span>
                      </div>
                    ))}
                    {parseFloat(selectedInvoice.change_returned) > 0 && (
                      <div className="flex justify-between items-center text-emerald-700 font-semibold pt-1 border-t border-slate-200">
                        <span>Change Returned:</span>
                        <span className="font-mono">₹{selectedInvoice.change_returned}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Calculation Summary */}
                <div className="space-y-1.5 text-xs text-slate-600 border border-slate-200 rounded-xl p-4 bg-slate-50">
                  <div className="flex justify-between">
                    <span>Subtotal Gross (MRP):</span>
                    <span className="font-mono text-slate-800">₹{selectedInvoice.subtotal_gross}</span>
                  </div>
                  {parseFloat(selectedInvoice.total_discount) > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>Total Discount:</span>
                      <span className="font-mono">-₹{selectedInvoice.total_discount}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Taxable Amount:</span>
                    <span className="font-mono">₹{selectedInvoice.taxable_subtotal}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>CGST:</span>
                    <span className="font-mono">₹{selectedInvoice.cgst_total}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>SGST:</span>
                    <span className="font-mono">₹{selectedInvoice.sgst_total}</span>
                  </div>
                  {parseFloat(selectedInvoice.round_off_amount) !== 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span>Round-Off:</span>
                      <span className="font-mono">₹{selectedInvoice.round_off_amount}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-slate-200">
                    <span>Net Amount Paid:</span>
                    <span className="font-mono text-[#0F766E] text-base">₹{selectedInvoice.net_total}</span>
                  </div>
                </div>
              </div>

              {/* Statutory Legal Footer */}
              <div className="text-[10px] text-slate-400 border-t border-slate-200 pt-4 text-center space-y-1">
                <p>
                  * Medicines once sold cannot be returned without original cash memo. Schedule drugs sold as per Drug & Cosmetics Rules.
                </p>
                <p className="font-semibold text-slate-500">
                  Thank you for visiting {organization?.name || selectedInvoice.store_name}. Get well soon!
                </p>
              </div>
            </div>
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
