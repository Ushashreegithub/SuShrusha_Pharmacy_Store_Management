"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Package,
  Layers,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Building2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useDashboard } from "@/context/DashboardContext";
import { getProductsApi, postOpeningStockApi, extractList } from "@/lib/api";
import { Product } from "@/types/dashboard";

interface OpeningStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultStoreId?: string;
}

export function OpeningStockModal({
  isOpen,
  onClose,
  onSuccess,
  defaultStoreId,
}: OpeningStockModalProps) {
  const { stores, activeStore } = useDashboard();

  // Target store
  const [storeId, setStoreId] = useState<string>(
    defaultStoreId || activeStore?.id || stores[0]?.id || ""
  );

  // Product selection
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [productSearch, setProductSearch] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form fields
  const [batchNumber, setBatchNumber] = useState<string>("");
  const [manufacturerName, setManufacturerName] = useState<string>("");
  const [manufacturingDate, setManufacturingDate] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [mrp, setMrp] = useState<string>("");
  const [purchaseCost, setPurchaseCost] = useState<string>("");
  const [quantitySaleUnits, setQuantitySaleUnits] = useState<number>(0);
  const [quantityLooseBaseUnits, setQuantityLooseBaseUnits] = useState<number>(0);
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(10);
  const [receiptReference, setReceiptReference] = useState<string>("");
  const [reason, setReason] = useState<string>("Initial store opening stock establishment");

  // State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successResult, setSuccessResult] = useState<any | null>(null);

  useEffect(() => {
    if (defaultStoreId) {
      setStoreId(defaultStoreId);
    } else if (activeStore?.id) {
      setStoreId(activeStore.id);
    }
  }, [defaultStoreId, activeStore]);

  // Load products when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setFieldErrors({});
      setSuccessResult(null);
      setIsLoadingProducts(true);
      getProductsApi({ status: "active", page_size: 100 })
        .then((res) => {
          setProducts(extractList(res));
        })
        .catch((err) => {
          console.error("Failed to load products for opening stock:", err);
        })
        .finally(() => {
          setIsLoadingProducts(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!storeId) {
      setError("Please select a target store branch.");
      return;
    }

    if (!selectedProduct) {
      setError("Please select a pharmaceutical product from the catalog.");
      return;
    }

    const cleanBatch = batchNumber.trim().toUpperCase();
    if (!cleanBatch) {
      setError("Batch number is required.");
      return;
    }

    if (!expiryDate) {
      setError("Expiry date is required.");
      return;
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (expiryDate <= todayStr) {
      setError("Expiry date must be in the future. Expired batches cannot be added as opening stock.");
      return;
    }

    const parsedMrp = parseFloat(mrp);
    if (isNaN(parsedMrp) || parsedMrp < 0) {
      setError("A valid Maximum Retail Price (MRP) is required.");
      return;
    }

    const parsedCost = parseFloat(purchaseCost);
    if (isNaN(parsedCost) || parsedCost <= 0) {
      setError("A valid Purchase Cost per sale unit (> 0) is mandatory to establish FIFO cost provenance.");
      return;
    }

    if (quantitySaleUnits === 0 && quantityLooseBaseUnits === 0) {
      setError("Total quantity cannot be zero. Enter sale packs or loose base units.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        product_id: selectedProduct.id,
        batch_number: cleanBatch,
        manufacturer_name: manufacturerName.trim() || undefined,
        manufacturing_date: manufacturingDate || null,
        expiry_date: expiryDate,
        mrp: parsedMrp,
        purchase_cost_per_sale_unit: parsedCost,
        quantity_sale_units: quantitySaleUnits,
        quantity_loose_base_units: quantityLooseBaseUnits,
        low_stock_threshold: lowStockThreshold,
        receipt_reference: receiptReference.trim() || undefined,
        reason: reason.trim() || undefined,
      };

      const result = await postOpeningStockApi(storeId, payload);
      setSuccessResult(result);
      onSuccess();
    } catch (err: any) {
      console.error("Opening stock submission error:", err);
      if (err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
      setError(err.message || "Failed to initialize opening stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setSelectedProduct(null);
    setBatchNumber("");
    setManufacturerName("");
    setManufacturingDate("");
    setExpiryDate("");
    setMrp("");
    setPurchaseCost("");
    setQuantitySaleUnits(0);
    setQuantityLooseBaseUnits(0);
    setReceiptReference("");
    setSuccessResult(null);
    setError(null);
    setFieldErrors({});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-800 to-teal-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-700/60 border border-teal-600/40">
              <Package className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Opening Stock Intake</h2>
              <p className="text-xs text-teal-100/80">
                Establish initial batch quantity & cost layer with audit provenance
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-teal-200 hover:text-white hover:bg-teal-700/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
          {error && (
            <Alert variant="error">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                <span className="text-xs font-medium text-rose-800">{error}</span>
              </div>
            </Alert>
          )}

          {successResult ? (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-5 text-center space-y-3">
              <div className="w-12 h-12 bg-teal-100 text-[#0F766E] rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Opening Stock Established Successfully</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Batch balance created with on-hand quantity of{" "}
                  <span className="font-semibold text-[#0F766E]">
                    {successResult.quantity_on_hand} base units
                  </span>
                  .
                </p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Movement Ref: {successResult.movement_id}
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={handleResetForm}>
                  Add Another Batch
                </Button>
                <Button variant="primary" size="sm" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Store Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Pharmacy Branch *
                </label>
                <div className="relative">
                  <select
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    required
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Product Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Product *
                </label>
                {selectedProduct ? (
                  <div className="flex items-center justify-between p-3 rounded-xl border border-teal-200 bg-teal-50/50">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{selectedProduct.name}</p>
                      <p className="text-[11px] text-slate-600">
                        SKU: <span className="font-mono">{selectedProduct.sku}</span> | Form:{" "}
                        {selectedProduct.dosage_form_display || selectedProduct.dosage_form} | Pack:{" "}
                        {selectedProduct.sale_unit} ({selectedProduct.conversion_factor} {selectedProduct.base_unit})
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedProduct(null)}
                      className="text-xs h-7"
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Search product by name, SKU or barcode..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="w-full text-xs rounded-xl border border-slate-300 pl-9 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                    </div>
                    <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-100 bg-white">
                      {isLoadingProducts ? (
                        <p className="text-xs text-slate-500 p-3 text-center">Loading products...</p>
                      ) : filteredProducts.length === 0 ? (
                        <p className="text-xs text-slate-500 p-3 text-center">No active products match search.</p>
                      ) : (
                        filteredProducts.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedProduct(p)}
                            className="w-full p-2.5 text-left text-xs hover:bg-teal-50/60 transition-colors flex items-center justify-between"
                          >
                            <div>
                              <span className="font-semibold text-slate-900">{p.name}</span>
                              <span className="text-slate-500 text-[10px] ml-2 font-mono">({p.sku})</span>
                            </div>
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              {p.sale_unit} ({p.conversion_factor})
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
                {fieldErrors.product_id && (
                  <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.product_id}</p>
                )}
              </div>

              {/* Batch Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Batch Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BATCH-2026-X1"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
                    className="w-full text-xs font-mono uppercase rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                  {fieldErrors.batch_number && (
                    <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.batch_number}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Manufacturer / Brand
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Cipla Ltd / Sun Pharma"
                    value={manufacturerName}
                    onChange={(e) => setManufacturerName(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Manufacturing Date
                  </label>
                  <input
                    type="date"
                    value={manufacturingDate}
                    onChange={(e) => setManufacturingDate(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                  {fieldErrors.expiry_date && (
                    <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.expiry_date}</p>
                  )}
                </div>
              </div>

              {/* Pricing & Cost Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    MRP per Sale Unit (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={mrp}
                    onChange={(e) => setMrp(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                  {fieldErrors.mrp && (
                    <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.mrp}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Purchase Cost per Sale Unit (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Net cost to establish FIFO layer"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                  {fieldErrors.purchase_cost_per_sale_unit && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      {fieldErrors.purchase_cost_per_sale_unit}
                    </p>
                  )}
                </div>
              </div>

              {/* Quantity Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Packs ({selectedProduct ? selectedProduct.sale_unit : "Sale Units"})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={quantitySaleUnits}
                    onChange={(e) => setQuantitySaleUnits(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Loose Units ({selectedProduct ? selectedProduct.base_unit : "Base Units"})
                  </label>
                  <input
                    type="number"
                    min="0"
                    disabled={selectedProduct ? !selectedProduct.is_loose_dispensing_allowed : false}
                    value={quantityLooseBaseUnits}
                    onChange={(e) =>
                      setQuantityLooseBaseUnits(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                  {selectedProduct && !selectedProduct.is_loose_dispensing_allowed && (
                    <p className="text-[10px] text-slate-400 mt-1">Loose dispensing disabled</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Low Stock Threshold
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={lowStockThreshold}
                    onChange={(e) =>
                      setLowStockThreshold(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>
              </div>

              {/* Summary Calculation */}
              {selectedProduct && (
                <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-200/60 text-xs flex items-center justify-between">
                  <span className="text-teal-900 font-medium">Calculated Initial On-Hand Stock:</span>
                  <span className="font-bold text-[#0F766E] text-sm">
                    {quantitySaleUnits * (selectedProduct.conversion_factor || 1) + quantityLooseBaseUnits}{" "}
                    {selectedProduct.base_unit}
                  </span>
                </div>
              )}

              {/* Optional Reference & Reason */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Document / Receipt Ref
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. OP-STOCK-2026-01"
                    value={receiptReference}
                    onChange={(e) => setReceiptReference(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Audit Notes
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSubmitting}
                  className="bg-[#0F766E] hover:bg-[#115E59]"
                >
                  Record Opening Stock
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
