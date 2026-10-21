"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Store as StoreIcon,
  Plus,
  Search,
  Filter,
  MapPin,
  Phone,
  Mail,
  User,
  Users,
  ArrowRight,
  RefreshCw,
  Building2,
  Calendar,
  AlertCircle,
  MoreVertical,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatusBadge } from "@/components/auth/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getStoresApi } from "@/lib/api";
import { Store } from "@/types/dashboard";

function StoresListContent() {
  const router = useRouter();
  const { user, refreshStores } = useDashboard();
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const isOwner = user?.primary_role === "owner" || user?.organizations?.some((o) => o.is_owner);

  const fetchStores = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getStoresApi({
        search: search.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setStores(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load store branches.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStores();
  };

  return (
    <DashboardLayout
      title="Store Branches Directory"
      subtitle="Manage your pharmacy retail locations, clinic branches, and store managers."
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStores}
            isLoading={isLoading}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          {isOwner && (
            <Link href="/dashboard/stores/create">
              <Button variant="primary" size="sm" className="text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Create Store Branch
              </Button>
            </Link>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="w-full sm:max-w-md flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search branches by name or store code..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-[#E2E8F0] focus:outline-none focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E]"
              />
            </div>
            <Button type="submit" variant="outline" size="sm" className="text-xs">
              Search
            </Button>
          </form>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-[#E2E8F0] text-xs font-medium text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Operational</option>
              <option value="setup">Under Setup</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={fetchStores}
              className="font-semibold underline hover:text-rose-950"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white p-5 rounded-2xl border border-[#E2E8F0] animate-pulse space-y-3"
              >
                <div className="h-4 bg-slate-200 rounded w-2/3" />
                <div className="h-3 bg-slate-100 rounded w-1/3" />
                <div className="h-10 bg-slate-50 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && stores.length === 0 && (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center mx-auto">
              <StoreIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-slate-900">No Store Branches Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {search || statusFilter !== "all"
                  ? "No store branches matched your search filters. Try clearing your search."
                  : "You have not registered any store branches yet. Add your first pharmacy location."}
              </p>
            </div>
            {isOwner && (
              <div className="pt-2">
                <Link href="/dashboard/stores/create">
                  <Button variant="primary" size="sm" className="text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Create First Store Branch
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Stores Grid */}
        {!isLoading && stores.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.map((store) => (
              <div
                key={store.id}
                className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-[#0F766E] flex items-center justify-center flex-shrink-0">
                        <StoreIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <Link
                          href={`/dashboard/stores/${store.id}`}
                          className="font-bold text-sm text-slate-900 hover:text-[#0F766E] transition-colors leading-snug line-clamp-1"
                        >
                          {store.name}
                        </Link>
                        <span className="font-mono text-[11px] text-slate-500 block">
                          {store.code}
                        </span>
                      </div>
                    </div>
                    <StatusBadge
                      status={
                        store.status === "active"
                          ? "active"
                          : store.status === "setup"
                          ? "pending"
                          : "inactive"
                      }
                      label={
                        store.status === "active"
                          ? "Active"
                          : store.status === "setup"
                          ? "Under Setup"
                          : "Inactive"
                      }
                    />
                  </div>

                  <div className="text-xs text-slate-600 space-y-1.5 pt-2 border-t border-slate-100">
                    {store.address ? (
                      <p className="flex items-start gap-1.5 text-slate-500 line-clamp-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <span>
                          {store.address}
                          {store.city ? `, ${store.city}` : ""}
                        </span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">No street address provided</p>
                    )}

                    {store.phone && (
                      <p className="flex items-center gap-1.5 text-slate-500">
                        <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span>{store.phone}</span>
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500">
                        Manager:{" "}
                        <strong className="text-slate-700">
                          {store.manager_name || "Unassigned"}
                        </strong>
                      </span>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                        <Users className="w-3 h-3 text-slate-400" />
                        {store.member_count || 0} staff
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Link href={`/dashboard/stores/${store.id}`} className="flex-1">
                    <Button variant="outline" size="sm" fullWidth className="text-xs">
                      View Details
                    </Button>
                  </Link>

                  {isOwner && (
                    <Link href={`/dashboard/stores/${store.id}/edit`}>
                      <Button variant="outline" size="sm" className="text-xs">
                        Edit
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function StoresPage() {
  return (
    <DashboardProvider>
      <StoresListContent />
    </DashboardProvider>
  );
}

