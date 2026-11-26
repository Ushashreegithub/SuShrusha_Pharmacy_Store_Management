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
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] shadow-2xs transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Brand Logo - Prominent, larger, premium navy & teal typography */}
          <Logo size="lg" href="/" withTagline={false} />

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-9 text-sm font-semibold text-slate-600">
            <a
              href="#"
              className="text-[#0F766E] font-bold transition-colors"
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
                className="text-xs font-bold px-4 py-2 text-slate-700 bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 rounded-xl transition-all shadow-2xs h-10"
              >
                Login
              </Button>
            </Link>
            <Link href="/register">
              <Button
                variant="primary"
                size="sm"
                className="text-xs font-bold px-5 py-2 bg-[#0F766E] hover:bg-[#0D645D] text-white rounded-xl transition-all shadow-sm shadow-teal-900/10 hover:shadow-md hover:-translate-y-0.5 h-10"
              >
                <span>Register</span>
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Hamburger Button */}
          <div className="md:hidden flex items-center gap-2">
            <Link href="/login">
              <Button variant="outline" size="sm" className="text-xs px-3 py-1.5 h-9 rounded-xl">
                Login
              </Button>
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-[#E2E8F0] px-5 pt-3 pb-6 space-y-4 shadow-xl animate-in slide-in-from-top duration-200">
            <div className="flex flex-col space-y-2.5 text-sm font-semibold text-slate-700">
              <a
                href="#"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2.5 rounded-xl text-[#0F766E] bg-teal-50/70 font-bold"
              >
                Home
              </a>
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2.5 rounded-xl hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Features
              </a>
              <a
                href="#solutions"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2.5 rounded-xl hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Solutions
              </a>
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2.5 rounded-xl hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Why PharmaPro
              </a>
              <a
                href="#contact"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2.5 rounded-xl hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Contact
              </a>
            </div>

            <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2.5">
              <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" size="sm" fullWidth className="text-xs h-10 rounded-xl font-bold">
                  Login
                </Button>
              </Link>
              <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="primary" size="sm" fullWidth className="text-xs h-10 rounded-xl font-bold bg-[#0F766E] hover:bg-[#0D645D]">
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
      <section className="relative overflow-hidden pt-10 pb-12 sm:pt-16 sm:pb-14 lg:pt-20 lg:pb-16 bg-gradient-to-b from-[#F0FDFA] via-[#F8FAFC] to-white">
        {/* Soft Ambient Radial Mint Glows */}
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-teal-200/25 rounded-full blur-3xl pointer-events-none -z-0" />
        <div className="absolute -top-20 -left-20 w-[420px] h-[420px] bg-cyan-100/35 rounded-full blur-3xl pointer-events-none -z-0" />
        
        {/* Subtle Decorative Background Dot Pattern */}
        <div className="absolute inset-0 opacity-[0.035] bg-[radial-gradient(#0F766E_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            {/* Left Column: Headline and Call-to-Actions */}
            <div className="lg:col-span-7 space-y-7 text-center lg:text-left">
              {/* Product Badge */}
              <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-teal-50/90 border border-teal-200 text-[#0F766E] text-xs font-bold tracking-wide uppercase shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>Intelligent Management • Better Pharmacy Operations</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#0F172A] tracking-tight leading-[1.08]">
                Smart Pharmacy Management for{" "}
                <span className="text-[#0F766E] bg-gradient-to-r from-[#0F766E] via-[#0D9488] to-[#14B8A6] bg-clip-text text-transparent">
                  Modern Pharmacies
                </span>
              </h1>

              {/* Supporting Copy */}
              <p className="text-slate-600 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0 font-normal">
                Manage your pharmacy stores, team, inventory, billing, and daily
                operations through one organized platform designed to simplify
                pharmacy management.
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link href="/register" className="w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto px-8 py-3.5 h-12 text-sm font-bold bg-[#0F766E] hover:bg-[#0D645D] text-white rounded-xl shadow-lg shadow-teal-900/15 hover:shadow-xl transition-all transform hover:-translate-y-0.5 inline-flex items-center justify-center gap-2"
                  >
                    <span>Register Now</span>
                    <ArrowRight className="w-4 h-4 ml-0.5" />
                  </Button>
                </Link>

                <Link href="/login" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto px-8 py-3.5 h-12 text-sm font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition-all inline-flex items-center justify-center"
                  >
                    <span>Login</span>
                  </Button>
                </Link>
              </div>

              {/* Security & Access Highlights */}
              <div className="pt-3 flex flex-wrap items-center justify-center lg:justify-start gap-y-2.5 gap-x-5 text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-teal-50 text-[#0F766E] flex items-center justify-center shrink-0 border border-teal-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E]" />
                  </div>
                  Owner Registration
                </span>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-teal-50 text-[#0F766E] flex items-center justify-center shrink-0 border border-teal-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E]" />
                  </div>
                  Direct Team Provisioning
                </span>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-teal-50 text-[#0F766E] flex items-center justify-center shrink-0 border border-teal-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E]" />
                  </div>
                  Multi-Branch Oversight
                </span>
              </div>
            </div>

            {/* Right Column: High Quality Pharmacy Image Showcase */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                {/* Glow ring */}
                <div className="absolute -inset-2 bg-gradient-to-r from-teal-500/20 via-cyan-500/15 to-teal-400/20 rounded-3xl blur-xl opacity-70 pointer-events-none" />

                {/* Main Image Frame */}
                <div className="relative rounded-3xl overflow-hidden border border-slate-200/90 bg-white shadow-2xl shadow-teal-950/10 aspect-4/3 sm:aspect-16/11 group">
                  <PharmacyImage
                    src="/images/hero-pharmacy.jpg"
                    alt="Pharmacist working in modern pharmacy with organized medicine shelves"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  />

                  {/* Overlay Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/10 to-transparent" />

                  {/* Caption badge at bottom */}
                  <div className="absolute bottom-4 left-4 right-4 p-3.5 bg-white/95 backdrop-blur-md rounded-2xl border border-white/60 shadow-lg flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center shrink-0 border border-teal-100">
                        <Store className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block leading-tight">
                          Branch Operations Hub
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Centralized store coordination
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  </div>
                </div>

                {/* Floating Indicator Chip: Multi-Store Security */}
                <div className="hidden sm:flex absolute -top-5 -left-6 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border border-slate-200/90 shadow-lg shadow-slate-900/5 items-center gap-3 text-xs">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold border border-emerald-100">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs leading-tight">
                      Role-Based Access
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Owners • Managers • Staff
                    </span>
                  </div>
                </div>

                {/* Floating Accent Chip: Live Sync */}
                <div className="hidden sm:flex absolute -bottom-3 -right-3 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200/90 shadow-md items-center gap-2 text-xs font-bold text-slate-800">
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                  <span>Multi-Branch Sync</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. TRUST & GENUINE PLATFORM BENEFITS BAR (4 FEATURE CARDS)
          ========================================================================= */}
      <section className="bg-white border-y border-slate-200/80 py-10 sm:py-14 lg:py-16 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0F766E] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block">
              Core Capabilities
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
              Built for Modern Pharmacy Excellence
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Essential enterprise infrastructure designed to coordinate stores, team, and security.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-5">
            {/* Card 1: Centralized Store Management */}
            <div className="group bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xl hover:border-teal-300 transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between space-y-4">
              <div className="space-y-3.5">
                <div className="w-11 h-11 rounded-2xl bg-teal-50 text-[#0F766E] flex items-center justify-center border border-teal-100 group-hover:bg-[#0F766E] group-hover:text-white transition-colors">
                  <Store className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">
                    Centralized Store Management
                  </h3>
                  <div className="w-8 h-1 bg-[#0F766E] rounded-full" />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Manage multiple retail branches and dispensaries under a single organization.
                </p>
              </div>

              {/* Dedicated Image */}
              <div className="space-y-2.5 pt-1">
                <div className="rounded-xl overflow-hidden aspect-16/10 border border-slate-100 bg-slate-50 relative">
                  <PharmacyImage
                    src="/images/modern-store.jpg"
                    alt="Modern pharmacy interior and medicine dispensary"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <Link
                  href="/register"
                  className="inline-flex items-center text-xs font-bold text-[#0F766E] group-hover:text-[#0D645D] gap-1.5 group-hover:translate-x-1 transition-transform"
                >
                  <span>Explore store branches</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Card 2: Role-Based Team Access */}
            <div className="group bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xl hover:border-teal-300 transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between space-y-4">
              <div className="space-y-3.5">
                <div className="w-11 h-11 rounded-2xl bg-teal-50 text-[#0F766E] flex items-center justify-center border border-teal-100 group-hover:bg-[#0F766E] group-hover:text-white transition-colors">
                  <Users className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">
                    Role-Based Team Access
                  </h3>
                  <div className="w-8 h-1 bg-[#0F766E] rounded-full" />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Specific roles for Owners, Managers, Pharmacists, and Cashiers with zero data spill.
                </p>
              </div>

              {/* Dedicated Image */}
              <div className="space-y-2.5 pt-1">
                <div className="rounded-xl overflow-hidden aspect-16/10 border border-slate-100 bg-slate-50 relative">
                  <PharmacyImage
                    src="/images/hero-pharmacist-wide.jpg"
                    alt="Professional pharmacy team and staff"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <Link
                  href="/login"
                  className="inline-flex items-center text-xs font-bold text-[#0F766E] group-hover:text-[#0D645D] gap-1.5 group-hover:translate-x-1 transition-transform"
                >
                  <span>Inspect role hierarchy</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Card 3: Secure Account Access */}
            <div className="group bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xl hover:border-teal-300 transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between space-y-4">
              <div className="space-y-3.5">
                <div className="w-11 h-11 rounded-2xl bg-teal-50 text-[#0F766E] flex items-center justify-center border border-teal-100 group-hover:bg-[#0F766E] group-hover:text-white transition-colors">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">
                    Secure Account Access
                  </h3>
                  <div className="w-8 h-1 bg-[#0F766E] rounded-full" />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Standard Argon2 password hashing with HttpOnly session cookies.
                </p>
              </div>

              {/* Dedicated Image: Custom Cybersecurity Shield */}
              <div className="space-y-2.5 pt-1">
                <div className="rounded-xl overflow-hidden aspect-16/10 border border-slate-100 bg-slate-900 relative">
                  <img
                    src="/images/secure-access.svg"
                    alt="Cybersecurity shield and Argon2 authentication security"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <Link
                  href="/login"
                  className="inline-flex items-center text-xs font-bold text-[#0F766E] group-hover:text-[#0D645D] gap-1.5 group-hover:translate-x-1 transition-transform"
                >
                  <span>Review security model</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Card 4: Organized Pharmacy Operations */}
            <div className="group bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xl hover:border-teal-300 transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between space-y-4">
              <div className="space-y-3.5">
                <div className="w-11 h-11 rounded-2xl bg-teal-50 text-[#0F766E] flex items-center justify-center border border-teal-100 group-hover:bg-[#0F766E] group-hover:text-white transition-colors">
                  <Activity className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">
                    Organized Pharmacy Operations
                  </h3>
                  <div className="w-8 h-1 bg-[#0F766E] rounded-full" />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Direct team creation, branch memberships, and audit trails.
                </p>
              </div>

              {/* Dedicated Image */}
              <div className="space-y-2.5 pt-1">
                <div className="rounded-xl overflow-hidden aspect-16/10 border border-slate-100 bg-slate-50 relative">
                  <PharmacyImage
                    src="/images/pharmacist-service.jpg"
                    alt="Pharmacist managing dispensing and clinic operations"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <Link
                  href="/register"
                  className="inline-flex items-center text-xs font-bold text-[#0F766E] group-hover:text-[#0D645D] gap-1.5 group-hover:translate-x-1 transition-transform"
                >
                  <span>Get started now</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. FEATURES SECTION
          ========================================================================= */}
      <section id="features" className="py-12 sm:py-16 lg:py-20 bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 sm:space-y-10">
          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto space-y-2.5">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* Feature 1: Store & Branch Management */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
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
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
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
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
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
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
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

            {/* Feature 5: Inventory Management */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                    <Package className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Available Now
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Inventory Management
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Batch tracking, inter-branch stock transfers, minimum quantity triggers,
                  and purchase orders built for pharmaceutical precision.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-[#0F766E] hover:underline gap-1 pt-2"
              >
                <span>Explore Inventory</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Feature 6: Sales and Billing (POS) */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Available Now
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Sales and Billing (POS)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Fast counter billing, prescription scanning, tax-compliant invoicing,
                  and cashier session reconciliation.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-[#0F766E] hover:underline gap-1 pt-2"
              >
                <span>Explore Billing</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Feature 7: Expiry and Low-Stock Alerts */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Available Now
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Expiry &amp; Low-Stock Alerts
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Early warning notifications for near-expiry medication batches and
                  critical threshold reordering alerts.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-[#0F766E] hover:underline gap-1 pt-2"
              >
                <span>Explore Medicine Safety</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Feature 8: Reports and Analytics */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Available Now
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Reports and Analytics
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Branch performance comparison, dispensing trends, and profit margins
                  for multi-store pharmacy enterprise owners.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-[#0F766E] hover:underline gap-1 pt-2"
              >
                <span>Explore Reports</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
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
