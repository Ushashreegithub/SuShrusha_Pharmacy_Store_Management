"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  Users,
  ShieldCheck,
  Settings,
  History,
  User,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Building2,
  Bell,
  CheckCircle2,
  AlertCircle,
  Package,
  ShoppingCart,
  FileText,
  Lock,
} from "lucide-react";
import { Logo } from "@/components/auth/Logo";
import { StatusBadge } from "@/components/auth/StatusBadge";
import { useDashboard } from "@/context/DashboardContext";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function DashboardLayout({
  children,
  title,
  subtitle,
  action,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const { user, stores, activeStore, setActiveStoreId, isLoading, handleLogout } =
    useDashboard();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <div className="w-9 h-9 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-600">
          Loading DiracPharma Workspace...
        </p>
      </div>
    );
  }

  if (!user) return null;

  const role = user.primary_role || "none";
  const isOwner = role === "owner" || user.organizations?.some((o) => o.is_owner);
  const isManager = role === "manager";
  const isEmployee = role === "employee" || (!isOwner && !isManager);

  // Dynamic Navigation Items based on verified role
  const navItems = [
    {
      label: "Overview",
      href: "/dashboard",
      icon: LayoutDashboard,
      active: pathname === "/dashboard",
      visible: true,
    },
    {
      label: "Stores / Branches",
      href: "/dashboard/stores",
      icon: Store,
      active: pathname.startsWith("/dashboard/stores"),
      visible: isOwner || isManager,
    },
    {
      label: "Product Catalog",
      href: "/dashboard/products",
      icon: Package,
      active: pathname.startsWith("/dashboard/products"),
      visible: true,
    },
    {
      label: "Team Management",
      href: "/dashboard/team",
      icon: Users,
      active: pathname === "/dashboard/team",
      visible: isOwner || isManager,
    },
    {
      label: "Roles & Permissions",
      href: "/dashboard/roles",
      icon: ShieldCheck,
      active: pathname === "/dashboard/roles",
      visible: isOwner,
    },
    {
      label: "Organization Settings",
      href: "/dashboard/settings",
      icon: Settings,
      active: pathname === "/dashboard/settings",
      visible: isOwner,
    },
    {
      label: "Audit Activity",
      href: "/dashboard/audit",
      icon: History,
      active: pathname === "/dashboard/audit",
      visible: isOwner,
    },
    {
      label: "Profile & Security",
      href: "/dashboard/profile",
      icon: User,
      active: pathname === "/dashboard/profile",
      visible: true,
    },
  ].filter((item) => item.visible);

  const futureModules = [
    { label: "Point of Sale (POS)", icon: ShoppingCart },
    { label: "Batch Inventory & FEFO", icon: Package },
    { label: "Purchases & GRN", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Top Application Bar */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Logo size="md" href="/dashboard" />
          </div>

          {/* Center / Store Selector */}
          <div className="hidden md:flex items-center gap-2 relative">
            {stores.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStoreDropdownOpen(!storeDropdownOpen)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-[#E2E8F0] bg-slate-50 hover:bg-white text-xs font-medium text-slate-800 transition-colors shadow-2xs"
                >
                  <Store className="w-4 h-4 text-[#0F766E]" />
                  <div className="text-left">
                    <span className="block font-semibold leading-tight text-slate-900">
                      {activeStore ? activeStore.name : "Select Store Branch"}
                    </span>
                    <span className="block text-[10px] text-slate-500 font-mono">
                      {activeStore ? activeStore.code : `${stores.length} stores`}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
                </button>

                {storeDropdownOpen && (
                  <div className="absolute left-0 mt-1 w-64 bg-white rounded-xl border border-[#E2E8F0] shadow-lg py-1.5 z-40">
                    <div className="px-3 py-1 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Switch Store Branch
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {stores.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setActiveStoreId(s.id);
                            setStoreDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-teal-50/60 transition-colors ${
                            s.id === activeStore?.id ? "bg-teal-50 text-[#0F766E] font-semibold" : "text-slate-700"
                          }`}
                        >
                          <div>
                            <p className="font-medium">{s.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{s.code}</p>
                          </div>
                          {s.id === activeStore?.id && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E]" />
                          )}
                        </button>
                      ))}
                    </div>
                    {isOwner && (
                      <div className="border-t border-slate-100 p-1.5">
                        <Link
                          href="/dashboard/stores/create"
                          onClick={() => setStoreDropdownOpen(false)}
                          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-[#0F766E] font-semibold hover:bg-teal-50 rounded-lg w-full text-left"
                        >
                          + Create New Branch
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>{user.organizations?.[0]?.name || "Organization"}</span>
              </div>
            )}
          </div>

          {/* Right Area: Audit Link & User Menu */}
          <div className="flex items-center gap-3">
            {isOwner && (
              <Link
                href="/dashboard/audit"
                className="hidden sm:flex items-center gap-1.5 p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs transition-colors"
                title="View Audit Trail"
              >
                <Bell className="w-4 h-4 text-slate-500" />
              </Link>
            )}

            {/* User Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2.5 p-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-[#E2E8F0] hover:bg-slate-50 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-[#0F766E] text-white flex items-center justify-center font-bold text-xs uppercase">
                  {user.full_name.charAt(0)}
                </div>
                <div className="hidden sm:block text-left">
                  <span className="block text-xs font-semibold text-slate-900 leading-tight">
                    {user.full_name}
                  </span>
                  <span className="block text-[10px] text-teal-700 font-medium capitalize">
                    {isOwner ? "Owner" : isManager ? "Store Manager" : "Staff"}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl border border-[#E2E8F0] shadow-lg py-1.5 z-40">
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900">{user.full_name}</p>
                    <p className="text-[11px] text-slate-500 font-mono truncate">{user.email}</p>
                    <div className="mt-1">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-[#0F766E] border border-teal-200">
                        {isOwner ? "Organization Owner" : isManager ? "Store Manager" : "Staff Member"}
                      </span>
                    </div>
                  </div>

                  <Link
                    href="/dashboard/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>Profile &amp; Security</span>
                  </Link>

                  {isOwner && (
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <Settings className="w-4 h-4 text-slate-400" />
                      <span>Organization Settings</span>
                    </Link>
                  )}

                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-rose-600 hover:bg-rose-50 text-left"
                    >
                      <LogOut className="w-4 h-4 text-rose-500" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main App Layout Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full flex gap-6">
        {/* Desktop Sidebar Navigation */}
        <aside className="w-60 flex-shrink-0 hidden lg:flex flex-col justify-between">
          <div className="space-y-6">
            {/* Primary Nav */}
            <div className="space-y-1">
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Management
              </span>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      item.active
                        ? "bg-[#0F766E] text-white shadow-2xs font-semibold"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${item.active ? "text-white" : "text-slate-400"}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Future Pharmacy Operational Modules (Clearly Flagged as Coming Soon) */}
            <div className="space-y-1 pt-2 border-t border-[#E2E8F0]">
              <div className="px-3 flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Operations
                </span>
                <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  Phase 5–7
                </span>
              </div>
              {futureModules.map((fm) => {
                const Icon = fm.icon;
                return (
                  <div
                    key={fm.label}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-400 cursor-not-allowed select-none opacity-80"
                    title="Operational workflow will be activated in subsequent release."
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-slate-300" />
                      <span>{fm.label}</span>
                    </div>
                    <Lock className="w-3 h-3 text-slate-300" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="pt-4 border-t border-[#E2E8F0] space-y-2">
            <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-100 text-xs">
              <span className="font-semibold text-slate-800 block text-[11px]">
                {user.organizations?.[0]?.name || "DiracPharma"}
              </span>
              <span className="text-[10px] text-teal-700 font-mono">
                {stores.length} Registered {stores.length === 1 ? "Branch" : "Branches"}
              </span>
            </div>
          </div>
        </aside>

        {/* Mobile Slide-out Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative bg-white w-72 max-w-[80%] h-full p-5 flex flex-col justify-between shadow-xl z-10">
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <Logo size="sm" />
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Mobile Navigation Links */}
                <div className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium ${
                          item.active
                            ? "bg-[#0F766E] text-white font-semibold"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        {/* Workspace Content Body */}
        <main className="flex-1 min-w-0 space-y-6">
          {(title || action) && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E2E8F0]">
              <div>
                {title && (
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
                )}
              </div>
              {action && <div className="flex items-center gap-2">{action}</div>}
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}

