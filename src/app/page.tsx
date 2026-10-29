"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Store,
  Users,
  ShieldCheck,
  Activity,
  Package,
  CreditCard,
  AlertTriangle,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Lock,
  Building2,
  Clock,
  Sparkles,
  Menu,
  X,
  ChevronRight,
  HelpCircle,
  FileText,
  Mail,
  Phone,
  Shield,
  Layers,
} from "lucide-react";
import { Logo } from "@/components/auth/Logo";
import { Button } from "@/components/ui/Button";
import { PharmacyImage } from "@/components/ui/PharmacyImage";

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col selection:bg-teal-100 selection:text-teal-900">
      {/* =========================================================================
          1. HEADER / NAVBAR
          ========================================================================= */}
      <header className="bg-white border-b border-[#E2E8F0] shadow-2xs relative z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          {/* Brand Logo */}
          <Logo size="md" href="/" withTagline={false} />

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-600">
            <a
              href="#"
              className="hover:text-[#0F766E] transition-colors"
            >
              Home
            </a>
            <a
              href="#features"
              className="hover:text-[#0F766E] transition-colors"
            >
              Features
            </a>
            <a
              href="#solutions"
              className="hover:text-[#0F766E] transition-colors"
            >
              Solutions
            </a>
            <a
              href="#about"
              className="hover:text-[#0F766E] transition-colors"
            >
              Why PharmaPro
            </a>
            <a
              href="#contact"
              className="hover:text-[#0F766E] transition-colors"
            >
              Contact
            </a>
          </nav>

          {/* Desktop Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login">
              <Button
                variant="outline"
                size="sm"
                className="text-xs bold px-4 text-slate-700"
              >
                Login
              </Button>
            </Link>
            <Link href="/register">
              <Button
                variant="primary"
                size="sm"
                className="text-xs font-bold px-3 bg-[#0F766E] hover:bg-[#0D645D]"
              >
                <span>Register</span>
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Hamburger Button */}
          <div className="md:hidden flex items-center gap-2">
            <Link href="/login">
              <Button variant="outline" size="sm" className="text-xs px-2.5 py-1">
                Login
              </Button>
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-[#E2E8F0] px-4 pt-3 pb-5 space-y-3 shadow-lg animate-in slide-in-from-top duration-200">
            <div className="flex flex-col space-y-2 text-sm font-semibold text-slate-700">
              <a
                href="#"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Home
              </a>
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Features
              </a>
              <a
                href="#solutions"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Solutions
              </a>
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Why PharmaPro
              </a>
              <a
                href="#contact"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Contact
              </a>
            </div>

            <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
              <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" size="sm" fullWidth className="text-xs">
                  Login
                </Button>
              </Link>
              <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="primary" size="sm" fullWidth className="text-xs">
                  Register Now
                </Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          2. HERO SECTION
          ========================================================================= */}
      <section className="relative overflow-hidden pt-10 pb-16 sm:pt-16 sm:pb-24 lg:pt-20 lg:pb-28 bg-gradient-to-b from-[#F0FDFA]/70 via-[#F8FAFC] to-[#F8FAFC]">
        {/* Decorative background grid */}
        <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#0F766E_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Column: Headline and Call-to-Actions */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              {/* Product Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-[#0F766E] text-xs font-bold tracking-wide uppercase">
                <ShieldCheck className="w-4 h-4 text-[#0F766E]" />
                <span>Intelligent Management • Better Pharmacy Operations</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.12]">
                Smart Pharmacy Management for{" "}
                <span className="text-[#0F766E]">Modern Pharmacies</span>
              </h1>

              {/* Supporting Copy */}
              <p className="text-slate-600 text-sm sm:text-base lg:text-lg leading-relaxed max-w-2xl mx-auto lg:mx-0">
                Manage your pharmacy stores, team, inventory, billing, and daily
                operations through one organized platform designed to simplify
                pharmacy management.
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5">
                <Link href="/register" className="w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto px-3 py-3 text-sm font-bold bg-[#0F766E] hover:bg-[#0D645D] shadow-md shadow-teal-900/10"
                  >
                    <span>Register Now</span>
                  </Button>
                </Link>

                <Link href="/login" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto px-7 py-3 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border-[#E2E8F0]"
                  >
                    <span>Login</span>
                  </Button>
                </Link>
              </div>

              {/* Security & Access Highlights */}
              <div className="pt-3 flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-4 text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Owner Registration
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Direct Team Provisioning
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Multi-Branch Oversight
                </span>
              </div>
            </div>

            {/* Right Column: High Quality Pharmacy Image Showcase */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                {/* Glow ring */}
                <div className="absolute -inset-1.5 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-3xl blur-sm opacity-20" />

                {/* Main Image Frame */}
                <div className="relative rounded-2xl overflow-hidden border border-[#E2E8F0] bg-white shadow-xl aspect-4/3 sm:aspect-16/11">
                  <PharmacyImage
                    src="/images/hero-pharmacy.jpg"
                    alt="Pharmacist working in modern pharmacy with organized medicine shelves"
                    className="w-full h-full object-cover"
                  />

                  {/* Overlay Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent" />

                  {/* Caption badge at bottom */}
                  <div className="absolute bottom-4 left-4 right-4 p-3 bg-white/95 backdrop-blur-md rounded-xl border border-white/60 shadow-md flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
                        <Store className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block leading-tight">
                          Branch Operations Hub
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Centralized store coordination
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  </div>
                </div>

                {/* Floating Indicator Chip: Multi-Store Security */}
                <div className="hidden sm:flex absolute -top-4 -left-6 bg-white p-3 rounded-xl border border-[#E2E8F0] shadow-lg items-center gap-2.5 text-xs">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-[11px] leading-tight">
                      Role-Based Access
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Owners • Managers • Staff
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. TRUST & GENUINE PLATFORM BENEFITS BAR
          ========================================================================= */}
      <section className="bg-white border-y border-[#E2E8F0] py-8 sm:py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center flex-shrink-0 border border-teal-100">
                <Store className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                  Centralized Store Management
                </h3>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Manage multiple retail branches and dispensaries under a single organization.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center flex-shrink-0 border border-teal-100">
                <Users className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                  Role-Based Team Access
                </h3>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Specific roles for Owners, Managers, Pharmacists, and Cashiers with zero data spill.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center flex-shrink-0 border border-teal-100">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                  Secure Account Access
                </h3>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Standard Argon2 password hashing with HttpOnly session cookies.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center flex-shrink-0 border border-teal-100">
                <Activity className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                  Organized Pharmacy Operations
                </h3>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Direct team creation, branch memberships, and audit trails.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. FEATURES SECTION
          ========================================================================= */}
      <section id="features" className="py-16 sm:py-24 bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0F766E] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
              Platform Features
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Comprehensive Tools to Run Every Pharmacy Branch
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Designed specifically for multi-branch retail pharmacies, hospital dispensaries,
              and expanding healthcare stores.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1: Store & Branch Management */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                    <Store className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Available Now
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Store and Branch Management
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Create, configure, and monitor individual pharmacy branches with unique codes,
                  addresses, and designated store managers.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-[#0F766E] hover:underline gap-1 pt-2"
              >
                <span>Access Store Manager</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Feature 2: Team & Employee Management */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Available Now
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Team &amp; Employee Management
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Directly provision employee and manager accounts, assign store branches,
                  and configure operational credentials without invitation delays.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-[#0F766E] hover:underline gap-1 pt-2"
              >
                <span>Manage Pharmacy Staff</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Feature 3: Role-Based Access */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Available Now
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Role-Based Access
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Strict multi-tenant security architecture ensuring Owners see all organization
                  data while Managers and staff only see assigned branches.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-[#0F766E] hover:underline gap-1 pt-2"
              >
                <span>Inspect Access Matrix</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Feature 4: Audit Activity Logs */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                    <Activity className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Available Now
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Audit Activity Logs
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Immutable security audit logging capturing logins, staff creations, store updates,
                  and IP addresses for regulatory accountability.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-[#0F766E] hover:underline gap-1 pt-2"
              >
                <span>View Security Logs</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Feature 5: Inventory Management (Planned) */}
            <div className="bg-white/80 rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                    <Package className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                    Planned Capability
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  Inventory Management
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Batch tracking, inter-branch stock transfers, minimum quantity triggers,
                  and purchase orders built for pharmaceutical precision.
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">In Phase Development</span>
            </div>

            {/* Feature 6: Sales and Billing (Planned) */}
            <div className="bg-white/80 rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                    Planned Capability
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  Sales and Billing (POS)
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Fast counter billing, prescription scanning, tax-compliant invoicing,
                  and cashier session reconciliation.
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">In Phase Development</span>
            </div>

            {/* Feature 7: Expiry and Low-Stock Alerts (Planned) */}
            <div className="bg-white/80 rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                    Planned Capability
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  Expiry &amp; Low-Stock Alerts
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Early warning notifications for near-expiry medication batches and
                  critical threshold reordering alerts.
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">In Phase Development</span>
            </div>

            {/* Feature 8: Reports and Analytics (Planned) */}
            <div className="bg-white/80 rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                    Planned Capability
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  Reports and Analytics
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Branch performance comparison, dispensing trends, and profit margins
                  for multi-store pharmacy enterprise owners.
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">In Phase Development</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. ABOUT & PLATFORM BENEFITS SECTION
          ========================================================================= */}
      <section id="about" className="py-16 sm:py-24 bg-white border-t border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Image with Pharmacy Service Illustration */}
            <div className="lg:col-span-5 order-2 lg:order-1">
              <div className="relative rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-lg aspect-4/3 sm:aspect-16/12 bg-slate-100">
                <PharmacyImage
                  src="/images/pharmacist-service.jpg"
                  alt="Pharmacist providing consulting and medicine dispensing services"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 p-3 bg-white/95 backdrop-blur-md rounded-xl border border-white/60 shadow-sm text-xs">
                  <div className="font-bold text-slate-900">
                    Reliable Clinical &amp; Retail Operations
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Designed to empower pharmacists with focused branch access
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Platform Purpose & Benefits */}
            <div id="solutions" className="lg:col-span-7 order-1 lg:order-2 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0F766E] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
                  Why PharmaPro
                </span>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  Built for Pharmacies. Designed for Growth.
                </h2>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                PharmaPro, an intelligent pharmacy management product by DiracAI Services,
                helps pharmacy owners organize their branches, manage team access, and bring
                essential pharmacy workflows into one unified platform. Its role-based design
                supports owners, managers, and employees while keeping access aligned with
                their operational responsibilities.
              </p>

              {/* 5 Core Pillars */}
              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-[#0F766E] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Centralized Owner Dashboard</h4>
                    <p className="text-[11px] text-slate-600">
                      Global overview of all retail and clinical branches, active managers, and staff metrics.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-[#0F766E] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs">
                    2
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Store-Specific Manager Access</h4>
                    <p className="text-[11px] text-slate-600">
                      Branch managers manage authorized staff and inventory without cross-store interference.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-[#0F766E] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs">
                    3
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Organized Employee Records</h4>
                    <p className="text-[11px] text-slate-600">
                      Direct employee creation with initial credentials for immediate sign-in without waiting for emails.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-[#0F766E] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs">
                    4
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Access to Multiple Assigned Stores</h4>
                    <p className="text-[11px] text-slate-600">
                      Support for flexible staff shifts across branches with an intuitive active branch switcher.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-[#0F766E] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-xs">
                    5
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Responsive Desktop and Mobile Experience</h4>
                    <p className="text-[11px] text-slate-600">
                      Clean interface optimized for dispensing counter PCs, tablets, and mobile smartphones.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. ROLE-BASED ARCHITECTURE SECTION
          ========================================================================= */}
      <section className="py-16 sm:py-20 bg-slate-50 border-t border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0F766E] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
              Role Structure
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Tailored Access for Every Team Member
            </h2>
            <p className="text-xs text-slate-600">
              Clear responsibilities and boundaries to safeguard pharmaceutical compliance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Owner Role Card */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Pharmacy Owner</h3>
                <p className="text-xs font-semibold text-[#0F766E]">Executive Control</p>
              </div>
              <ul className="space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Organization-wide multi-branch oversight
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Create and manage store branches
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Direct employee &amp; manager creation
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Security audit trail inspection
                </li>
              </ul>
            </div>

            {/* Manager Role Card */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                <Store className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Store Manager</h3>
                <p className="text-xs font-semibold text-sky-700">Branch Operations</p>
              </div>
              <ul className="space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Access restricted to authorized branches
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Staff shift &amp; pharmacist coordination
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Store-level member management
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Branch inventory and sales reporting
                </li>
              </ul>
            </div>

            {/* Employee Role Card */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Pharmacist &amp; Staff</h3>
                <p className="text-xs font-semibold text-amber-700">Dispensing &amp; Service</p>
              </div>
              <ul className="space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Prescription dispensing in active store
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Direct login with provided credentials
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Voluntary password change in profile
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  Multi-store active branch switcher
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          7. CALL-TO-ACTION (CTA) SECTION
          ========================================================================= */}
      <section className="py-16 sm:py-20 bg-[#164E63] text-white relative overflow-hidden">
        {/* Soft background pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-800/60 border border-teal-500/30 text-teal-200 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-teal-300" />
            <span>Ready to Modernize Your Pharmacy</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Ready to Organize Your Pharmacy Operations?
          </h2>

          <p className="text-xs sm:text-sm text-teal-100 max-w-xl mx-auto leading-relaxed">
            Create your pharmacy management account and start organizing your stores and team.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <Link href="/register" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto px-8 py-3.5 text-sm font-bold bg-[#0F766E] hover:bg-[#0D645D] text-white border border-teal-400/30 shadow-lg shadow-teal-950/20"
              >
                <span>Register Now</span>
              </Button>
            </Link>

            <Link href="/login" className="w-full sm:w-auto">
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto px-8 py-3.5 text-sm font-semibold bg-white/10 hover:bg-white/20 text-white border-white/20"
              >
                <span>Login</span>
              </Button>
            </Link>
          </div>

          <p className="text-[11px] text-teal-200/80 pt-2">
            Pharmacy owners can register directly. Managers and staff sign in with credentials provided by their owner.
          </p>
        </div>
      </section>

      {/* =========================================================================
          8. CONTACT SECTION
          ========================================================================= */}
      <section id="contact" className="py-14 sm:py-16 bg-white border-t border-[#E2E8F0]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-slate-50 rounded-2xl border border-[#E2E8F0] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-2xs">
            <div className="space-y-2 max-w-lg">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F766E] uppercase tracking-wider">
                <HelpCircle className="w-4 h-4" />
                <span>Support &amp; Onboarding</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Need Help with Organization Setup?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                For branch deployment questions, technical support, or administrator assistance,
                please sign in to your dashboard or contact your pharmacy administrator.
              </p>
            </div>

            <div className="flex-shrink-0">
              <Link href="/login">
                <Button variant="primary" size="sm" className="text-xs font-semibold px-5">
                  Sign In for Support
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          9. COMPLETE FOOTER
          ========================================================================= */}
      <footer className="bg-slate-900 text-slate-400 text-xs border-t border-slate-800 pt-12 pb-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Column 1: Brand Info */}
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2 select-none">
                <img
                  src="/images/diracai-logo-compact.png"
                  alt="DiracAI Services Logo"
                  className="w-6 h-6 object-contain flex-shrink-0"
                  style={{ width: "24px", height: "24px" }}
                />
                <div className="flex flex-col text-left">
                  <span className="font-bold text-white text-base tracking-tight leading-tight">
                   Pharma<span className="text-teal-400 font-semibold">Pro</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">by DiracAI Services</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Intelligent pharmacy store management product by DiracAI Services, built for multi-branch retail
                pharmacies, hospital dispensaries, and healthcare operators.
              </p>
            </div>

            {/* Column 2: Navigation Links */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Navigation
              </h4>
              <ul className="space-y-1.5 text-[11px]">
                <li>
                  <a href="#" className="hover:text-teal-400 transition-colors">
                    Home
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-teal-400 transition-colors">
                    Platform Features
                  </a>
                </li>
                <li>
                  <a href="#solutions" className="hover:text-teal-400 transition-colors">
                    Solutions
                  </a>
                </li>
                <li>
                  <a href="#about" className="hover:text-teal-400 transition-colors">
                    Why PharmaPro
                  </a>
                </li>
                <li>
                  <a href="#contact" className="hover:text-teal-400 transition-colors">
                    Support
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3: Platform Access */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Platform Access
              </h4>
              <ul className="space-y-1.5 text-[11px]">
                <li>
                  <Link href="/register" className="hover:text-teal-400 transition-colors">
                    Owner Registration
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-teal-400 transition-colors">
                    Account Login
                  </Link>
                </li>
                <li>
                  <Link href="/forgot-password" className="hover:text-teal-400 transition-colors">
                    Password Recovery
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 4: Operational Security */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Security &amp; Technology
              </h4>
              <ul className="space-y-1.5 text-[11px] text-slate-400">
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  Role-Based Isolation
                </li>
                <li className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-teal-400" />
                  HttpOnly Session Security
                </li>
                <li className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-teal-400" />
                  Immutable Audit Trails
                </li>
                <li className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-teal-400" />
                  PostgreSQL Data Persistence
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Copyright & Status */}
          <div className="pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
            <div>
              &copy; {new Date().getFullYear()} PharmaPro Management System. All rights reserved.
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">System Operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
