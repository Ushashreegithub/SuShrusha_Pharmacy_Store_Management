"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Building2,
  ShieldCheck,
  Activity,
  Package,
  CreditCard,
  ArrowRight,
  CheckCircle2,
  Lock,
  Clock,
  Sparkles,
  Menu,
  X,
  Phone,
  Mail,
  MapPin,
  Stethoscope,
  HeartPulse,
  Pill,
  BarChart3,
  Layers,
} from "lucide-react";
import { SushrushaLogo } from "@/components/sushrusha/SushrushaLogo";
import { Button } from "@/components/ui/Button";

export default function SushrushaHomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col selection:bg-teal-100 selection:text-teal-900">
      {/* =========================================================================
          1. HEADER / NAVBAR
          ========================================================================= */}
      <header className="bg-white border-b border-[#E2E8F0] shadow-2xs sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          {/* Brand Logo */}
          <SushrushaLogo size="md" href="/sushrusha" withTagline={true} />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-600">
            <a href="#services" className="hover:text-[#0F766E] transition-colors">
              Pharmacy Services
            </a>
            <a href="#operations" className="hover:text-[#0F766E] transition-colors">
              Operations & Dispensing
            </a>
            <a href="#standards" className="hover:text-[#0F766E] transition-colors">
              Quality & Safety
            </a>
            <a href="#about" className="hover:text-[#0F766E] transition-colors">
              About Sushrusha
            </a>
          </nav>

          {/* Desktop Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/sushrusha/login">
              <Button
                variant="primary"
                size="sm"
                className="text-xs font-bold px-4 bg-[#0F766E] hover:bg-[#0D645D] flex items-center gap-1.5 shadow-2xs"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Staff & Pharmacist Login</span>
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <Link href="/sushrusha/login">
              <Button variant="primary" size="sm" className="text-xs px-2.5 py-1 bg-[#0F766E]">
                Sign In
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
                href="#services"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Pharmacy Services
              </a>
              <a
                href="#operations"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Operations & Dispensing
              </a>
              <a
                href="#standards"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-50 hover:text-[#0F766E]"
              >
                Quality & Safety
              </a>
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-50 hover:text-[#0F766E]"
              >
                About Sushrusha
              </a>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <Link href="/sushrusha/login" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full justify-center bg-[#0F766E] text-xs font-bold">
                  Staff & Pharmacist Login
                </Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          2. HERO SECTION
          ========================================================================= */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#F0FDFA]/70 via-[#F8FAFC] to-white pt-12 pb-16 lg:pt-20 lg:pb-24 border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Text & CTAs */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-xs font-semibold text-[#0F766E]">
                <HeartPulse className="w-3.5 h-3.5" />
                <span>Professional Healthcare & Ethical Dispensing</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Quality Healthcare & Trusted Medicines for Every Family
              </h1>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                Welcome to <strong>Sushrusha Pharmacy</strong>. We provide authentic, quality-verified medicines, professional pharmacist counseling, and modern retail pharmacy care across our community dispensing counters.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <Link href="/sushrusha/login">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto text-sm font-bold bg-[#0F766E] hover:bg-[#0D645D] text-white px-6 py-3 shadow-md flex items-center justify-center gap-2"
                  >
                    <span>Staff Portal Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <a
                  href="#services"
                  className="px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center transition shadow-2xs"
                >
                  Explore Services
                </a>
              </div>

              {/* Verified Operational Highlights */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-200/80">
                <div>
                  <div className="text-xl sm:text-2xl font-extrabold text-[#0F766E]">100%</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">Verified Genuine Batches</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-extrabold text-[#0F766E]">FEFO</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">Strict Expiry Protection</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-extrabold text-[#0F766E]">GST Ready</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">Digital Tax Invoices</div>
                </div>
              </div>
            </div>

            {/* Right Column: Hero Image Card */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200 bg-white">
                <img
                  src="/images/hero-pharmacist-wide.jpg"
                  alt="Sushrusha Pharmacy Dispensing Counter"
                  className="w-full h-80 sm:h-96 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent flex flex-col justify-end p-6 text-white">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/20 backdrop-blur-xs text-[11px] font-semibold text-white mb-2 self-start">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Pharmacy Practice Standards</span>
                  </div>
                  <h3 className="font-bold text-lg sm:text-xl">Sushrusha Pharmacy Care</h3>
                  <p className="text-xs text-slate-200 mt-1">
                    Operated with professional pharmacist verification and patient-centric care.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. PHARMACY SERVICES
          ========================================================================= */}
      <section id="services" className="py-16 bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Comprehensive Retail Pharmacy Services
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-2">
              Ensuring precise dispensing, safety standards, and transparent billing for all healthcare needs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-md transition">
              <div className="w-10 h-10 rounded-xl bg-teal-100 text-[#0F766E] flex items-center justify-center mb-4">
                <Pill className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1.5">Prescription Dispensing</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Qualified pharmacist verification on all Schedule H and prescription medicines with exact dosage instructions.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-md transition">
              <div className="w-10 h-10 rounded-xl bg-teal-100 text-[#0F766E] flex items-center justify-center mb-4">
                <Stethoscope className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1.5">Healthcare Guidance & Counseling</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Patient-first counseling on medication adherence, contraindications, and appropriate OTC wellness guidance.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-md transition">
              <div className="w-10 h-10 rounded-xl bg-teal-100 text-[#0F766E] flex items-center justify-center mb-4">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1.5">Transparent Digital Invoicing</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                GST-compliant itemized receipts with batch numbers, expiry dates, HSN codes, and flexible payment options.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. OPERATIONS & DISPENSING EXCELLENCE (Replaces unapproved branch listings)
          ========================================================================= */}
      <section id="operations" className="py-16 bg-[#F8FAFC] border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#0F766E]">Operational Excellence</div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                Modern Pharmacy Management Infrastructure
              </h2>
            </div>
            <p className="text-xs text-slate-500 sm:max-w-xs mt-2 sm:mt-0">
              Technology-enabled dispensing accuracy designed for community pharmacies and multi-branch networks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Synchronized Inventory</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Real-time visibility across all active store locations, ensuring reliable availability of essential medicines.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Batch-Level Traceability</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                End-to-end audit tracking from supplier inwarding to customer dispensing with strict FEFO lot selection.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Regulatory Compliance</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Automated drug schedule enforcement, tax compliance, and digital prescription authorization safeguards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. QUALITY & SAFETY STANDARDS
          ========================================================================= */}
      <section id="standards" className="py-16 bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-[#0F766E]">Pharmacy Assurance</div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Dispensing Integrity & Patient Safety Standards
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Every medicine dispensed through Sushrusha Pharmacy adheres to verified batch standards, cold-chain preservation guidelines, and professional pharmacist sign-off.
              </p>

              <div className="space-y-3 pt-2">
                {[
                  "First-Expired First-Out (FEFO) automated batch prioritization",
                  "Prescription verification strictly enforced for Schedule H/H1/Rx drugs",
                  "Secure digital receipts preventing billing discrepancies",
                  "Strict quarantine protocol for expired or recalled medicine lots",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-[#0F766E] shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md">
                <img
                  src="/images/modern-store.jpg"
                  alt="Modern Pharmacy Counter"
                  className="w-full h-72 sm:h-80 object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. FOOTER (Branded for Sushrusha & Powered by DiracAI Services)
          ========================================================================= */}
      <footer id="about" className="bg-slate-900 text-slate-300 py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-6 space-y-3">
              <SushrushaLogo size="md" variant="white" withTagline={true} />
              <p className="text-xs text-slate-400 max-w-sm mt-2 leading-relaxed">
                Sushrusha Pharmacy is a healthcare dispensing entity committed to community wellness, authentic medicines, and ethical pharmacy service.
              </p>
            </div>

            <div className="md:col-span-3 space-y-2 text-xs">
              <div className="font-bold text-white uppercase tracking-wider text-[11px]">Staff Access</div>
              <ul className="space-y-1.5 text-slate-400">
                <li>
                  <Link href="/sushrusha/login" className="hover:text-white transition">
                    Sushrusha Portal Login
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-white transition">
                    Platform Master Login
                  </Link>
                </li>
              </ul>
            </div>

            <div className="md:col-span-3 space-y-2 text-xs">
              <div className="font-bold text-white uppercase tracking-wider text-[11px]">Powered By</div>
              <p className="text-slate-400 leading-relaxed">
                <strong>DiracAI Services</strong>
                <br />
                Enterprise Pharmacy Management & Intelligent POS System.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-3">
            <div>
              © {new Date().getFullYear()} <strong>Sushrusha Pharmacy Management</strong>. All rights reserved.
            </div>
            <div className="text-slate-400">
              Product provider: <span className="text-teal-400 font-semibold">DiracAI Services</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
