"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Search,
  RefreshCw,
  Building2,
  Calendar,
  Truck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Eye,
  Trash2,
  Layers,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
  SlidersHorizontal,
  Check,
  PackageCheck,
  AlertTriangle,
  Info,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  GoodsReceipt,
  GoodsReceiptItem,
  Supplier,
  getGoodsReceiptsApi,
  getGoodsReceiptDetailApi,
  createGoodsReceiptApi,
  postGoodsReceiptApi,
  cancelGoodsReceiptApi,
  getSuppliersApi,
  getProductsApi,
  extractList,
} from "@/lib/api";
import { Product } from "@/types/dashboard";

export default function PurchasesPage() {
  return (
    <DashboardProvider>
      <PurchasesContent />
    </DashboardProvider>
  );
}

interface NewGRNLineItem {
  tempId: string;
  productId: string;
  productName: string;
  sku: string;
  baseUnit: string;
  saleUnit: string;
  conversionFactor: number;
  isLooseAllowed: boolean;
  batchNumber: string;
  expiryDate: string;
  manufacturingDate?: string;
  quantitySaleUnits: number;
  quantityLooseBaseUnits: number;
  purchaseCostPerSaleUnit: string;
  mrp: string;
  taxRate: string;
  intakeStatus: "VERIFIED" | "QUARANTINED";
  quarantineReason: string;
}

function PurchasesContent() {
  const { user, stores, activeStore, setActiveStoreId } = useDashboard();

  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Detail Modal
  const [selectedGrn, setSelectedGrn] = useState<GoodsReceipt | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Create GRN Modal - Guided 4-Step Intake Wizard
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [receiptDate, setReceiptDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState<string>("");
  const [lineItems, setLineItems] = useState<NewGRNLineItem[]>([]);
  const [isSubmittingGRN, setIsSubmittingGRN] = useState<boolean>(false);
  const [createModalError, setCreateModalError] = useState<string | null>(null);
  const [isLoadingModalData, setIsLoadingModalData] = useState<boolean>(false);

  // Adding line item sub-form
  const [itemProductId, setItemProductId] = useState<string>("");
  const [itemBatch, setItemBatch] = useState<string>("");
  const [itemExp, setItemExp] = useState<string>("");
  const [itemMfg, setItemMfg] = useState<string>("");
  const [itemSaleUnits, setItemSaleUnits] = useState<number>(1);
  const [itemLooseUnits, setItemLooseUnits] = useState<number>(0);
  const [itemCost, setItemCost] = useState<string>("");
  const [itemMrp, setItemMrp] = useState<string>("");
  const [itemTaxRate, setItemTaxRate] = useState<string>("0.00");
  const [itemIntakeStatus, setItemIntakeStatus] = useState<"VERIFIED" | "QUARANTINED">("VERIFIED");
  const [itemQuarantineReason, setItemQuarantineReason] = useState<string>("");

  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";
  const canManageGRN = isOwner || isManager;

  const currentStoreId = activeStore?.id || stores[0]?.id;

  const loadReceipts = async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: any = {
        page,
        page_size: pageSize,
      };
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getGoodsReceiptsApi(currentStoreId, params);
      setReceipts(extractList(res));
      setTotalCount(res?.count || 0);
    } catch (err: any) {
      console.error("Failed to load receipts:", err);
      setError(err.message || "Failed to load goods receipts.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReceipts();
  }, [currentStoreId, statusFilter, page]);

  // Load suppliers and products for create modal
  const loadModalData = async () => {
    setIsLoadingModalData(true);
    setCreateModalError(null);
    try {
      const [suppData, prodData] = await Promise.all([
        getSuppliersApi({ is_active: "true", page_size: 100 }),
        getProductsApi({ status: "active", page_size: 100 }),
      ]);
      const suppList = extractList<Supplier>(suppData);
      const prodList = extractList<Product>(prodData);
      setSuppliers(suppList);
      setProducts(prodList);
      if (suppList.length > 0) {
        setSelectedSupplierId(suppList[0].id);
      } else {
        setSelectedSupplierId("");
      }
    } catch (err: any) {
      console.error("Error pre-loading supplier/product data:", err);
      setCreateModalError(
        "Failed to load active suppliers and products. Please check your connection and retry."
      );
    } finally {
      setIsLoadingModalData(false);
    }
  };

  const openCreateModal = () => {
    setWizardStep(1);
    setCreateModalError(null);
    setSelectedSupplierId("");
    setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setReceiptDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setLineItems([]);
    resetLineItemForm();
    setCreateModalOpen(true);
    loadModalData();
  };

  const resetLineItemForm = () => {
    setItemProductId("");
    setItemBatch("");
    setItemExp("");
    setItemMfg("");
    setItemSaleUnits(1);
    setItemLooseUnits(0);
    setItemCost("");
    setItemMrp("");
    setItemTaxRate("0.00");
    setItemIntakeStatus("VERIFIED");
    setItemQuarantineReason("");
  };

  // Step 1 -> Step 2 validation
  const goToStep2 = () => {
    setCreateModalError(null);
    if (!selectedSupplierId) {
      setCreateModalError("Please select an active supplier distributor.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setCreateModalError("Supplier invoice number is required.");
      return;
    }
    if (!invoiceDate) {
      setCreateModalError("Supplier invoice date is required.");
      return;
    }
    setWizardStep(2);
  };

  // Step 2 -> Step 3 validation
  const goToStep3 = () => {
    setCreateModalError(null);
    if (lineItems.length === 0) {
      setCreateModalError("Please add at least one medicine line item to this delivery.");
      return;
    }
    setWizardStep(3);
  };

  // Step 3 -> Step 4 validation
  const goToStep4 = () => {
    setCreateModalError(null);
    const missingReason = lineItems.find(
      (it) => it.intakeStatus === "QUARANTINED" && !it.quarantineReason?.trim()
    );
    if (missingReason) {
      setCreateModalError(
        `Please specify the quarantine reason for "${missingReason.productName}".`
      );
      return;
    }
    setWizardStep(4);
  };

  const handleAddLineItem = () => {
    setCreateModalError(null);
    if (!itemProductId) {
      setCreateModalError("Please choose a medicine from the product catalog.");
      return;
    }
    const cleanBatch = itemBatch.trim().toUpperCase();
    if (!cleanBatch) {
      setCreateModalError("Batch number printed on the package is required.");
      return;
    }
    if (!itemExp) {
      setCreateModalError("Expiry date is required.");
      return;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    if (itemExp <= todayStr) {
      setCreateModalError("Expiry date must be in the future. Expired medicines cannot be accepted.");
      return;
    }
    const parsedCost = parseFloat(itemCost);
    if (isNaN(parsedCost) || parsedCost <= 0) {
      setCreateModalError("Purchase cost per pack must be greater than zero.");
      return;
    }
    const parsedMrp = parseFloat(itemMrp);
    if (isNaN(parsedMrp) || parsedMrp < 0) {
      setCreateModalError("Valid MRP per pack is required.");
      return;
    }
    if (itemSaleUnits === 0 && itemLooseUnits === 0) {
      setCreateModalError("Delivered quantity cannot be 0. Enter number of packs or loose units.");
      return;
    }
    if (itemIntakeStatus === "QUARANTINED" && !itemQuarantineReason.trim()) {
      setCreateModalError("Please enter a reason for placing this batch into quarantine.");
      return;
    }

    const prod = products.find((p) => p.id === itemProductId);
    if (!prod) return;

    const newLine: NewGRNLineItem = {
      tempId: Math.random().toString(36).substring(2),
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      baseUnit: prod.base_unit,
      saleUnit: prod.sale_unit,
      conversionFactor: prod.conversion_factor || 1,
      isLooseAllowed: prod.is_loose_dispensing_allowed,
      batchNumber: cleanBatch,
      expiryDate: itemExp,
      manufacturingDate: itemMfg || undefined,
      quantitySaleUnits: itemSaleUnits,
      quantityLooseBaseUnits: itemLooseUnits,
      purchaseCostPerSaleUnit: itemCost,
      mrp: itemMrp,
      taxRate: itemTaxRate || "0.00",
      intakeStatus: itemIntakeStatus,
      quarantineReason: itemQuarantineReason.trim(),
    };

    setLineItems([...lineItems, newLine]);
    resetLineItemForm();
  };

  const handleRemoveLineItem = (tempId: string) => {
    setLineItems(lineItems.filter((item) => item.tempId !== tempId));
  };

  const handleUpdateLineQuality = (
    tempId: string,
    status: "VERIFIED" | "QUARANTINED",
    reason?: string
  ) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.tempId === tempId) {
          return {
            ...item,
            intakeStatus: status,
            quarantineReason: status === "QUARANTINED" ? reason || item.quarantineReason : "",
          };
        }
        return item;
      })
    );
  };

  const handleSaveGRN = async (postDirectly: boolean = false) => {
    setCreateModalError(null);
    if (!currentStoreId) {
      setCreateModalError("Target store is required.");
      return;
    }
    if (!selectedSupplierId) {
      setCreateModalError("Supplier selection is required.");
      return;
    }
    const cleanInv = invoiceNumber.trim();
    if (!cleanInv) {
      setCreateModalError("Supplier invoice number is required.");
      return;
    }
    if (lineItems.length === 0) {
      setCreateModalError("At least one medicine item is required.");
      return;
    }

    setIsSubmittingGRN(true);
    try {
      const payload = {
        supplier_id: selectedSupplierId,
        supplier_invoice_number: cleanInv,
        supplier_invoice_date: invoiceDate,
        receipt_date: receiptDate,
        notes: notes.trim() || undefined,
        items: lineItems.map((item) => ({
          product_id: item.productId,
          batch_number: item.batchNumber,
          expiry_date: item.expiryDate,
          manufacturing_date: item.manufacturingDate || null,
          quantity_sale_units: item.quantitySaleUnits,
          quantity_loose_base_units: item.quantityLooseBaseUnits,
          purchase_cost_per_sale_unit: parseFloat(item.purchaseCostPerSaleUnit),
          mrp: parseFloat(item.mrp),
          tax_rate: parseFloat(item.taxRate) || 0,
          intake_status: item.intakeStatus,
          quarantine_reason: item.quarantineReason || undefined,
        })),
      };

      const created = await createGoodsReceiptApi(currentStoreId, payload);

      if (postDirectly) {
        try {
          await postGoodsReceiptApi(currentStoreId, created.id);
          setSuccessMessage(
            `Delivery ${created.grn_number} was successfully recorded and posted directly into active store stock.`
          );
        } catch (postErr: any) {
          console.error("Posting GRN error:", postErr);
          setSuccessMessage(
            `Delivery ${created.grn_number} was saved as Draft. Automatic posting to stock ledger failed: ${
              postErr.message || "Unknown error"
            }. You can review and post it from the list.`
          );
        }
      } else {
        setSuccessMessage(
          `Delivery ${created.grn_number} saved as Draft. You can review and post it to active stock when ready.`
        );
      }

      setCreateModalOpen(false);
      loadReceipts();
    } catch (err: any) {
      console.error("Create GRN error:", err);
      setCreateModalError(err.message || "Failed to record delivery.");
    } finally {
      setIsSubmittingGRN(false);
    }
  };

  const handleViewDetail = async (grn: GoodsReceipt) => {
    if (!currentStoreId) return;
    setIsLoadingDetail(true);
    try {
      const detail = await getGoodsReceiptDetailApi(currentStoreId, grn.id);
      setSelectedGrn(detail);
    } catch (err: any) {
      console.error("Failed to load GRN detail:", err);
      setError(err.message || "Failed to load receipt details.");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handlePostSelectedGRN = async () => {
    if (!selectedGrn || !currentStoreId) return;
    if (
      !confirm(
        `Confirm posting Delivery ${selectedGrn.grn_number} into active inventory? This will update stock counts and FIFO cost layers immediately.`
      )
    ) {
      return;
    }
    setIsPosting(true);
    try {
      const res = await postGoodsReceiptApi(currentStoreId, selectedGrn.id);
      setSuccessMessage(res.message || "Delivery posted into active stock successfully.");
      const updated = await getGoodsReceiptDetailApi(currentStoreId, selectedGrn.id);
      setSelectedGrn(updated);
      loadReceipts();
    } catch (err: any) {
      setError(err.message || "Failed to post delivery.");
    } finally {
      setIsPosting(false);
    }
  };

  const handleCancelSelectedGRN = async () => {
    if (!selectedGrn || !currentStoreId) return;
    const reason = prompt("Enter reason for cancelling this delivery receipt:");
    if (reason === null) return;
    setIsCancelling(true);
    try {
      const res = await cancelGoodsReceiptApi(currentStoreId, selectedGrn.id, reason);
      setSuccessMessage(res.message || "Delivery receipt cancelled.");
      const updated = await getGoodsReceiptDetailApi(currentStoreId, selectedGrn.id);
      setSelectedGrn(updated);
      loadReceipts();
    } catch (err: any) {
      setError(err.message || "Failed to cancel delivery receipt.");
    } finally {
      setIsCancelling(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "POSTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            In Available Stock
          </span>
        );
      case "DRAFT":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3 h-3 text-amber-500" />
            Draft (Needs Posting)
          </span>
        );
      case "SUBMITTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            Submitted for Review
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-500" />
            Cancelled
          </span>
        );
      default:
        return <span className="text-[10px] text-slate-500">{status}</span>;
    }
  };

  // Selected product details for real-time calculation in wizard step 2
  const selectedProductObj = products.find((p) => p.id === itemProductId);
  const conversionFactor = selectedProductObj?.conversion_factor || 1;
  const calculatedBaseUnits =
    itemSaleUnits * conversionFactor + (selectedProductObj?.is_loose_dispensing_allowed ? itemLooseUnits : 0);

  // Financial calculations for Step 4
  const estimatedSubtotal = lineItems.reduce((acc, it) => {
    const cost = parseFloat(it.purchaseCostPerSaleUnit) || 0;
    const factor = it.conversionFactor || 1;
    return acc + (it.quantitySaleUnits * cost + (cost / factor) * it.quantityLooseBaseUnits);
  }, 0);

  const estimatedTax = lineItems.reduce((acc, it) => {
    const cost = parseFloat(it.purchaseCostPerSaleUnit) || 0;
    const factor = it.conversionFactor || 1;
    const lineCost = it.quantitySaleUnits * cost + (cost / factor) * it.quantityLooseBaseUnits;
    const rate = parseFloat(it.taxRate) || 0;
    return acc + lineCost * (rate / 100);
  }, 0);

  const estimatedTotal = estimatedSubtotal + estimatedTax;

  const totalVerifiedCount = lineItems.filter((i) => i.intakeStatus === "VERIFIED").length;
  const totalQuarantineCount = lineItems.filter((i) => i.intakeStatus === "QUARANTINED").length;

  return (
    <DashboardLayout
      title="Receive Deliveries"
      subtitle="Record incoming medicine shipments, inspect batches, and post items directly into available pharmacy stock."
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadReceipts}
            isLoading={isLoading}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          {canManageGRN && (
            <Button
              variant="primary"
              size="sm"
              onClick={openCreateModal}
              className="text-xs bg-[#0F766E] hover:bg-[#115E59]"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Receive New Delivery
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Alerts */}
        {error && (
          <Alert variant="error">
            <div className="flex items-center justify-between">
              <span className="text-xs">{error}</span>
              <button
                type="button"
                onClick={loadReceipts}
                className="underline text-xs font-semibold ml-2"
              >
                Retry
              </button>
            </div>
          </Alert>
        )}

        {successMessage && (
          <Alert variant="success">
            <div className="flex items-center justify-between">
              <span className="text-xs">{successMessage}</span>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="text-xs font-semibold ml-2 hover:opacity-75"
              >
                Dismiss
              </button>
            </div>
          </Alert>
        )}

        {/* Informative Guidance Banner */}
        <div className="bg-teal-50/60 border border-teal-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-teal-900">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[#0F766E] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-teal-950">How Delivery Intake Works</p>
              <p className="text-[11px] text-teal-800 mt-0.5">
                When new medicine cartons arrive, verify vendor invoices and batch numbers. Saving as{" "}
                <span className="font-semibold">Draft</span> allows you to prepare without changing stock.{" "}
                <span className="font-semibold">Posting</span> adds items to your store’s active dispensing inventory.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/suppliers"
            className="text-[11px] text-[#0F766E] hover:underline font-semibold flex items-center gap-1 flex-shrink-0"
          >
            <Truck className="w-3.5 h-3.5" />
            Manage Distributors
          </Link>
        </div>

        {/* Filter & Search Bar with Segmented Status Tabs */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by Delivery #, invoice # or supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadReceipts()}
                className="w-full text-xs rounded-xl border border-slate-300 pl-9 pr-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            {/* Segmented Status Tabs */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs overflow-x-auto w-full md:w-auto">
              {[
                { key: "ALL", label: "All Deliveries" },
                { key: "DRAFT", label: "Drafts (Needs Posting)" },
                { key: "POSTED", label: "In Stock" },
                { key: "CANCELLED", label: "Cancelled" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.key);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    statusFilter === tab.key
                      ? "bg-white text-slate-900 shadow-2xs font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Deliveries Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#0F766E]" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Delivered Shipments ({totalCount})
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">
              Store: <span className="font-semibold text-slate-700">{activeStore?.name || "Active Store"}</span>
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <div className="w-6 h-6 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading deliveries...
            </div>
          ) : receipts.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">No deliveries found</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Record inward shipments when delivery vehicles drop off fresh medicine stock.
                </p>
              </div>
              {canManageGRN && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={openCreateModal}
                  className="text-xs bg-[#0F766E]"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Receive First Delivery
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Delivery # & Date</th>
                    <th className="py-3 px-4">Supplier & Invoice</th>
                    <th className="py-3 px-4">Medicines Received</th>
                    {receipts.some((r) => r.total_amount) && isOwner && (
                      <th className="py-3 px-4">Total Invoice</th>
                    )}
                    <th className="py-3 px-4">Received / Posted By</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {receipts.map((grn) => (
                    <tr key={grn.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 font-mono">{grn.grn_number}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          Received: {grn.receipt_date}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{grn.supplier_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Invoice: {grn.supplier_invoice_number} ({grn.supplier_invoice_date})
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {grn.items_count} item(s)
                        </span>
                      </td>
                      {receipts.some((r) => r.total_amount) && isOwner && (
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          {grn.total_amount ? `₹${parseFloat(grn.total_amount).toFixed(2)}` : "—"}
                        </td>
                      )}
                      <td className="py-3 px-4 text-[10px] text-slate-500">
                        {grn.posted_by_name ? (
                          <div className="text-emerald-700 font-medium">
                            Posted by: {grn.posted_by_name}
                          </div>
                        ) : grn.received_by_name ? (
                          <div>Intake by: {grn.received_by_name}</div>
                        ) : (
                          <div>—</div>
                        )}
                      </td>
                      <td className="py-3 px-4">{renderStatusBadge(grn.status)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetail(grn)}
                            className="text-[11px] h-7 px-2.5"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            {grn.status === "DRAFT" && canManageGRN ? "Review & Post" : "View"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {receipts.length > 0 && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing {receipts.length} of {totalCount} deliveries (Page {page} of{" "}
                {Math.max(1, Math.ceil(totalCount / pageSize))})
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * pageSize >= totalCount || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delivery Detail / Inspection Modal */}
      {selectedGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full overflow-hidden my-8">
            <div className="bg-gradient-to-r from-teal-800 to-teal-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-teal-200" />
                <div>
                  <h3 className="text-base font-bold font-mono leading-tight">
                    Delivery {selectedGrn.grn_number}
                  </h3>
                  <p className="text-xs text-teal-100/80">
                    Store: {selectedGrn.store_name} | {renderStatusBadge(selectedGrn.status)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGrn(null)}
                className="text-teal-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Header Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    Distributor / Supplier
                  </span>
                  <span className="font-bold text-slate-800">{selectedGrn.supplier_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    Invoice Number
                  </span>
                  <span className="font-mono text-slate-800">
                    {selectedGrn.supplier_invoice_number}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    Invoice Date
                  </span>
                  <span>{selectedGrn.supplier_invoice_date}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    Received Date
                  </span>
                  <span>{selectedGrn.receipt_date}</span>
                </div>
              </div>

              {selectedGrn.notes && (
                <div className="text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
                  <span className="font-semibold text-slate-800 block mb-0.5">Delivery Notes:</span>
                  {selectedGrn.notes}
                </div>
              )}

              {/* Status Banner */}
              {selectedGrn.status === "DRAFT" && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">This delivery is currently saved as a Draft.</span>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      These medicines are not yet available on pharmacy shelves. Once verified, click{" "}
                      <span className="font-semibold">"Post to Active Stock"</span> below to update inventory.
                    </p>
                  </div>
                </div>
              )}

              {selectedGrn.status === "POSTED" && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <span className="font-bold">Active in Pharmacy Stock.</span>
                    <span className="text-[11px] text-emerald-800 ml-1">
                      Batch stocks and FIFO cost layers are officially posted and ready for dispensing.
                    </span>
                  </div>
                </div>
              )}

              {/* Received Line Items */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Delivered Medicine Batches ({selectedGrn.items?.length || 0})
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-[10px] font-semibold text-slate-600 border-b border-slate-200">
                        <th className="py-2.5 px-3">Medicine</th>
                        <th className="py-2.5 px-3">Batch & Expiry</th>
                        <th className="py-2.5 px-3">Quantity Received</th>
                        <th className="py-2.5 px-3">MRP</th>
                        {isOwner && <th className="py-2.5 px-3">Cost / Line</th>}
                        <th className="py-2.5 px-3">Quality Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedGrn.items?.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-slate-900">{item.product_name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{item.sku}</p>
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            <p className="font-bold text-slate-800">{item.batch_number}</p>
                            <p className="text-[10px] text-slate-500">Exp: {item.expiry_date}</p>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-900">
                              {item.total_base_units} {item.base_unit}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              ({item.quantity_sale_units} {item.sale_unit}
                              {item.quantity_loose_base_units > 0
                                ? ` + ${item.quantity_loose_base_units} loose`
                                : ""}
                              )
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            ₹{parseFloat(item.mrp).toFixed(2)}
                            <span className="text-[10px] text-slate-400 block font-normal">
                              (₹{parseFloat(item.unit_mrp).toFixed(2)}/unit)
                            </span>
                          </td>
                          {isOwner && item.unit_cost && (
                            <td className="py-2.5 px-3 font-mono">
                              ₹{parseFloat(item.total_cost || "0").toFixed(2)}
                              <span className="text-[10px] text-slate-400 block font-normal">
                                (₹{parseFloat(item.unit_cost).toFixed(2)}/unit)
                              </span>
                            </td>
                          )}
                          <td className="py-2.5 px-3">
                            {item.intake_status === "QUARANTINED" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                <ShieldAlert className="w-3 h-3" />
                                Quarantined
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Verified
                              </span>
                            )}
                            {item.quarantine_reason && (
                              <p className="text-[10px] text-amber-800 mt-0.5">
                                Reason: {item.quarantine_reason}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Totals (Masked if not authorized) */}
              {isOwner && selectedGrn.total_amount && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-end">
                  <div className="w-64 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Taxable Amount:</span>
                      <span className="font-mono font-semibold">
                        ₹{parseFloat(selectedGrn.total_taxable_amount || "0").toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>GST / Tax:</span>
                      <span className="font-mono font-semibold">
                        ₹{parseFloat(selectedGrn.total_tax_amount || "0").toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1 text-sm">
                      <span>Total Invoice Amount:</span>
                      <span className="font-mono text-[#0F766E]">
                        ₹{parseFloat(selectedGrn.total_amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedGrn(null)}
                >
                  Close
                </Button>

                {selectedGrn.status === "DRAFT" && canManageGRN && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelSelectedGRN}
                      disabled={isPosting || isCancelling}
                      className="text-rose-600 border-rose-200 hover:bg-rose-50"
                    >
                      {isCancelling ? "Cancelling..." : "Cancel Delivery"}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handlePostSelectedGRN}
                      disabled={isPosting || isCancelling}
                      className="bg-[#0F766E] hover:bg-[#115E59]"
                    >
                      {isPosting ? "Posting to Stock..." : "Post to Active Stock"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guided 4-Step Intake Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full overflow-hidden my-8">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-800 to-teal-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Truck className="w-5 h-5 text-teal-200" />
                <div>
                  <h3 className="text-sm font-bold">Receive New Delivery (Goods Receipt)</h3>
                  <p className="text-[11px] text-teal-200/80">
                    Step {wizardStep} of 4 —{" "}
                    {wizardStep === 1
                      ? "Supplier & Invoice"
                      : wizardStep === 2
                      ? "Add Medicines & Batches"
                      : wizardStep === 3
                      ? "Quality Verification"
                      : "Review & Confirmation"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-teal-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Navigation Bar */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between text-xs">
              {[
                { step: 1, title: "1. Invoice Details" },
                { step: 2, title: "2. Medicines & Batches" },
                { step: 3, title: "3. Quality Check" },
                { step: 4, title: "4. Review & Post" },
              ].map((s) => (
                <div
                  key={s.step}
                  onClick={() => {
                    if (s.step < wizardStep) setWizardStep(s.step as any);
                  }}
                  className={`flex items-center gap-2 font-medium cursor-pointer transition-colors ${
                    wizardStep === s.step
                      ? "text-[#0F766E] font-bold"
                      : s.step < wizardStep
                      ? "text-slate-700 hover:text-[#0F766E]"
                      : "text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                      wizardStep === s.step
                        ? "bg-[#0F766E] text-white"
                        : s.step < wizardStep
                        ? "bg-teal-100 text-[#0F766E]"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {s.step < wizardStep ? "✓" : s.step}
                  </span>
                  <span className="hidden sm:inline">{s.title}</span>
                </div>
              ))}
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {createModalError && (
                <Alert variant="error">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">{createModalError}</span>
                    <button
                      type="button"
                      onClick={loadModalData}
                      disabled={isLoadingModalData}
                      className="underline text-xs font-semibold ml-2 hover:opacity-80"
                    >
                      {isLoadingModalData ? "Retrying..." : "Retry"}
                    </button>
                  </div>
                </Alert>
              )}

              {/* ================= STEP 1: SUPPLIER & INVOICE ================= */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-teal-50/50 border border-teal-100 rounded-xl p-3 text-xs text-teal-900">
                    <p className="font-semibold">Step 1: Identify Distributor & Paper Invoice</p>
                    <p className="text-[11px] text-teal-800 mt-0.5">
                      Select who delivered this shipment and record the physical invoice details.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Distributor / Supplier *
                        </label>
                        <Link
                          href="/dashboard/suppliers"
                          target="_blank"
                          className="text-[11px] text-[#0F766E] hover:underline font-semibold flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add New Distributor
                        </Link>
                      </div>

                      {isLoadingModalData ? (
                        <div className="flex items-center gap-2 p-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-500">
                          <div className="w-3.5 h-3.5 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
                          Loading active suppliers...
                        </div>
                      ) : suppliers.length === 0 ? (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            No registered suppliers found
                          </div>
                          <p className="text-[11px] text-amber-700">
                            You must register at least one distributor before receiving deliveries.
                          </p>
                          <div className="flex items-center gap-2">
                            <Link
                              href="/dashboard/suppliers"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#0F766E] text-white hover:bg-[#115E59]"
                            >
                              <Plus className="w-3 h-3" /> Add Supplier Now
                            </Link>
                            <button
                              type="button"
                              onClick={loadModalData}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                            >
                              Retry
                            </button>
                          </div>
                        </div>
                      ) : (
                        <select
                          value={selectedSupplierId}
                          onChange={(e) => setSelectedSupplierId(e.target.value)}
                          required
                          className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        >
                          <option value="">-- Choose Supplier / Distributor --</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.supplier_code})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Supplier Invoice # *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. INV-2026-991"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        className="w-full text-xs font-mono rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Invoice Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Date Received at Pharmacy *
                      </label>
                      <input
                        type="date"
                        required
                        value={receiptDate}
                        onChange={(e) => setReceiptDate(e.target.value)}
                        className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Delivery Notes (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Delivered by BlueDart Express, 3 cartons"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={goToStep2}
                      className="bg-[#0F766E] text-xs"
                    >
                      Next: Add Medicines & Batches
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ================= STEP 2: MEDICINES & BATCHES ================= */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="border border-teal-200 bg-teal-50/40 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-teal-200/60 pb-2">
                      <h4 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-[#0F766E]" />
                        Add Medicine to Shipment
                      </h4>
                      <span className="text-[11px] text-teal-700 font-medium">
                        Verify printed batch number & expiry
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-semibold text-slate-700">
                            Medicine *
                          </label>
                          <Link
                            href="/dashboard/products"
                            target="_blank"
                            className="text-[11px] text-[#0F766E] hover:underline font-semibold flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Product to Catalog
                          </Link>
                        </div>

                        {isLoadingModalData ? (
                          <div className="flex items-center gap-2 p-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-500">
                            <div className="w-3 h-3 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
                            Loading medicines...
                          </div>
                        ) : products.length === 0 ? (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                            <p className="text-[11px] text-amber-800 font-semibold flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              No active medicines registered
                            </p>
                            <Link
                              href="/dashboard/products"
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-[#0F766E] text-white hover:bg-[#115E59]"
                            >
                              <Plus className="w-3 h-3" /> Register Product
                            </Link>
                          </div>
                        ) : (
                          <select
                            value={itemProductId}
                            onChange={(e) => setItemProductId(e.target.value)}
                            className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                          >
                            <option value="">-- Choose Medicine from Catalog --</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.sku}) — {p.sale_unit} ({p.conversion_factor} {p.base_unit})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Batch Number *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. BATCH-2026-X1"
                          value={itemBatch}
                          onChange={(e) => setItemBatch(e.target.value.toUpperCase())}
                          className="w-full text-xs uppercase font-mono rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Expiry Date *
                        </label>
                        <input
                          type="date"
                          value={itemExp}
                          onChange={(e) => setItemExp(e.target.value)}
                          className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Manufacturing Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={itemMfg}
                          onChange={(e) => setItemMfg(e.target.value)}
                          className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Packs / Sale Units *
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={itemSaleUnits}
                          onChange={(e) =>
                            setItemSaleUnits(Math.max(0, parseInt(e.target.value) || 0))
                          }
                          className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      </div>

                      {selectedProductObj?.is_loose_dispensing_allowed && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Loose Units ({selectedProductObj.base_unit})
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={itemLooseUnits}
                            onChange={(e) =>
                              setItemLooseUnits(Math.max(0, parseInt(e.target.value) || 0))
                            }
                            className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Purchase Cost / Pack (₹) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="0.00"
                          value={itemCost}
                          onChange={(e) => setItemCost(e.target.value)}
                          className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          MRP / Pack (₹) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.00"
                          placeholder="0.00"
                          value={itemMrp}
                          onChange={(e) => setItemMrp(e.target.value)}
                          className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          GST / Tax Rate (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={itemTaxRate}
                          onChange={(e) => setItemTaxRate(e.target.value)}
                          className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      </div>
                    </div>

                    {/* Live Unit Conversion Indicator */}
                    {selectedProductObj && (
                      <div className="bg-white/80 p-2.5 rounded-lg border border-teal-200 text-xs flex items-center justify-between text-teal-900">
                        <div className="flex items-center gap-2">
                          <PackageCheck className="w-4 h-4 text-[#0F766E]" />
                          <span>
                            Packaging: <span className="font-semibold">1 {selectedProductObj.sale_unit}</span> ={" "}
                            <span className="font-semibold">{selectedProductObj.conversion_factor} {selectedProductObj.base_unit}</span>
                          </span>
                        </div>
                        <div className="font-bold text-[#0F766E]">
                          Total Stock Added: {calculatedBaseUnits} {selectedProductObj.base_unit}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleAddLineItem}
                        className="text-xs bg-[#0F766E]"
                      >
                        + Add Medicine to List
                      </Button>
                    </div>
                  </div>

                  {/* Line Items List */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Medicines Added So Far ({lineItems.length})
                    </h4>
                    {lineItems.length === 0 ? (
                      <p className="text-xs text-slate-400 p-4 border border-dashed rounded-xl text-center">
                        No medicines added yet. Use the form above to add medicines from the shipment.
                      </p>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-[10px] font-semibold text-slate-600 border-b border-slate-200">
                              <th className="py-2.5 px-3">Medicine</th>
                              <th className="py-2.5 px-3">Batch & Expiry</th>
                              <th className="py-2.5 px-3">Total Quantity</th>
                              <th className="py-2.5 px-3">Purchase Cost</th>
                              <th className="py-2.5 px-3">MRP</th>
                              <th className="py-2.5 px-3 text-right">Remove</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {lineItems.map((line) => (
                              <tr key={line.tempId} className="hover:bg-slate-50">
                                <td className="py-2.5 px-3">
                                  <p className="font-semibold text-slate-900">{line.productName}</p>
                                  <p className="text-[10px] text-slate-500 font-mono">{line.sku}</p>
                                </td>
                                <td className="py-2.5 px-3 font-mono">
                                  <p className="font-bold text-slate-800">{line.batchNumber}</p>
                                  <p className="text-[10px] text-slate-500">Exp: {line.expiryDate}</p>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="font-semibold text-slate-900">
                                    {line.quantitySaleUnits * line.conversionFactor + line.quantityLooseBaseUnits}{" "}
                                    {line.baseUnit}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block">
                                    ({line.quantitySaleUnits} {line.saleUnit}
                                    {line.quantityLooseBaseUnits > 0
                                      ? ` + ${line.quantityLooseBaseUnits} loose`
                                      : ""}
                                    )
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-mono">
                                  ₹{parseFloat(line.purchaseCostPerSaleUnit).toFixed(2)} / {line.saleUnit}
                                </td>
                                <td className="py-2.5 px-3 font-mono">
                                  ₹{parseFloat(line.mrp).toFixed(2)}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLineItem(line.tempId)}
                                    className="p-1 rounded-md text-rose-500 hover:bg-rose-50"
                                    title="Remove this line"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWizardStep(1)}
                    >
                      <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                      Back to Invoice
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={goToStep3}
                      disabled={lineItems.length === 0}
                      className="bg-[#0F766E] text-xs"
                    >
                      Next: Quality Check ({lineItems.length} items)
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ================= STEP 3: QUALITY VERIFICATION ================= */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="bg-teal-50/50 border border-teal-100 rounded-xl p-3 text-xs text-teal-900">
                    <p className="font-semibold">Step 3: Physical & Quality Inspection</p>
                    <p className="text-[11px] text-teal-800 mt-0.5">
                      Verify that packages are intact, labels are authentic, and cold-chain indicators are valid.
                      If any carton is damaged or compromised, mark it as <b>Hold in Quarantine</b> so it will not be sold.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {lineItems.map((line, idx) => (
                      <div
                        key={line.tempId}
                        className={`p-3.5 rounded-xl border transition-all text-xs ${
                          line.intakeStatus === "QUARANTINED"
                            ? "bg-amber-50/70 border-amber-300"
                            : "bg-slate-50/80 border-slate-200"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                          <div>
                            <span className="font-bold text-slate-900 text-sm">
                              {idx + 1}. {line.productName}
                            </span>
                            <span className="ml-2 font-mono text-[11px] text-slate-500">
                              Batch: {line.batchNumber} | Exp: {line.expiryDate}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateLineQuality(line.tempId, "VERIFIED")}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                                line.intakeStatus === "VERIFIED"
                                  ? "bg-emerald-600 text-white shadow-2xs"
                                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Verified (Ready for Shelves)
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateLineQuality(
                                  line.tempId,
                                  "QUARANTINED",
                                  line.quarantineReason || "Damaged outer packaging upon delivery"
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                                line.intakeStatus === "QUARANTINED"
                                  ? "bg-amber-600 text-white shadow-2xs"
                                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Hold in Quarantine
                            </button>
                          </div>
                        </div>

                        {line.intakeStatus === "QUARANTINED" && (
                          <div className="pt-2">
                            <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                              Quarantine Reason (Required for safety records) *
                            </label>
                            <input
                              type="text"
                              value={line.quarantineReason}
                              onChange={(e) =>
                                handleUpdateLineQuality(line.tempId, "QUARANTINED", e.target.value)
                              }
                              placeholder="e.g. Tamper seal broken, crushed packaging, or temperature excursion"
                              className="w-full text-xs rounded-lg border border-amber-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWizardStep(2)}
                    >
                      <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                      Back to Medicines
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={goToStep4}
                      className="bg-[#0F766E] text-xs"
                    >
                      Next: Final Review
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ================= STEP 4: REVIEW & POST ================= */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="bg-teal-50/50 border border-teal-100 rounded-xl p-3 text-xs text-teal-900">
                    <p className="font-semibold">Step 4: Final Verification & Confirmation</p>
                    <p className="text-[11px] text-teal-800 mt-0.5">
                      Review shipment details before submitting. You can save as a draft or immediately post into stock.
                    </p>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                      <span className="text-slate-400 uppercase text-[10px] font-semibold block">
                        Distributor
                      </span>
                      <p className="font-bold text-slate-800 text-sm">
                        {suppliers.find((s) => s.id === selectedSupplierId)?.name || "Selected Supplier"}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Invoice: #{invoiceNumber} ({invoiceDate})
                      </p>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                      <span className="text-slate-400 uppercase text-[10px] font-semibold block">
                        Medicines Count
                      </span>
                      <p className="font-bold text-slate-800 text-sm">{lineItems.length} Products</p>
                      <p className="text-[11px] text-slate-500">
                        {totalVerifiedCount} Verified & {totalQuarantineCount} Quarantined
                      </p>
                    </div>

                    {isOwner && (
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                        <span className="text-slate-400 uppercase text-[10px] font-semibold block">
                          Total Invoice Value
                        </span>
                        <p className="font-bold text-[#0F766E] font-mono text-sm">
                          ₹{estimatedTotal.toFixed(2)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          (Subtotal: ₹{estimatedSubtotal.toFixed(2)} + GST: ₹{estimatedTax.toFixed(2)})
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Decision Guidance Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <FileText className="w-4 h-4 text-slate-500" />
                        Save as Draft Delivery
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Saves this record in your delivery log. <b>Store stock counts will NOT change yet.</b> Your staff can review, verify, or edit this delivery before posting.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/50 space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-[#0F766E]">
                        <PackageCheck className="w-4 h-4 text-[#0F766E]" />
                        Confirm & Post to Available Stock
                      </div>
                      <p className="text-[11px] text-teal-800">
                        Immediately records inventory ledger movements, creates FIFO cost layers, and makes verified medicines available for sales dispensing.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWizardStep(3)}
                      disabled={isSubmittingGRN}
                    >
                      <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                      Back to Quality
                    </Button>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSaveGRN(false)}
                        disabled={isSubmittingGRN}
                      >
                        {isSubmittingGRN ? "Saving..." : "Save as Draft Delivery"}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => handleSaveGRN(true)}
                        disabled={isSubmittingGRN}
                        className="bg-[#0F766E] hover:bg-[#115E59]"
                      >
                        {isSubmittingGRN ? "Posting to Stock..." : "Confirm & Post to Stock"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
