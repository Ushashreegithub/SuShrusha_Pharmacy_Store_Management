"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Truck,
  Plus,
  Search,
  RefreshCw,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Edit,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  FileCheck,
  ShieldAlert,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  Supplier,
  CreateSupplierPayload,
  getSuppliersApi,
  createSupplierApi,
  updateSupplierApi,
  deactivateSupplierApi,
  extractList,
} from "@/lib/api";

export default function SuppliersPage() {
  return (
    <DashboardProvider>
      <SuppliersContent />
    </DashboardProvider>
  );
}

function SuppliersContent() {
  const { user } = useDashboard();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Form Fields
  const [name, setName] = useState<string>("");
  const [supplierCode, setSupplierCode] = useState<string>("");
  const [contactPerson, setContactPerson] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [postalCode, setPostalCode] = useState<string>("");
  const [gstin, setGstin] = useState<string>("");
  const [drugLicenseNumber, setDrugLicenseNumber] = useState<string>("");
  const [paymentTermsDays, setPaymentTermsDays] = useState<number>(30);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Role permissions
  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || user?.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";
  const canManageSuppliers = isOwner || isManager;

  const loadSuppliers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = {
        page,
        page_size: pageSize,
      };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (statusFilter !== "ALL") {
        params.is_active = statusFilter === "ACTIVE" ? "true" : "false";
      }
      const data = await getSuppliersApi(params);
      const list = extractList<Supplier>(data);
      setSuppliers(list);
      setTotalCount(data?.count ?? list.length);
      setTotalPages(data?.num_pages ?? 1);
    } catch (err: any) {
      console.error("Failed to load suppliers:", err);
      setError(err.message || "Failed to load supplier records.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [statusFilter, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (page === 1) {
      loadSuppliers();
    } else {
      setPage(1);
    }
  };

  const openCreateModal = () => {
    setIsEditing(false);
    setSelectedSupplier(null);
    setName("");
    setSupplierCode("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setAddress("");
    setCity("");
    setState("");
    setPostalCode("");
    setGstin("");
    setDrugLicenseNumber("");
    setPaymentTermsDays(30);
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setIsEditing(true);
    setSelectedSupplier(supplier);
    setName(supplier.name);
    setSupplierCode(supplier.supplier_code);
    setContactPerson(supplier.contact_person || "");
    setPhone(supplier.phone || "");
    setEmail(supplier.email || "");
    setAddress(supplier.address || "");
    setCity(supplier.city || "");
    setState(supplier.state || "");
    setPostalCode(supplier.postal_code || "");
    setGstin(supplier.gstin || "");
    setDrugLicenseNumber(supplier.drug_license_number || "");
    setPaymentTermsDays(supplier.payment_terms_days || 30);
    setModalError(null);
    setModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setModalError("Supplier name is required.");
      return;
    }

    if (gstin && gstin.trim().length !== 15) {
      setModalError("GSTIN must be exactly 15 characters if provided.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateSupplierPayload = {
        name: cleanName,
        supplier_code: supplierCode.trim().toUpperCase() || undefined,
        contact_person: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        postal_code: postalCode.trim() || undefined,
        gstin: gstin.trim().toUpperCase() || undefined,
        drug_license_number: drugLicenseNumber.trim().toUpperCase() || undefined,
        payment_terms_days: paymentTermsDays,
      };

      if (isEditing && selectedSupplier) {
        await updateSupplierApi(selectedSupplier.id, payload);
        setSuccessMessage(`Supplier "${cleanName}" updated successfully.`);
      } else {
        await createSupplierApi(payload);
        setSuccessMessage(`Supplier "${cleanName}" created successfully.`);
      }
      setModalOpen(false);
      loadSuppliers();
    } catch (err: any) {
      setModalError(err.message || "Failed to save supplier details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (supplier: Supplier) => {
    if (!confirm(`Are you sure you want to deactivate supplier "${supplier.name}"?`)) {
      return;
    }
    try {
      await deactivateSupplierApi(supplier.id);
      setSuccessMessage(`Supplier "${supplier.name}" status updated.`);
      loadSuppliers();
    } catch (err: any) {
      setError(err.message || "Failed to deactivate supplier.");
    }
  };

  return (
    <DashboardLayout
      title="Suppliers"
      subtitle="Authorized pharmaceutical distributors, manufacturers, and vendor contacts."
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSuppliers}
            isLoading={isLoading}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          {canManageSuppliers && (
            <Button
              variant="primary"
              size="sm"
              onClick={openCreateModal}
              className="text-xs bg-[#0F766E] hover:bg-[#115E59]"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Supplier
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
                onClick={loadSuppliers}
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

        {/* Filter & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <form
            onSubmit={handleSearchSubmit}
            className="flex flex-col md:flex-row items-center gap-3"
          >
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by supplier name, vendor code, GSTIN, city or contact person..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-300 pl-9 pr-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs rounded-xl border border-slate-300 p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Deactivated Only</option>
              </select>

              <Button type="submit" variant="outline" size="sm" className="text-xs">
                Filter
              </Button>
            </div>
          </form>
        </div>

        {/* Suppliers Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#0F766E]" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Supplier Directory ({totalCount})
              </h3>
            </div>
            <Link
              href="/dashboard/purchases"
              className="text-xs text-[#0F766E] hover:underline font-semibold flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              View Purchase Inwards (GRN)
            </Link>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <div className="w-6 h-6 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading authorized suppliers...
            </div>
          ) : suppliers.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">No suppliers found</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Add pharmaceutical distributors to intake goods receipt notes (GRN).
                </p>
              </div>
              {canManageSuppliers && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={openCreateModal}
                  className="text-xs bg-[#0F766E]"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add First Supplier
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Supplier & Code</th>
                    <th className="py-3 px-4">Contact Person</th>
                    <th className="py-3 px-4">Communication</th>
                    <th className="py-3 px-4">GSTIN & License</th>
                    <th className="py-3 px-4">Payment Terms</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{s.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Code: {s.supplier_code}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">
                          {s.contact_person || "—"}
                        </div>
                        {s.city && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {s.city}
                            {s.state ? `, ${s.state}` : ""}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {s.phone && (
                          <div className="text-[11px] text-slate-700 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {s.phone}
                          </div>
                        )}
                        {s.email && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3 text-slate-400" />
                            {s.email}
                          </div>
                        )}
                        {!s.phone && !s.email && <span className="text-slate-400">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-[11px] text-slate-800">
                          {s.gstin || "—"}
                        </div>
                        {s.drug_license_number && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            DL: {s.drug_license_number}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {s.payment_terms_days} Days Net
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {s.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3" />
                            Deactivated
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/dashboard/purchases?supplier_id=${s.id}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                            title="View Purchases from this Supplier"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Link>
                          {canManageSuppliers && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(s)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#0F766E] hover:bg-teal-50"
                                title="Edit Supplier"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              {s.is_active && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(s)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                  title="Deactivate Supplier"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {suppliers.length > 0 && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing {suppliers.length} of {totalCount} suppliers (Page {page} of{" "}
                {Math.max(1, totalPages)})
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
                  disabled={page >= totalPages || page * pageSize >= totalCount || isLoading}
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

      {/* Add / Edit Supplier Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden my-8">
            <div className="bg-gradient-to-r from-teal-800 to-teal-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-teal-200" />
                <h3 className="text-sm font-bold">
                  {isEditing ? `Edit Supplier: ${selectedSupplier?.name}` : "Add New Pharmaceutical Supplier"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-teal-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {modalError && (
                <Alert variant="error">
                  <span className="text-xs">{modalError}</span>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier Legal / Trade Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Medico Pharma Distributors Pvt Ltd"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier Code (Unique identifier)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MED-001 (auto-generated if empty)"
                    value={supplierCode}
                    onChange={(e) => setSupplierCode(e.target.value.toUpperCase())}
                    className="w-full text-xs uppercase font-mono rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Sharma"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. +91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. orders@medicopharma.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Plot 45, Industrial Area Phase II"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Maharashtra"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GSTIN (15 Characters)
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="e.g. 27ABCDE1234F1Z5"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    className="w-full text-xs uppercase font-mono rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Drug License Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MH-MZ2-123456"
                    value={drugLicenseNumber}
                    onChange={(e) => setDrugLicenseNumber(e.target.value.toUpperCase())}
                    className="w-full text-xs uppercase font-mono rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Credit / Payment Terms (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(parseInt(e.target.value) || 0)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSubmitting}
                  className="bg-[#0F766E]"
                >
                  {isEditing ? "Save Changes" : "Create Supplier"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
