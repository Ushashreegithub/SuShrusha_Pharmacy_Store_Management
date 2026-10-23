"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Package,
  ArrowLeft,
  Edit,
  Archive,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  Building2,
  Tag,
  Shield,
  FileText,
  Clock,
  Layers,
  X,
  CheckCircle2,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatusBadge } from "@/components/auth/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import {
  getProductDetailApi,
  updateProductApi,
  archiveProductApi,
  reactivateProductApi,
  getProductMetadataApi,
  ApiError,
} from "@/lib/api";
import { Product, ProductCreatePayload, ProductMetadata } from "@/types/dashboard";

function ProductDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  const { user } = useDashboard();

  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";
  const canManage = isOwner || isManager;

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editGeneralError, setEditGeneralError] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<"basic" | "medical" | "packaging" | "commercial">("basic");

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

  const loadProduct = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getProductDetailApi(productId);
      setProduct(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load product details.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (productId) {
      loadProduct();
    }
  }, [productId]);

  const handleOpenEdit = () => {
    if (!product) return;
    setName(product.name);
    setBrandName(product.brand_name || "");
    setGenericName(product.generic_name || "");
    setSku(product.sku);
    setBarcode(product.barcode || "");
    setHsnCode(product.hsn_code || "");
    setItemType(product.item_type || "medicine");
    setCategory(product.category || "prescription_medicines");
    setManufacturer(product.manufacturer || "");
    setStrength(product.strength || "");
    setDosageForm(product.dosage_form || "tablet");
    setPrescriptionClass(product.prescription_class || "otc");
    setIsNarcotic(Boolean(product.is_narcotic));
    setPackDescription(product.pack_description || "");
    setBaseUnit(product.base_unit || "tablet");
    setSaleUnit(product.sale_unit || "strip");
    setConversionFactor(product.conversion_factor || 1);
    setIsLooseDispensing(Boolean(product.is_loose_dispensing_allowed));
    setGstRate(String(product.gst_rate || "12.00"));
    setStorageCondition(product.storage_condition || "room_temperature");
    setDescription(product.description || "");
    setEditTab("basic");
    setEditErrors({});
    setEditGeneralError(null);
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setEditGeneralError(null);

    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Product name is required.";
    if (!sku.trim()) errs.sku = "SKU identifier is required.";
    if (conversionFactor < 1) errs.conversion_factor = "Conversion factor must be 1 or higher.";

    if (Object.keys(errs).length > 0) {
      setEditErrors(errs);
      return;
    }

    setEditErrors({});
    setEditLoading(true);

    const payload: Partial<ProductCreatePayload> = {
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
      const updated = await updateProductApi(product.id, payload);
      setProduct(updated);
      setSuccessMsg("Product updated successfully.");
      setEditModalOpen(false);
    } catch (err: any) {
      if (err instanceof ApiError && err.fieldErrors) {
        setEditErrors(err.fieldErrors);
      } else {
        setEditGeneralError(err?.message || "Failed to update product.");
      }
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!product) return;
    setActionLoading(true);
    try {
      if (product.is_active) {
        await archiveProductApi(product.id);
        setSuccessMsg(`Product "${product.name}" has been archived.`);
        setProduct({ ...product, is_active: false });
      } else {
        await reactivateProductApi(product.id);
        setSuccessMsg(`Product "${product.name}" has been reactivated.`);
        setProduct({ ...product, is_active: true });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update product state.");
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Product Details">
        <div className="p-12 text-center text-xs text-slate-500 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin text-[#0F766E] mx-auto" />
          <p>Loading product details...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !product) {
    return (
      <DashboardLayout title="Product Not Found">
        <div className="bg-white p-8 rounded-2xl border border-rose-200 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <h2 className="text-sm font-bold text-slate-900">Product Unavailable</h2>
          <p className="text-xs text-slate-600">{error || "The requested product does not exist or belongs to another organization."}</p>
          <div className="pt-2">
            <Link href="/dashboard/products">
              <Button variant="primary" size="sm">
                Return to Product Catalog
              </Button>
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isRx = product.prescription_class && product.prescription_class !== "otc";

  return (
    <DashboardLayout
      title={product.name}
      subtitle={`SKU: ${product.sku} • Category: ${product.category_display || product.category}`}
      action={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/products">
            <Button variant="outline" size="sm" className="text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Catalog
            </Button>
          </Link>
          {canManage && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleArchive}
                isLoading={actionLoading}
                className="text-xs"
              >
                {product.is_active ? (
                  <>
                    <Archive className="w-3.5 h-3.5 mr-1 text-slate-500" />
                    Archive
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    Reactivate
                  </>
                )}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenEdit}
                className="text-xs"
              >
                <Edit className="w-3.5 h-3.5 mr-1" />
                Edit Product
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-6">
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

        {/* Status & Identity Banner */}
        <div className="p-5 bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                product.is_active
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  : "bg-amber-50 text-amber-600 border border-amber-200"
              }`}
            >
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-900">{product.name}</span>
                <StatusBadge
                  status={product.is_active ? "active" : "inactive"}
                  label={product.is_active ? "Active Catalog" : "Archived"}
                />
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                SKU: <strong className="text-slate-800">{product.sku}</strong>
                {product.barcode && <> • Barcode: <strong className="text-slate-800">{product.barcode}</strong></>}
                {product.hsn_code && <> • HSN: <strong className="text-slate-800">{product.hsn_code}</strong></>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRx ? (
              <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                {product.prescription_class_display || "Prescription Required"}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                OTC Dispensing
              </span>
            )}
            {product.is_narcotic && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-300">
                NDPS Narcotic
              </span>
            )}
          </div>
        </div>

        {/* 2-Column Detail Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Clinical & Formulation */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-3">
              Formulation &amp; Commercial Info
            </h3>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Brand Name</span>
                <span className="font-semibold text-slate-800">{product.brand_name || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Manufacturer</span>
                <span className="font-semibold text-slate-800">{product.manufacturer || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Generic (API)</span>
                <span className="font-semibold text-slate-800">{product.generic_name || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Strength / Potency</span>
                <span className="font-semibold text-slate-800">{product.strength || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Dosage Form</span>
                <span className="font-semibold text-slate-800">{product.dosage_form_display || product.dosage_form}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Category</span>
                <span className="font-semibold text-slate-800">{product.category_display || product.category}</span>
              </div>
            </div>

            {product.description && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                <span className="text-slate-500 font-bold block mb-1">Pharmacological / Handling Notes:</span>
                <p className="text-slate-700 leading-relaxed">{product.description}</p>
              </div>
            )}
          </div>

          {/* Card 2: Packaging, Dispensing & Tax */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-3">
              Packaging, Units &amp; Compliance
            </h3>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Pack Description</span>
                <span className="font-semibold text-slate-800">{product.pack_description || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Sale Unit</span>
                <span className="font-semibold text-slate-800 capitalize">{product.sale_unit}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Base Stock Unit</span>
                <span className="font-semibold text-slate-800 capitalize">{product.base_unit}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Conversion Ratio</span>
                <span className="font-semibold text-slate-800">
                  1 {product.sale_unit} = {product.conversion_factor} {product.base_unit}(s)
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Loose Dispensing</span>
                <span className="font-semibold text-slate-800">
                  {product.is_loose_dispensing_allowed ? "Permitted" : "Prohibited (Pack only)"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Applicable GST Rate</span>
                <span className="font-semibold text-slate-800">{product.gst_rate}%</span>
              </div>
            </div>

            {product.storage_condition && (
              <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-100 text-xs">
                <span className="text-[#0F766E] font-bold block mb-0.5">Storage Condition:</span>
                <p className="text-slate-700">{product.storage_condition_display || product.storage_condition}</p>
              </div>
            )}
          </div>
        </div>

        {/* Audit Log Card */}
        <div className="p-4 bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Created: <strong>{new Date(product.created_at).toLocaleString()}</strong>
            {product.created_by_name && <> by <strong>{product.created_by_name}</strong></>}
          </div>
          <div>
            Last Modified: <strong>{new Date(product.updated_at).toLocaleString()}</strong>
            {product.updated_by_name && <> by <strong>{product.updated_by_name}</strong></>}
          </div>
        </div>
      </div>

      {/* EDIT MODAL */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl max-w-xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Edit Product: {product.name}</h3>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editGeneralError && (
              <Alert variant="error" onClose={() => setEditGeneralError(null)}>
                {editGeneralError}
              </Alert>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <Input
                label="Commercial Product Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={editErrors.name}
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="SKU"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  error={editErrors.sku}
                  required
                />
                <Input
                  label="Barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  error={editErrors.barcode}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Brand Name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
                <Input
                  label="Manufacturer"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Generic Formulation"
                  value={genericName}
                  onChange={(e) => setGenericName(e.target.value)}
                />
                <Input
                  label="Strength"
                  value={strength}
                  onChange={(e) => setStrength(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Sale Unit"
                  value={saleUnit}
                  onChange={(e) => setSaleUnit(e.target.value)}
                />
                <Input
                  label="Base Unit"
                  value={baseUnit}
                  onChange={(e) => setBaseUnit(e.target.value)}
                />
                <Input
                  label="Conversion Factor"
                  type="number"
                  min={1}
                  value={conversionFactor}
                  onChange={(e) => setConversionFactor(Math.max(1, parseInt(e.target.value) || 1))}
                  error={editErrors.conversion_factor}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={editLoading}
                  className="text-xs"
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function ProductDetailPage() {
  return (
    <DashboardProvider>
      <ProductDetailPageContent />
    </DashboardProvider>
  );
}

