"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Layers,
  Package,
  Search,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  confirmProductImportApi,
  downloadProductImportErrorsApi,
  downloadProductImportTemplateApi,
  previewProductImportApi,
} from "@/lib/api";
import {
  ProductImportConfirmResponse,
  ProductImportPreviewResponse,
  ProductImportPreviewRow,
} from "@/types/dashboard";

type RowFilterTab = "ALL" | "READY" | "INVALID" | "DUPLICATE";

const PREVIEW_PAGE_SIZE = 50;

function ImportMedicinesContent() {
  const { user } = useDashboard();
  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const canManage = isOwner || role === "manager";

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>("");
  const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [preview, setPreview] = useState<ProductImportPreviewResponse | null>(null);
  const [confirmAttemptKey, setConfirmAttemptKey] = useState<string>("");
  const [completion, setCompletion] = useState<ProductImportConfirmResponse | null>(null);

  // Table filter & pagination state for large spreadsheets (500–5,000 rows)
  const [rowTab, setRowTab] = useState<RowFilterTab>("ALL");
  const [tableSearch, setTableSearch] = useState("");
  const [tablePage, setTablePage] = useState(1);

  const handleDownloadTemplate = async () => {
    setError(null);
    setIsDownloadingTemplate(true);
    try {
      await downloadProductImportTemplateApi();
    } catch (err: any) {
      setError(err?.message || "Could not download the sample Excel file.");
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileChosen = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setSuccessMsg(null);
    setCompletion(null);

    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xls")) {
      setError("Older .xls files cannot be opened directly. Please save your spreadsheet as .xlsx and upload it again.");
      return;
    }
    if (!lower.endsWith(".xlsx")) {
      setError("Please select an Excel (.xlsx) file.");
      return;
    }

    setSelectedFile(file);
    setIsUploading(true);
    setUploadProgressText("Checking columns, GST rates, packaging units, and existing medicines...");

    try {
      const res = await previewProductImportApi(file);
      setPreview(res);
      setConfirmAttemptKey(
        typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
      );
      setRowTab("ALL");
      setTableSearch("");
      setTablePage(1);
    } catch (err: any) {
      setPreview(null);
      setError(err?.message || "Could not read this Excel file. Please verify it matches the sample Excel layout.");
    } finally {
      setIsUploading(false);
      setUploadProgressText("");
    }
  };

  const handleDownloadErrors = async () => {
    const batchId = completion?.batch_id || preview?.batch_id;
    if (!batchId) return;
    setError(null);
    setIsDownloadingErrors(true);
    try {
      await downloadProductImportErrorsApi(batchId);
    } catch (err: any) {
      setError(err?.message || "Could not download the Excel error report.");
    } finally {
      setIsDownloadingErrors(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!preview || isImporting) return;
    setError(null);
    setIsImporting(true);
    try {
      const result = await confirmProductImportApi(preview.batch_id, confirmAttemptKey);
      setIsConfirmModalOpen(false);
      setCompletion(result);
      setSuccessMsg(
        result.imported_count > 0
          ? `${result.imported_count} medicine${result.imported_count === 1 ? "" : "s"} added to your catalogue.`
          : "No new medicines were added because all eligible rows matched existing medicines."
      );
    } catch (err: any) {
      setIsConfirmModalOpen(false);
      setError(err?.message || "Could not finish importing medicines. No changes were saved.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setCompletion(null);
    setError(null);
    setSuccessMsg(null);
    setRowTab("ALL");
    setTableSearch("");
    setTablePage(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const filteredRows = useMemo(() => {
    if (!preview) return [];
    const q = tableSearch.trim().toLowerCase();
    return preview.rows.filter((r) => {
      if (rowTab !== "ALL" && r.status !== rowTab) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.generic_name.toLowerCase().includes(q) ||
        r.brand_name.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.barcode.toLowerCase().includes(q) ||
        r.manufacturer.toLowerCase().includes(q)
      );
    });
  }, [preview, rowTab, tableSearch]);

  const totalPreviewPages = Math.max(1, Math.ceil(filteredRows.length / PREVIEW_PAGE_SIZE));
  const pagedRows = filteredRows.slice(
    (tablePage - 1) * PREVIEW_PAGE_SIZE,
    tablePage * PREVIEW_PAGE_SIZE
  );

  const renderStatusPill = (row: ProductImportPreviewRow) => {
    if (row.status === "READY") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          Ready
        </span>
      );
    }
    if (row.status === "DUPLICATE") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3 h-3" />
          Duplicate
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <XCircle className="w-3 h-3" />
        Needs Fix
      </span>
    );
  };

  return (
    <DashboardLayout
      title="Import Medicines from Excel"
      subtitle="Upload hundreds or thousands of medicine records into your pharmacy catalogue using our standardized Excel sheet."
      action={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/products">
            <Button variant="outline" size="sm" className="text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Back to Catalogue
            </Button>
          </Link>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              isLoading={isDownloadingTemplate}
              className="text-xs border-[#0F766E] text-[#0F766E] hover:bg-teal-50"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Download Sample Excel
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Shared Products Section Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
          <Link
            href="/dashboard/products"
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all flex items-center gap-2"
          >
            <Package className="w-3.5 h-3.5" />
            Medicine Catalog
          </Link>
          <Link
            href="/dashboard/products/import"
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-[#0F766E] text-white shadow-xs flex items-center gap-2"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Import Medicines from Excel
          </Link>
          <Link
            href="/dashboard/batches"
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all flex items-center gap-2"
          >
            <Layers className="w-3.5 h-3.5" />
            Batches &amp; Expiry (FEFO)
          </Link>
        </div>

        {!canManage && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-bold">Read-Only Catalogue Access</p>
              <p>
                Only Organization Owners and Store Managers can import new medicines into the catalogue. You can still view and search medicines for dispensing.
              </p>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {successMsg && (
          <Alert variant="success" onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </Alert>
        )}

        {canManage && completion && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-6 shadow-2xs space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 flex-shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Import Completed</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  File: <span className="font-semibold text-slate-800">{completion.file_name}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <span className="text-[11px] font-semibold text-emerald-800 uppercase">Medicines Added</span>
                <p className="text-2xl font-bold text-emerald-900 mt-1">{completion.imported_count}</p>
              </div>
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                <span className="text-[11px] font-semibold text-amber-800 uppercase">Duplicates Skipped</span>
                <p className="text-2xl font-bold text-amber-900 mt-1">{completion.skipped_duplicate_count}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-600 uppercase">Rows Not Imported (Errors)</span>
                <p className="text-2xl font-bold text-slate-900 mt-1">{completion.failed_count}</p>
              </div>
            </div>

            <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl text-xs text-teal-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-[#0F766E] mt-0.5 flex-shrink-0" />
              <span>
                Only medicine catalogue details were created. Opening stock, batches, expiry dates, and supplier bills are recorded separately under{" "}
                <Link href="/dashboard/purchases" className="font-bold underline">
                  Receive Deliveries
                </Link>
                .
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                {(completion.failed_count > 0 || completion.skipped_duplicate_count > 0) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadErrors}
                    isLoading={isDownloadingErrors}
                    className="text-xs border-rose-300 text-rose-700 hover:bg-rose-50"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Download Error Report (.xlsx)
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleReset} className="text-xs">
                  Import Another File
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/dashboard/purchases">
                  <Button variant="outline" size="sm" className="text-xs">
                    Go to Receive Deliveries
                  </Button>
                </Link>
                <Link href="/dashboard/products">
                  <Button variant="primary" size="sm" className="text-xs bg-[#0F766E] hover:bg-[#115E59]">
                    View Medicine Catalogue
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {canManage && !completion && (
          <>
            {/* Step 1: Download Sample & Upload File */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-50 text-[#0F766E] text-xs font-bold flex items-center justify-center border border-teal-200">
                    1
                  </span>
                  <h2 className="text-sm font-bold text-slate-900">Download Sample Excel</h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Start with our Excel template containing sample medicines and clear instructions. Required columns:
                </p>
                <ul className="text-xs text-slate-700 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <li>• <strong>Medicine Name</strong> (commercial name)</li>
                  <li>• <strong>Units Per Pack</strong> (whole number, e.g. 10)</li>
                  <li>• <strong>Base Unit</strong> (e.g. tablet, capsule, ml)</li>
                  <li>• <strong>GST Rate (%)</strong> (0, 5, 12, 18, or 28)</li>
                </ul>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  isLoading={isDownloadingTemplate}
                  className="w-full text-xs border-[#0F766E] text-[#0F766E] hover:bg-teal-50"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download Sample Excel (.xlsx)
                </Button>
              </div>

              <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-teal-50 text-[#0F766E] text-xs font-bold flex items-center justify-center border border-teal-200">
                      2
                    </span>
                    <h2 className="text-sm font-bold text-slate-900">Upload File</h2>
                  </div>
                  <span className="text-[11px] text-slate-500">Supports .xlsx files up to 5,000 rows (max 5 MB)</span>
                </div>

                <label
                  htmlFor="catalogue-excel-upload"
                  className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-[#0F766E] hover:bg-teal-50/30 transition-colors rounded-2xl p-6 cursor-pointer text-center"
                >
                  <div className="w-11 h-11 rounded-full bg-teal-50 text-[#0F766E] flex items-center justify-center mb-2">
                    <Upload className="w-5 h-5" />
                  </div>
                  {isUploading ? (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-[#0F766E]">Checking Excel File...</p>
                      <p className="text-[11px] text-slate-500">{uploadProgressText}</p>
                    </div>
                  ) : selectedFile ? (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-900">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {(selectedFile.size / 1024).toFixed(1)} KB — Click to choose a different .xlsx file
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-800">Click to select your medicine Excel (.xlsx) file</p>
                      <p className="text-[11px] text-slate-500">
                        We check every row first before adding anything to your catalogue.
                      </p>
                    </div>
                  )}
                  <input
                    id="catalogue-excel-upload"
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => handleFileChosen(e.target.files?.[0] || null)}
                    disabled={isUploading || isImporting}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Step 2 Preview Table & Summary */}
            {preview && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-white p-3.5 rounded-2xl border border-[#E2E8F0]">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Total Excel Rows</span>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">{preview.summary.total_rows}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-[#E2E8F0]">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Valid Records</span>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">{preview.summary.valid_rows}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-rose-200">
                    <span className="text-[10px] font-bold uppercase text-rose-700">Fix Errors</span>
                    <p className="text-xl font-bold text-rose-700 mt-0.5">{preview.summary.invalid_rows}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-amber-200">
                    <span className="text-[10px] font-bold uppercase text-amber-800">Possible Duplicates</span>
                    <p className="text-xl font-bold text-amber-800 mt-0.5">{preview.summary.duplicate_rows}</p>
                  </div>
                  <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200">
                    <span className="text-[10px] font-bold uppercase text-emerald-800">Ready for Import</span>
                    <p className="text-xl font-bold text-emerald-900 mt-0.5">{preview.summary.ready_to_import}</p>
                  </div>
                </div>

                {(preview.summary.invalid_rows > 0 || preview.summary.duplicate_rows > 0) && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 text-xs text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-bold">Some rows need attention before or after importing</p>
                        <p className="text-amber-900 mt-0.5">
                          Existing medicines are never overwritten automatically. Download the error report to review row numbers and reasons, or proceed to import only the{" "}
                          <strong>{preview.summary.ready_to_import}</strong> ready medicines and skip the rest.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadErrors}
                      isLoading={isDownloadingErrors}
                      className="text-xs border-amber-400 bg-white text-amber-900 hover:bg-amber-100 flex-shrink-0"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Download Error Report (.xlsx)
                    </Button>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: "ALL", label: `Review Medicines (${preview.rows.length})` },
                          { id: "READY", label: `Ready (${preview.summary.ready_to_import})` },
                          { id: "INVALID", label: `Fix Errors (${preview.summary.invalid_rows})` },
                          { id: "DUPLICATE", label: `Duplicates (${preview.summary.duplicate_rows})` },
                        ] as { id: RowFilterTab; label: string }[]
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setRowTab(tab.id);
                            setTablePage(1);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                            rowTab === tab.id
                              ? "bg-[#0F766E] text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={tableSearch}
                          onChange={(e) => {
                            setTableSearch(e.target.value);
                            setTablePage(1);
                          }}
                          placeholder="Filter preview rows..."
                          className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                        />
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        disabled={preview.summary.ready_to_import === 0 || isImporting}
                        onClick={() => setIsConfirmModalOpen(true)}
                        className="text-xs bg-[#0F766E] hover:bg-[#115E59]"
                      >
                        Import Medicines ({preview.summary.ready_to_import})
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                          <th className="py-2.5 px-3">Row #</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Medicine Name &amp; Generic</th>
                          <th className="py-2.5 px-3">Strength / Form</th>
                          <th className="py-2.5 px-3">Pack &amp; Unit</th>
                          <th className="py-2.5 px-3">GST %</th>
                          <th className="py-2.5 px-3">SKU / Barcode</th>
                          <th className="py-2.5 px-3">Notes / Errors</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagedRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400">
                              No rows match the selected filter.
                            </td>
                          </tr>
                        ) : (
                          pagedRows.map((row) => (
                            <tr
                              key={`${row.row_number}-${row.sku}-${row.name}`}
                              className={
                                row.status === "INVALID"
                                  ? "bg-rose-50/40"
                                  : row.status === "DUPLICATE"
                                  ? "bg-amber-50/40"
                                  : "hover:bg-slate-50"
                              }
                            >
                              <td className="py-2.5 px-3 font-mono text-slate-500">{row.row_number}</td>
                              <td className="py-2.5 px-3">{renderStatusPill(row)}</td>
                              <td className="py-2.5 px-3">
                                <p className="font-semibold text-slate-900">{row.name || "—"}</p>
                                <p className="text-[11px] text-slate-500">
                                  {row.generic_name || row.brand_name || row.manufacturer || "—"}
                                </p>
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">
                                {row.strength ? `${row.strength} • ` : ""}
                                <span className="capitalize">{row.dosage_form}</span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">
                                {row.conversion_factor} {row.base_unit} / {row.sale_unit}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-800">{row.gst_rate}%</td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                                <div>{row.sku || <span className="text-slate-400 italic">Auto-assigned</span>}</div>
                                {row.barcode && <div className="text-slate-400">{row.barcode}</div>}
                              </td>
                              <td className="py-2.5 px-3 max-w-xs">
                                {row.reason ? (
                                  <span
                                    className={
                                      row.status === "INVALID" ? "text-rose-700 font-medium" : "text-amber-800 font-medium"
                                    }
                                  >
                                    {row.reason}
                                  </span>
                                ) : (
                                  <span className="text-emerald-700">Valid and ready to add</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {totalPreviewPages > 1 && (
                    <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                      <span>
                        Page {tablePage} of {totalPreviewPages} ({filteredRows.length} rows)
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={tablePage <= 1}
                          onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                          className="text-xs"
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={tablePage >= totalPreviewPages}
                          onClick={() => setTablePage((p) => Math.min(totalPreviewPages, p + 1))}
                          className="text-xs"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      {isConfirmModalOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Confirm Catalogue Import</h3>
              <button
                type="button"
                disabled={isImporting}
                onClick={() => setIsConfirmModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
              <p>
                You are about to add <strong className="text-slate-900">{preview.summary.ready_to_import} medicines</strong> from{" "}
                <strong className="text-slate-900">{preview.file_name}</strong> into your pharmacy catalogue.
              </p>
              {(preview.summary.invalid_rows > 0 || preview.summary.duplicate_rows > 0) && (
                <p className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                  {preview.summary.duplicate_rows} duplicate row(s) and {preview.summary.invalid_rows} row(s) needing fixes will be skipped. Existing medicines will not be overwritten.
                </p>
              )}
              <p className="text-slate-500">No stock balances or purchase receipts will be changed.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                disabled={isImporting}
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isImporting}
                onClick={handleExecuteImport}
                className="text-xs bg-[#0F766E] hover:bg-[#115E59]"
              >
                Import Medicines ({preview.summary.ready_to_import})
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function ProductImportPage() {
  return (
    <DashboardProvider>
      <ImportMedicinesContent />
    </DashboardProvider>
  );
}
