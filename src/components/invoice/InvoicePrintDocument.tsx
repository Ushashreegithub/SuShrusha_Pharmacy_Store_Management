"use client";

import React from "react";
import {
  Receipt,
  Printer,
  ShieldCheck,
  Building2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  CreditCard,
  Banknote,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { Invoice } from "@/lib/api";

interface InvoicePrintDocumentProps {
  invoice: Invoice;
  organization?: {
    name?: string;
    logo_url?: string | null;
  } | null;
  showActions?: boolean;
  onPrint?: () => void;
  onClose?: () => void;
  standalone?: boolean;
}

// Indian Rupee Currency Formatter
export function formatINR(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === "") return "₹0.00";
  const num = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function InvoicePrintDocument({
  invoice,
  organization,
  showActions = true,
  onPrint,
  onClose,
  standalone = false,
}: InvoicePrintDocumentProps) {
  const [logoFailed, setLogoFailed] = React.useState(false);

  const orgName =
    invoice.organization_name || organization?.name || invoice.store_name || "DiracPharma";
  const orgLogo =
    invoice.organization_logo_url || organization?.logo_url;

  // Determine if any line item has IGST
  const hasIgst =
    (parseFloat(invoice.igst_total || invoice.igst_amount || "0") > 0) ||
    invoice.items?.some((i) => parseFloat(i.igst_amount || "0") > 0);

  // Fallback safe values
  const grossAmount = invoice.subtotal_gross || invoice.gross_total || "0.00";
  const discountTotal = invoice.total_discount || invoice.discount_total || "0.00";
  const taxableAmount = invoice.taxable_subtotal || invoice.taxable_amount || "0.00";
  const cgstAmount = invoice.cgst_total || invoice.cgst_amount || "0.00";
  const sgstAmount = invoice.sgst_total || invoice.sgst_amount || "0.00";
  const igstAmount = invoice.igst_total || invoice.igst_amount || "0.00";
  const roundOff = invoice.round_off_amount || invoice.rounding_adjustment || "0.00";
  const netTotal = invoice.net_total || "0.00";
  const paidAmount = invoice.paid_amount || "0.00";
  const changeReturned = invoice.change_returned || invoice.change_due || "0.00";

  const handlePrintClick = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  return (
    <div className={`w-full ${standalone ? "min-h-screen bg-slate-100 py-6 px-4 sm:px-6" : ""}`}>
      {/* Screen-Only Action Control Bar */}
      {showActions && (
        <div className="max-w-4xl mx-auto mb-4 p-3 bg-slate-900 text-white rounded-2xl shadow-lg flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2 text-xs">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm">Tax Invoice: #{invoice.invoice_number}</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                invoice.payment_status === "PAID"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}
            >
              {invoice.payment_status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!standalone && (
              <a
                href={`/dashboard/invoices/${invoice.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 border border-slate-700 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Dedicated Print View</span>
              </a>
            )}

            <button
              type="button"
              onClick={handlePrintClick}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Download PDF</span>
            </button>
          </div>
        </div>
      )}

      {/* Authoritative Standalone Printable Invoice Sheet */}
      <div
        id="invoice-printable-area"
        className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm print:border-none print:shadow-none print:rounded-none print:p-0 print:max-w-none text-slate-900"
      >
        {/* ================= HEADER SECTION ================= */}
        <div className="border-b-2 border-slate-800 pb-5 mb-5">
          <div className="flex justify-between items-start gap-4">
            {/* Organization & Store Identity */}
            <div className="flex items-start gap-3.5 flex-1 min-w-0">
              {orgLogo && !logoFailed ? (
                <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white p-1 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs">
                  <img
                    src={orgLogo}
                    alt={`${orgName} Logo`}
                    className="w-full h-full object-contain"
                    onError={() => setLogoFailed(true)}
                  />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-xl bg-teal-50 border border-teal-200 text-[#0F766E] flex items-center justify-center flex-shrink-0 shadow-2xs">
                  <Building2 className="w-7 h-7" />
                </div>
              )}

              <div className="min-w-0">
                <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight leading-tight">
                  {orgName}
                </h1>
                <div className="text-sm font-bold text-[#0F766E] mt-0.5">
                  {invoice.store_name}{" "}
                  {invoice.store_code && (
                    <span className="font-mono text-xs text-slate-500 font-normal">
                      ({invoice.store_code})
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-600 mt-1 space-y-0.5 leading-relaxed">
                  {invoice.store_address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      <span>{invoice.store_address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {invoice.store_phone && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>Ph: {invoice.store_phone}</span>
                      </span>
                    )}
                    {invoice.store_email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{invoice.store_email}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap pt-0.5 font-mono text-[10px] text-slate-700">
                    {invoice.store_gstin ? (
                      <span className="font-bold">GSTIN: {invoice.store_gstin}</span>
                    ) : (
                      <span>GST Reg: Composition / Retail Store</span>
                    )}
                    {invoice.store_dl_number && (
                      <span className="font-semibold">D.L. No: {invoice.store_dl_number}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Document Metadata Badge & Number */}
            <div className="text-right flex-shrink-0">
              <span className="inline-block bg-[#0F766E] text-white font-extrabold px-3 py-1 rounded-md text-[11px] uppercase tracking-wider shadow-2xs mb-2">
                Retail Tax Invoice / Cash Memo
              </span>
              <div className="font-mono text-base font-black text-slate-900 tracking-tight">
                #{invoice.invoice_number}
              </div>
              <div className="text-xs text-slate-600 mt-1 font-mono flex items-center justify-end gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>
                  {new Date(invoice.created_at).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center justify-end gap-1">
                <User className="w-3 h-3 text-slate-400" />
                <span>Cashier: <strong className="text-slate-700">{invoice.cashier_name}</strong></span>
              </div>
              <div className="mt-1.5">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                    invoice.payment_status === "PAID"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-amber-100 text-amber-800 border border-amber-300"
                  }`}
                >
                  Status: {invoice.payment_status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ================= CUSTOMER & PRESCRIPTION SECTION ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 text-xs mb-5 avoid-break">
          {/* Customer Information */}
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Billed To (Customer Details)
            </span>
            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span>{invoice.customer_name || "Retail Walk-in Customer"}</span>
            </div>
            <div className="text-slate-600 font-mono mt-0.5">
              Mobile: {invoice.customer_phone || "—"}
            </div>
            {invoice.customer_address && (
              <div className="text-slate-500 mt-0.5 leading-snug">
                Address: {invoice.customer_address}
              </div>
            )}
          </div>

          {/* Prescription Dispensing Audit */}
          <div className="border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-4">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Prescription & Dispensing Audit
            </span>
            {invoice.has_prescription_items || invoice.rx_number || invoice.doctor_name ? (
              <div className="space-y-0.5">
                <div className="text-slate-800">
                  Doctor: <strong className="text-slate-900">{invoice.doctor_name || invoice.rx_doctor_name || "Doctor Not Recorded"}</strong>
                </div>
                <div className="text-slate-800 font-mono">
                  Prescription No: <strong>{invoice.prescription_number || invoice.rx_number || "—"}</strong>
                </div>
                {invoice.is_prescription_verified && (
                  <div className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1 pt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>
                      Dispensed under Registered Pharmacist:{" "}
                      {invoice.pharmacist_name || invoice.verified_by_pharmacist_name || "Authorized"}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500 italic mt-1">
                General OTC dispensing. No prescription drugs in this bill.
              </div>
            )}
          </div>
        </div>

        {/* ================= MEDICINE LINE ITEMS TABLE ================= */}
        <div className="border border-slate-300 rounded-xl overflow-hidden mb-5 avoid-break">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-800 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-2.5 px-2.5 text-center w-8">#</th>
                <th className="py-2.5 px-3 min-w-[140px]">Medicine Description</th>
                <th className="py-2.5 px-2 font-mono text-center">HSN</th>
                <th className="py-2.5 px-2.5 font-mono">Batch / Expiry</th>
                <th className="py-2.5 px-2 text-center">Qty & Unit</th>
                <th className="py-2.5 px-2.5 text-right">Unit MRP</th>
                <th className="py-2.5 px-2.5 text-right">Taxable</th>
                <th className="py-2.5 px-2 text-center">GST %</th>
                <th className="py-2.5 px-2 text-right">CGST</th>
                <th className="py-2.5 px-2 text-right">SGST</th>
                {hasIgst && <th className="py-2.5 px-2 text-right">IGST</th>}
                <th className="py-2.5 px-3 text-right font-black">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoice.items && invoice.items.length > 0 ? (
                invoice.items.map((item, idx) => {
                  const unitPriceStr = item.unit_mrp || item.unit_price || item.mrp || "0.00";
                  const taxableStr = item.taxable_amount || item.taxable_value || "0.00";
                  const lineTotalStr = item.line_net || item.line_total || "0.00";
                  const isRx = item.prescription_class !== "otc";

                  return (
                    <tr key={item.id || idx} className="hover:bg-slate-50/50 break-inside-avoid">
                      <td className="py-2 px-2 text-center text-slate-500 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900 leading-snug">
                          {item.product_name}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500 font-mono mt-0.5">
                          {item.brand_name && <span>({item.brand_name})</span>}
                          {item.generic_name && <span>{item.generic_name}</span>}
                          {(item.product_sku || item.sku) && (
                            <span>SKU: {item.product_sku || item.sku}</span>
                          )}
                          {item.barcode && <span>Bar: {item.barcode}</span>}
                          {isRx && (
                            <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1 rounded uppercase">
                              {item.prescription_class.replace("_", " ")}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-600">
                        {item.hsn_code || "3004"}
                      </td>

                      <td className="py-2 px-2.5">
                        {item.batch_allocations && item.batch_allocations.length > 0 ? (
                          item.batch_allocations.map((ba, bi) => (
                            <div key={bi} className="font-mono text-[11px] text-slate-800 leading-tight">
                              <span className="font-bold">{ba.batch_number}</span>{" "}
                              <span className="text-slate-500">({ba.expiry_date})</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      <td className="py-2 px-2 text-center font-semibold text-slate-800">
                        {item.quantity}{" "}
                        <span className="text-[10px] text-slate-500 font-normal">
                          {item.unit_name || item.unit_type}
                        </span>
                      </td>

                      <td className="py-2 px-2.5 text-right font-mono text-slate-700">
                        {formatINR(unitPriceStr)}
                      </td>

                      <td className="py-2 px-2.5 text-right font-mono text-slate-700">
                        {formatINR(taxableStr)}
                      </td>

                      <td className="py-2 px-2 text-center font-mono text-slate-700">
                        {item.tax_rate}%
                      </td>

                      <td className="py-2 px-2 text-right font-mono text-slate-600 text-[11px]">
                        {formatINR(item.cgst_amount)}
                      </td>

                      <td className="py-2 px-2 text-right font-mono text-slate-600 text-[11px]">
                        {formatINR(item.sgst_amount)}
                      </td>

                      {hasIgst && (
                        <td className="py-2 px-2 text-right font-mono text-slate-600 text-[11px]">
                          {formatINR(item.igst_amount || "0.00")}
                        </td>
                      )}

                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {formatINR(lineTotalStr)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={hasIgst ? 12 : 11} className="py-6 text-center text-slate-400 italic">
                    No medicine items recorded on this invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ================= FINANCIAL TOTALS & PAYMENT SECTION ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-5 avoid-break">
          {/* Payment Method & Tender Breakdown */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Payment Settlement &amp; Tender Details
            </span>
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 space-y-2 text-xs">
              {invoice.payments && invoice.payments.length > 0 ? (
                invoice.payments.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className="flex justify-between items-center text-slate-800 pb-1.5 border-b border-slate-200 last:border-b-0 last:pb-0"
                  >
                    <span className="font-semibold flex items-center gap-1.5">
                      {p.payment_method === "CASH" ? (
                        <Banknote className="w-4 h-4 text-emerald-600" />
                      ) : p.payment_method === "UPI" ? (
                        <QrCode className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <CreditCard className="w-4 h-4 text-blue-600" />
                      )}
                      <span>{p.payment_method}</span>
                      {p.reference_number && (
                        <span className="font-mono text-[10px] text-slate-500 font-normal">
                          (Ref: {p.reference_number})
                        </span>
                      )}
                    </span>
                    <span className="font-mono font-bold">{formatINR(p.amount)}</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 italic text-[11px]">
                  Payment method: Counter settlement ({invoice.payment_status})
                </div>
              )}

              {/* Cash change info if returned */}
              {parseFloat(changeReturned) > 0 && (
                <div className="flex justify-between items-center text-emerald-800 font-semibold pt-1 border-t border-slate-200">
                  <span>Change Due / Returned to Customer:</span>
                  <span className="font-mono font-bold">{formatINR(changeReturned)}</span>
                </div>
              )}
            </div>

            <div className="text-[10px] text-slate-500 space-y-0.5 pt-1">
              <div>• All prices are inclusive of applicable GST as per Indian Retail Drugs Act.</div>
              <div>• Statutory tax breakup provided for input tax reconciliation.</div>
            </div>
          </div>

          {/* Right-Aligned Financial Calculation Summary */}
          <div className="space-y-1.5 text-xs text-slate-700 border border-slate-300 rounded-xl p-4 bg-slate-50/90 shadow-2xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Gross Amount (MRP Total):</span>
              <span className="font-mono font-bold text-slate-800">{formatINR(grossAmount)}</span>
            </div>

            {parseFloat(discountTotal) > 0 && (
              <div className="flex justify-between items-center text-emerald-700 font-semibold">
                <span>Special Bill Discount:</span>
                <span className="font-mono">-{formatINR(discountTotal)}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-1 border-t border-slate-200">
              <span className="text-slate-600">Taxable Value:</span>
              <span className="font-mono">{formatINR(taxableAmount)}</span>
            </div>

            <div className="flex justify-between items-center text-[11px] text-slate-500">
              <span>CGST (Central Tax):</span>
              <span className="font-mono">{formatINR(cgstAmount)}</span>
            </div>

            <div className="flex justify-between items-center text-[11px] text-slate-500">
              <span>SGST (State Tax):</span>
              <span className="font-mono">{formatINR(sgstAmount)}</span>
            </div>

            {hasIgst && (
              <div className="flex justify-between items-center text-[11px] text-slate-500">
                <span>IGST (Integrated Tax):</span>
                <span className="font-mono">{formatINR(igstAmount)}</span>
              </div>
            )}

            {parseFloat(roundOff) !== 0 && (
              <div className="flex justify-between items-center text-[11px] text-slate-500">
                <span>Round-off Adjustment:</span>
                <span className="font-mono">{parseFloat(roundOff) > 0 ? `+${formatINR(roundOff)}` : formatINR(roundOff)}</span>
              </div>
            )}

            {/* Net Amount Paid / Payable Banner */}
            <div className="flex justify-between items-center text-base font-black text-slate-900 pt-2 border-t-2 border-slate-800">
              <span className="uppercase tracking-tight text-xs sm:text-sm">Net Invoice Amount:</span>
              <span className="font-mono text-[#0F766E] text-lg sm:text-xl font-black">
                {formatINR(netTotal)}
              </span>
            </div>

            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 pt-1">
              <span>Total Amount Paid:</span>
              <span className="font-mono text-emerald-800 font-bold">{formatINR(paidAmount)}</span>
            </div>
          </div>
        </div>

        {/* ================= STATUTORY LEGAL FOOTER ================= */}
        <div className="border-t border-slate-200 pt-4 text-center space-y-1 text-[10px] text-slate-500 avoid-break">
          <p className="font-semibold text-slate-600">
            * Medicines once sold cannot be returned or exchanged without original cash memo and intact batch packaging.
          </p>
          <p>
            Schedule H, H1 &amp; X drugs dispensed strictly against a registered medical practitioner&apos;s prescription.
          </p>
          <p className="font-bold text-slate-700 pt-0.5">
            Thank you for visiting {orgName}. Wishing you a speedy recovery!
          </p>
          <p className="text-[9px] text-slate-400 font-mono">
            DiracPharma Pharmacy Management System &bull; Computer Generated Tax Invoice &bull; #{invoice.invoice_number}
          </p>
        </div>
      </div>
    </div>
  );
}

