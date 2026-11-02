"use client";

import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { RefreshCw, AlertCircle, ArrowLeft } from "lucide-react";
import { Invoice, getInvoiceDetailApi } from "@/lib/api";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { InvoicePrintDocument } from "@/components/invoice/InvoicePrintDocument";

function StandaloneInvoicePrintView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const invoiceId = params?.id as string;
  const autoPrint = searchParams.get("auto") === "true" || searchParams.get("print") === "true";

  const { activeStore, activeStoreId, organization } = useDashboard();
  const storeId = activeStore?.id || activeStoreId;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInvoice() {
      if (!invoiceId) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await getInvoiceDetailApi(storeId || "any", invoiceId);
        setInvoice(data);
      } catch (err: any) {
        console.error("Failed to load invoice for printing:", err);
        setError(err.message || "Failed to load invoice document.");
      } finally {
        setIsLoading(false);
      }
    }

    loadInvoice();
  }, [storeId, invoiceId]);

  // Trigger print automatically if requested once data is loaded
  useEffect(() => {
    if (invoice && autoPrint && !isLoading) {
      const timer = setTimeout(() => {
        window.print();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [invoice, autoPrint, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-[#0F766E] mb-3" />
        <p className="text-sm font-semibold text-slate-700">Loading invoice document...</p>
        <p className="text-xs text-slate-400 mt-1">Preparing high-resolution print view</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-rose-200 p-6 rounded-2xl shadow-sm max-w-md w-full text-center">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-1">Invoice Not Found</h2>
          <p className="text-xs text-slate-500 mb-4">{error || "The requested invoice could not be located."}</p>
          <button
            type="button"
            onClick={() => router.push("/dashboard/invoices")}
            className="px-4 py-2 bg-[#0F766E] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Invoices List</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <InvoicePrintDocument
      invoice={invoice}
      organization={organization}
      showActions={true}
      standalone={true}
      onClose={() => router.push("/dashboard/invoices")}
    />
  );
}

export default function InvoicePrintPage() {
  return (
    <DashboardProvider>
      <StandaloneInvoicePrintView />
    </DashboardProvider>
  );
}

