"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Package,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Edit,
  Eye,
  Archive,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  X,
  FileText,
  Tag,
  Building2,
  Shield,
  Layers,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatusBadge } from "@/components/auth/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import {
  getProductsApi,
  getProductDetailApi,
  createProductApi,
  updateProductApi,
  archiveProductApi,
  reactivateProductApi,
  getProductMetadataApi,
  ApiError,
  extractList,
} from "@/lib/api";
import { Product, ProductCreatePayload, ProductMetadata } from "@/types/dashboard";

const DEFAULT_METADATA: ProductMetadata = {
  categories: [
    { value: "prescription_medicines", label: "Prescription Medicines" },
    { value: "otc_medicines", label: "OTC Medicines" },
    { value: "healthcare_devices", label: "Medical Supplies & Devices" },
    { value: "personal_care", label: "Personal Care & Hygiene" },
    { value: "baby_care", label: "Baby & Mother Care" },
    { value: "supplements_nutrition", label: "Vitamins & Supplements" },
    { value: "ayurvedic_herbal", label: "Ayurvedic & Herbal" },
    { value: "surgical_supplies", label: "Surgical & Wound Care" },
    { value: "diagnostic_kits", label: "Diagnostic & Testing" },
    { value: "other", label: "General / Other" },
  ],
  item_types: [
    { value: "medicine", label: "Medicine / Pharmaceutical" },
    { value: "device_equipment", label: "Medical Device / Equipment" },
    { value: "consumable", label: "Consumable / Supply" },
    { value: "personal_care", label: "Personal Care / Cosmetics" },
    { value: "wellness_supplement", label: "Wellness / Supplement" },
    { value: "general", label: "General Retail" },
  ],
  dosage_forms: [
    { value: "tablet", label: "Tablet" },
    { value: "capsule", label: "Capsule" },
    { value: "syrup", label: "Syrup / Liquid Oral" },
    { value: "suspension", label: "Suspension" },
    { value: "injection", label: "Injection" },
    { value: "ointment", label: "Ointment / Cream / Gel" },
    { value: "drops", label: "Eye / Ear / Nasal Drops" },
    { value: "inhaler", label: "Inhaler / Respules" },
    { value: "powder", label: "Powder / Granules" },
    { value: "lotion", label: "Lotion / Solution" },
    { value: "spray", label: "Spray" },
    { value: "suppository", label: "Suppository" },
    { value: "patch", label: "Transdermal Patch" },
    { value: "device", label: "Device / Sundry" },
    { value: "na", label: "Not Applicable" },
  ],
  prescription_classes: [
    { value: "otc", label: "Over The Counter (OTC)" },
    { value: "rx_general", label: "Prescription Only (Rx)" },
    { value: "schedule_h", label: "Schedule H (Prescription Required)" },
    { value: "schedule_h1", label: "Schedule H1 (Monitored Antibiotics/Psychotropics)" },
    { value: "schedule_x", label: "Schedule X (Strict Narcotic/Psychotropic)" },
    { value: "narcotic", label: "NDPS / Controlled Substance" },
  ],
  units: [
    { value: "tablet", label: "Tablet" },
    { value: "capsule", label: "Capsule" },
    { value: "strip", label: "Strip" },
    { value: "bottle", label: "Bottle" },
    { value: "box", label: "Box" },
    { value: "vial", label: "Vial" },
    { value: "ampoule", label: "Ampoule" },
    { value: "tube", label: "Tube" },
    { value: "piece", label: "Piece" },
    { value: "pack", label: "Pack" },
    { value: "sachet", label: "Sachet" },
    { value: "can", label: "Can / Tin" },
    { value: "jar", label: "Jar" },
    { value: "kit", label: "Kit" },
    { value: "ml", label: "ml" },
    { value: "gm", label: "gm" },
    { value: "unit", label: "Unit" },
  ],
  storage_conditions: [
    { value: "room_temperature", label: "Store at Room Temperature (15-25°C)" },
    { value: "cool_dry", label: "Store in Cool & Dry Place" },
    { value: "refrigerated", label: "Refrigerate (2-8°C) - Do Not Freeze" },
    { value: "frozen", label: "Keep Frozen (below -10°C)" },
    { value: "protect_from_light", label: "Protect from Direct Sunlight" },
  ],
};

function ProductsContent() {
  const { user } = useDashboard();

  // Role permissions
  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";
  const canManage = isOwner || isManager;

  // Metadata from backend
  const [metadata, setMetadata] = useState<ProductMetadata>(DEFAULT_METADATA);

  // Listing state
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters & Pagination state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [ordering, setOrdering] = useState("name");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Form Modal State (Add / Edit)
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formTab, setFormTab] = useState<"basic" | "medical" | "packaging" | "commercial">("basic");
  const [formLoading, setFormLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formGeneralError, setFormGeneralError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [genericName, setGenericName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [itemType, setItemType] = useState("medicine");
  const [category, setCategory] = useState("prescription_medicines");
  const [manufacturer, setManufacturer] = useState("");
  const [strength, setStrength] = useState("");
  const [dosageForm, setDosageForm] = useState("tablet");
  const [prescriptionClass, setPrescriptionClass] = useState("otc");
  const [isNarcotic, setIsNarcotic] = useState(false);
  const [packDescription, setPackDescription] = useState("");
  const [baseUnit, setBaseUnit] = useState("tablet");
  const [saleUnit, setSaleUnit] = useState("strip");
  const [conversionFactor, setConversionFactor] = useState(10);
  const [isLooseDispensing, setIsLooseDispensing] = useState(true);
  const [gstRate, setGstRate] = useState("12.00");
  const [storageCondition, setStorageCondition] = useState("room_temperature");
  const [description, setDescription] = useState("");

  // Product Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  // Archive / Reactivate Action State
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load Metadata
  useEffect(() => {
    async function loadMeta() {
      try {
        const meta = await getProductMetadataApi();
        setMetadata(meta);
      } catch (err) {
        // Fall back to DEFAULT_METADATA
      }
    }
    loadMeta();
  }, []);

  // Fetch Products
  const loadProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getProductsApi({
        search: debouncedSearch.trim() || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        item_type: itemTypeFilter !== "all" ? itemTypeFilter : undefined,
        status: statusFilter,
        ordering,
        page,
        page_size: pageSize,
      });
      setProducts(extractList(data));
      setTotalPages(data?.total_pages || 1);
      setTotalCount(data?.count || 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load product catalog.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [debouncedSearch, categoryFilter, itemTypeFilter, statusFilter, ordering, page, pageSize]);

  // Open Add Product Modal
  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setName("");
    setBrandName("");
    setGenericName("");
    setSku("");
    setBarcode("");
    setHsnCode("");
    setItemType("medicine");
    setCategory("prescription_medicines");
    setManufacturer("");
    setStrength("");
    setDosageForm("tablet");
    setPrescriptionClass("otc");
    setIsNarcotic(false);
    setPackDescription("Strip of 10 tablets");
    setBaseUnit("tablet");
    setSaleUnit("strip");
    setConversionFactor(10);
    setIsLooseDispensing(true);
    setGstRate("12.00");
    setStorageCondition("room_temperature");
    setDescription("");
    setFormTab("basic");
    setFormErrors({});
    setFormGeneralError(null);
    setFormModalOpen(true);
  };

  // Open Edit Product Modal
  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setBrandName(p.brand_name || "");
    setGenericName(p.generic_name || "");
    setSku(p.sku);
    setBarcode(p.barcode || "");
    setHsnCode(p.hsn_code || "");
    setItemType(p.item_type || "medicine");
    setCategory(p.category || "prescription_medicines");
    setManufacturer(p.manufacturer || "");
    setStrength(p.strength || "");
    setDosageForm(p.dosage_form || "tablet");
    setPrescriptionClass(p.prescription_class || "otc");
    setIsNarcotic(Boolean(p.is_narcotic));
    setPackDescription(p.pack_description || "");
    setBaseUnit(p.base_unit || "tablet");
    setSaleUnit(p.sale_unit || "strip");
    setConversionFactor(p.conversion_factor || 1);
    setIsLooseDispensing(Boolean(p.is_loose_dispensing_allowed));
    setGstRate(String(p.gst_rate || "12.00"));
    setStorageCondition(p.storage_condition || "room_temperature");
    setDescription(p.description || "");
    setFormTab("basic");
    setFormErrors({});
    setFormGeneralError(null);
    setFormModalOpen(true);
  };

  // Open Detail Modal
  const handleOpenDetailModal = (p: Product) => {
    setActiveProduct(p);
    setDetailModalOpen(true);
  };

  // Submit Add or Edit Product Form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormGeneralError(null);
    const errs: Record<string, string> = {};

    if (!name.trim()) errs.name = "Product name is required.";
    if (!sku.trim()) errs.sku = "SKU identifier is required.";
    if (conversionFactor < 1) errs.conversion_factor = "Conversion factor must be 1 or higher.";
    if (isNaN(Number(gstRate)) || Number(gstRate) < 0) errs.gst_rate = "Please enter a valid GST tax rate.";

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    setFormErrors({});
    setFormLoading(true);

    const payload: ProductCreatePayload = {
      name: name.trim(),
      brand_name: brandName.trim(),
      generic_name: genericName.trim(),
      sku: sku.trim().toUpperCase(),
      barcode: barcode.trim(),
      hsn_code: hsnCode.trim(),
      item_type: itemType,
      category,
      manufacturer: manufacturer.trim(),
      strength: strength.trim(),
      dosage_form: itemType === "medicine" ? dosageForm : "na",
      prescription_class: itemType === "medicine" ? prescriptionClass : "otc",
      is_narcotic: isNarcotic,
      pack_description: packDescription.trim(),
      base_unit: baseUnit,
      sale_unit: saleUnit,
      conversion_factor: Number(conversionFactor),
      is_loose_dispensing_allowed: isLooseDispensing,
      gst_rate: Number(gstRate),
      storage_condition: storageCondition,
      description: description.trim(),
    };

    try {
      if (editingProduct) {
        const updated = await updateProductApi(editingProduct.id, payload);
        setSuccessMsg(`Product "${updated.name}" updated successfully.`);
        if (activeProduct && activeProduct.id === updated.id) {
          setActiveProduct(updated);
        }
      } else {
        const created = await createProductApi(payload);
        setSuccessMsg(`Product "${created.name}" created successfully.`);
      }
      setFormModalOpen(false);
      await loadProducts();
    } catch (err: any) {
      if (err instanceof ApiError && err.fieldErrors) {
        setFormErrors(err.fieldErrors);
      } else {
        setFormGeneralError(err?.message || "Failed to save product. Please verify fields and try again.");
      }
    } finally {
      setFormLoading(false);
    }
  };

  // Toggle Archive / Reactivate
  const handleToggleArchive = async (p: Product) => {
    setActionLoadingId(p.id);
    try {
      if (p.is_active) {
        await archiveProductApi(p.id);
        setSuccessMsg(`Product "${p.name}" has been archived.`);
      } else {
        await reactivateProductApi(p.id);
        setSuccessMsg(`Product "${p.name}" has been reactivated.`);
      }
      if (activeProduct && activeProduct.id === p.id) {
        setActiveProduct({ ...p, is_active: !p.is_active });
      }
      await loadProducts();
    } catch (err: any) {
      setError(err?.message || "Failed to update product active state.");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <DashboardLayout
      title="Find Medicines & Stock"
      subtitle="Search medications, check store stock balances, view active batches & expiry dates, and manage product catalog details."
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadProducts}
            isLoading={isLoading}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          {canManage && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenAddModal}
              className="text-xs bg-[#0F766E] hover:bg-[#115E59]"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Product
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Navigation Tabs between Product Master and Batches & Expiry */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <Link
            href="/dashboard/products"
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-[#0F766E] text-white shadow-xs flex items-center gap-2"
          >
            <Package className="w-3.5 h-3.5" />
            Medicine Catalog
          </Link>
          <Link
            href="/dashboard/batches"
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all flex items-center gap-2"
          >
            <Layers className="w-3.5 h-3.5" />
            Batches & Expiry (FEFO)
          </Link>
        </div>
        {/* Alerts */}
        {successMsg && (
          <Alert variant="success" onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </Alert>
        )}
        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Read-Only Notice for Pharmacy Staff */}
        {!canManage && (
          <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-900 flex items-center gap-2">
            <Info className="w-4 h-4 text-[#0F766E] flex-shrink-0" />
            <span>
              <strong>Catalog Access: Read-only.</strong> Pharmacy staff can search and reference products for dispensing. Only organization owners and store managers can add or edit products.
            </span>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Box */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Search by product name, generic formulation, brand, SKU, barcode, or manufacturer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Category Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium hidden sm:inline">Category:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-2.5 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                >
                  <option value="all">All Categories</option>
                  {metadata.categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium hidden sm:inline">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as any);
                    setPage(1);
                  }}
                  className="px-2.5 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                >
                  <option value="active">Active Only</option>
                  <option value="archived">Archived</option>
                  <option value="all">All Statuses</option>
                </select>
              </div>

              {/* Sort Order */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium hidden sm:inline">Sort:</span>
                <select
                  value={ordering}
                  onChange={(e) => setOrdering(e.target.value)}
                  className="px-2.5 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                >
                  <option value="name">Name (A-Z)</option>
                  <option value="-name">Name (Z-A)</option>
                  <option value="sku">SKU Code</option>
                  <option value="-created_at">Recently Added</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <span>
              Showing {products.length} of {totalCount} product{totalCount === 1 ? "" : "s"}
            </span>
            {canManage && (
              <span className="font-medium text-[#0F766E]">
                Organization-wide catalog definition
              </span>
            )}
          </div>
        </div>

        {/* Product Table */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#0F766E] mx-auto" />
              <p>Loading product master catalog...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 text-[#0F766E] flex items-center justify-center mx-auto">
                <Package className="w-6 h-6" />
              </div>
              <div className="max-w-sm mx-auto space-y-1">
                <h3 className="text-sm font-bold text-slate-900">No Products Found</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {search || categoryFilter !== "all" || statusFilter !== "active"
                    ? "No products match your current search and filter criteria. Try clearing filters."
                    : "No products exist in your catalog yet. Add your first pharmaceutical or OTC product to begin."}
                </p>
              </div>
              {canManage && (
                <div className="pt-2">
                  <Button variant="primary" size="sm" onClick={handleOpenAddModal} className="text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add First Product
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-[#E2E8F0] text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Product Name &amp; Details</th>
                    <th className="px-5 py-3">Generic / Formulation</th>
                    <th className="px-5 py-3">SKU &amp; Barcode</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Packaging &amp; Units</th>
                    <th className="px-5 py-3">Tax (GST)</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => {
                    const isRx = p.prescription_class && p.prescription_class !== "otc";
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Name & Brand */}
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetailModal(p)}
                            className="text-left font-bold text-slate-900 hover:text-[#0F766E] transition-colors block"
                          >
                            {p.name}
                          </button>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {p.brand_name && (
                              <span className="text-[11px] font-medium text-slate-600">
                                {p.brand_name}
                              </span>
                            )}
                            {p.manufacturer && (
                              <span className="text-[10px] text-slate-400">
                                • {p.manufacturer}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Generic / API */}
                        <td className="px-5 py-3.5">
                          {p.generic_name ? (
                            <div>
                              <span className="font-medium text-slate-800">{p.generic_name}</span>
                              {p.strength && (
                                <span className="text-[11px] text-slate-500 block font-mono">
                                  {p.strength}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Non-formulation item</span>
                          )}
                        </td>

                        {/* SKU & Barcode */}
                        <td className="px-5 py-3.5 font-mono text-[11px]">
                          <span className="font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {p.sku}
                          </span>
                          {p.barcode && (
                            <span className="text-slate-500 block mt-0.5 text-[10px]">
                              {p.barcode}
                            </span>
                          )}
                        </td>

                        {/* Category & Classification */}
                        <td className="px-5 py-3.5">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {p.category_display || p.category}
                          </span>
                          <div className="mt-1">
                            {isRx ? (
                              <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                                {p.prescription_class_display || "Rx"}
                              </span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                OTC
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Packaging & Unit Conversion */}
                        <td className="px-5 py-3.5 text-[11px] text-slate-600">
                          <span className="font-medium text-slate-900 block">
                            {p.pack_description || `${p.sale_unit} of ${p.conversion_factor} ${p.base_unit}s`}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            1 {p.sale_unit} = {p.conversion_factor} {p.base_unit}(s)
                          </span>
                        </td>

                        {/* GST % */}
                        <td className="px-5 py-3.5 font-mono text-[11px] font-semibold text-slate-700">
                          {p.gst_rate}%
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <StatusBadge
                            status={p.is_active ? "active" : "inactive"}
                            label={p.is_active ? "Active" : "Archived"}
                          />
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => handleOpenDetailModal(p)}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title="View details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(p)}
                                className="p-1 rounded text-[#0F766E] hover:text-teal-900 hover:bg-teal-50 transition-colors"
                                title="Edit product"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleArchive(p)}
                                disabled={actionLoadingId === p.id}
                                className={`p-1 rounded transition-colors ${
                                  p.is_active
                                    ? "text-rose-600 hover:text-rose-900 hover:bg-rose-50"
                                    : "text-emerald-600 hover:text-emerald-900 hover:bg-emerald-50"
                                }`}
                                title={p.is_active ? "Archive product" : "Reactivate product"}
                              >
                                {p.is_active ? (
                                  <Archive className="w-3.5 h-3.5" />
                                ) : (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-6 py-3 bg-slate-50 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-slate-600">
              <div>
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page <= 1}
                  className="text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="text-xs"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ADD / EDIT PRODUCT MODAL                                                  */}
      {/* ========================================================================= */}
      {formModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl max-w-2xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingProduct ? `Edit Product: ${editingProduct.name}` : "Add New Product to Catalog"}
                </h3>
                <p className="text-xs text-slate-500">
                  Define the product master record. Batch numbers, expiry, and stock quantities are recorded during stock receiving.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formGeneralError && (
              <Alert variant="error" onClose={() => setFormGeneralError(null)}>
                {formGeneralError}
              </Alert>
            )}

            {/* Modal Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setFormTab("basic")}
                className={`px-3 py-2 font-semibold border-b-2 transition-colors ${
                  formTab === "basic"
                    ? "border-[#0F766E] text-[#0F766E]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                1. Identification
              </button>
              <button
                type="button"
                onClick={() => setFormTab("medical")}
                className={`px-3 py-2 font-semibold border-b-2 transition-colors ${
                  formTab === "medical"
                    ? "border-[#0F766E] text-[#0F766E]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                2. Formulation &amp; Rx
              </button>
              <button
                type="button"
                onClick={() => setFormTab("packaging")}
                className={`px-3 py-2 font-semibold border-b-2 transition-colors ${
                  formTab === "packaging"
                    ? "border-[#0F766E] text-[#0F766E]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                3. Packaging &amp; Units
              </button>
              <button
                type="button"
                onClick={() => setFormTab("commercial")}
                className={`px-3 py-2 font-semibold border-b-2 transition-colors ${
                  formTab === "commercial"
                    ? "border-[#0F766E] text-[#0F766E]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                4. Tax &amp; Storage
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* TAB 1: IDENTIFICATION */}
              {formTab === "basic" && (
                <div className="space-y-3">
                  <Input
                    label="Commercial Product Name"
                    placeholder="e.g. Paracetamol 500mg Tablets"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: "" }));
                    }}
                    error={formErrors.name}
                    required
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Brand / Trade Name"
                      placeholder="e.g. Crocin Advance"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      error={formErrors.brand_name}
                      helperText="Optional commercial trademark"
                    />

                    <Input
                      label="Manufacturer / Pharma Co."
                      placeholder="e.g. GlaxoSmithKline / Cipla"
                      value={manufacturer}
                      onChange={(e) => setManufacturer(e.target.value)}
                      error={formErrors.manufacturer}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Stock Keeping Unit (SKU)"
                      placeholder="e.g. MED-PARA-500"
                      value={sku}
                      onChange={(e) => {
                        setSku(e.target.value.toUpperCase());
                        if (formErrors.sku) setFormErrors((prev) => ({ ...prev, sku: "" }));
                      }}
                      error={formErrors.sku}
                      helperText="Unique identifier within your organization"
                      required
                    />

                    <Input
                      label="Barcode (EAN / UPC / GTIN)"
                      placeholder="e.g. 8901030000001"
                      value={barcode}
                      onChange={(e) => {
                        setBarcode(e.target.value);
                        if (formErrors.barcode) setFormErrors((prev) => ({ ...prev, barcode: "" }));
                      }}
                      error={formErrors.barcode}
                      helperText="Leave blank if product has no barcode"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Product Item Type
                      </label>
                      <select
                        value={itemType}
                        onChange={(e) => setItemType(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                      >
                        {metadata.item_types.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Product Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                      >
                        {metadata.categories.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: MEDICAL & FORMULATION */}
              {formTab === "medical" && (
                <div className="space-y-3">
                  <Input
                    label="Active Pharmaceutical Ingredient (Generic Formulation)"
                    placeholder="e.g. Paracetamol / Acetaminophen"
                    value={genericName}
                    onChange={(e) => setGenericName(e.target.value)}
                    error={formErrors.generic_name}
                    helperText="Important for prescription matching & generic substitution"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Strength / Potency"
                      placeholder="e.g. 500 mg, 10 mg/ml"
                      value={strength}
                      onChange={(e) => setStrength(e.target.value)}
                      error={formErrors.strength}
                    />

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Dosage Form
                      </label>
                      <select
                        value={dosageForm}
                        onChange={(e) => setDosageForm(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                      >
                        {metadata.dosage_forms.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Prescription Classification
                      </label>
                      <select
                        value={prescriptionClass}
                        onChange={(e) => setPrescriptionClass(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                      >
                        {metadata.prescription_classes.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 pt-6">
                      <input
                        type="checkbox"
                        id="narcotic_check"
                        checked={isNarcotic}
                        onChange={(e) => setIsNarcotic(e.target.checked)}
                        className="w-4 h-4 text-[#0F766E] border-slate-300 rounded focus:ring-[#0F766E]"
                      />
                      <label htmlFor="narcotic_check" className="text-xs font-semibold text-slate-700">
                        NDPS / Controlled Narcotic Item
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: PACKAGING & UNITS */}
              {formTab === "packaging" && (
                <div className="space-y-3">
                  <Input
                    label="Pack Description"
                    placeholder="e.g. Strip of 10 tablets, Bottle of 100 ml"
                    value={packDescription}
                    onChange={(e) => setPackDescription(e.target.value)}
                    error={formErrors.pack_description}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Sale Unit (Dispensed)
                      </label>
                      <select
                        value={saleUnit}
                        onChange={(e) => setSaleUnit(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                      >
                        {metadata.units.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Base Stock Unit (Atomic)
                      </label>
                      <select
                        value={baseUnit}
                        onChange={(e) => setBaseUnit(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                      >
                        {metadata.units.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Input
                      label="Conversion Factor"
                      type="number"
                      min={1}
                      value={conversionFactor}
                      onChange={(e) => setConversionFactor(Math.max(1, parseInt(e.target.value) || 1))}
                      error={formErrors.conversion_factor}
                      helperText={`1 ${saleUnit} = ${conversionFactor} ${baseUnit}(s)`}
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="loose_dispensing_check"
                      checked={isLooseDispensing}
                      onChange={(e) => setIsLooseDispensing(e.target.checked)}
                      className="w-4 h-4 text-[#0F766E] border-slate-300 rounded focus:ring-[#0F766E]"
                    />
                    <label htmlFor="loose_dispensing_check" className="text-xs font-semibold text-slate-700">
                      Allow Loose Dispensing (e.g. selling individual tablets from a strip)
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 4: TAX, STORAGE & NOTES */}
              {formTab === "commercial" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="HSN Code (Tax Classification)"
                      placeholder="e.g. 300410"
                      value={hsnCode}
                      onChange={(e) => setHsnCode(e.target.value)}
                      error={formErrors.hsn_code}
                    />

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        GST Tax Rate (%)
                      </label>
                      <select
                        value={gstRate}
                        onChange={(e) => setGstRate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                      >
                        <option value="0.00">0.00% (Exempt)</option>
                        <option value="5.00">5.00%</option>
                        <option value="12.00">12.00% (Standard Pharma)</option>
                        <option value="18.00">18.00% (Surgical / Devices)</option>
                        <option value="28.00">28.00%</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Storage Condition
                    </label>
                    <select
                      value={storageCondition}
                      onChange={(e) => setStorageCondition(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    >
                      {metadata.storage_conditions.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pharmacological / Handling Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Add storage warnings, contraindications, or internal handling instructions..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1">
                  {formTab !== "basic" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (formTab === "commercial") setFormTab("packaging");
                        else if (formTab === "packaging") setFormTab("medical");
                        else if (formTab === "medical") setFormTab("basic");
                      }}
                      className="text-xs"
                    >
                      &larr; Back
                    </Button>
                  )}
                  {formTab !== "commercial" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (formTab === "basic") setFormTab("medical");
                        else if (formTab === "medical") setFormTab("packaging");
                        else if (formTab === "packaging") setFormTab("commercial");
                      }}
                      className="text-xs"
                    >
                      Next &rarr;
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormModalOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={formLoading}
                    className="text-xs"
                  >
                    {editingProduct ? "Save Changes" : "Create Product"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRODUCT DETAILS VIEW MODAL                                                */}
      {/* ========================================================================= */}
      {detailModalOpen && activeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl max-w-xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 text-[#0F766E] flex items-center justify-center font-bold">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{activeProduct.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <span>SKU: {activeProduct.sku}</span>
                    {activeProduct.barcode && <span>• Barcode: {activeProduct.barcode}</span>}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Brand Name</span>
                <span className="font-semibold text-slate-800">{activeProduct.brand_name || "—"}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Manufacturer</span>
                <span className="font-semibold text-slate-800">{activeProduct.manufacturer || "—"}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Generic Formulation</span>
                <span className="font-semibold text-slate-800">{activeProduct.generic_name || "—"}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Strength</span>
                <span className="font-semibold text-slate-800">{activeProduct.strength || "—"}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Category</span>
                <span className="font-semibold text-slate-800">{activeProduct.category_display || activeProduct.category}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Prescription Class</span>
                <span className="font-semibold text-slate-800">{activeProduct.prescription_class_display || activeProduct.prescription_class}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Packaging &amp; Units</span>
                <span className="font-semibold text-slate-800">
                  1 {activeProduct.sale_unit} = {activeProduct.conversion_factor} {activeProduct.base_unit}(s)
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">GST Rate</span>
                <span className="font-semibold text-slate-800">{activeProduct.gst_rate}% (HSN: {activeProduct.hsn_code || "—"})</span>
              </div>
            </div>

            {activeProduct.storage_condition && (
              <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-100 text-xs">
                <span className="text-[#0F766E] font-bold block mb-0.5">Storage Instruction:</span>
                <p className="text-slate-700">{activeProduct.storage_condition_display || activeProduct.storage_condition}</p>
              </div>
            )}

            {activeProduct.description && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                <span className="text-slate-500 font-bold block mb-0.5">Pharmacological Notes:</span>
                <p className="text-slate-700">{activeProduct.description}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
              <span>Added: {new Date(activeProduct.created_at).toLocaleDateString()}</span>
              <span>Updated: {new Date(activeProduct.updated_at).toLocaleDateString()}</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailModalOpen(false)}
                className="text-xs"
              >
                Close
              </Button>
              {canManage && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDetailModalOpen(false);
                      handleToggleArchive(activeProduct);
                    }}
                    className="text-xs"
                  >
                    {activeProduct.is_active ? "Archive Product" : "Reactivate Product"}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setDetailModalOpen(false);
                      handleOpenEditModal(activeProduct);
                    }}
                    className="text-xs"
                  >
                    <Edit className="w-3.5 h-3.5 mr-1" />
                    Edit Product
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function ProductsPage() {
  return (
    <DashboardProvider>
      <ProductsContent />
    </DashboardProvider>
  );
}

