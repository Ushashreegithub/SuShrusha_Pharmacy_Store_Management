"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Globe,
  Settings,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { getCurrentUserApi, logoutApi } from "@/lib/api";
import { UserProfile } from "@/types/auth";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  ready: boolean;
  badge?: string;
}

interface NavSection {
  group: string;
  items: NavItem[];
}

interface PlatformLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PlatformLayout({
  children,
  title,
  subtitle,
  actions,
}: PlatformLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadAuth() {
      try {
        const profile = await getCurrentUserApi();
        if (!isMounted) return;

        if (!profile) {
          router.push(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }

        const isOwner =
          Boolean(profile.is_platform_admin) ||
          Boolean(profile.is_staff && profile.is_superuser);

        if (!isOwner) {
          setUnauthorized(true);
          setIsLoading(false);
          return;
        }

        setUser(profile);
      } catch (err) {
        console.error("Failed to authenticate platform session:", err);
        if (isMounted) {
          router.push(`/login?next=${encodeURIComponent(pathname)}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadAuth();
    return () => {
      isMounted = false;
    };
  }, [pathname, router]);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logoutApi();
    } catch (err) {
      console.warn("Logout request failed:", err);
    } finally {
      router.push("/login");
    }
  };

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-300">
          Authenticating PharmaPro Platform Administration...
        </p>
      </div>
    );
  }

  // Unauthorized Access Barrier
  if (unauthorized) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 text-center shadow-2xl">
          <div className="w-14 h-14 mx-auto mb-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">
            Platform Access Restricted
          </h2>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Your account is authenticated, but does not possess the requisite Platform Superuser credentials (<code className="text-rose-300 text-xs bg-slate-800 px-1.5 py-0.5 rounded">is_staff &amp; is_superuser</code>).
          </p>
          <div className="flex flex-col gap-2.5">
            <Link
              href="/dashboard"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Return to Pharmacy Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navLinks: NavSection[] = [
    {
      group: "Platform Management",
      items: [
        {
          label: "Domain Management",
          href: "/platform/domains",
          icon: Globe,
          active: pathname === "/platform" || pathname.startsWith("/platform/domains"),
          ready: true,
        },
        {
          label: "Registration Settings",
          href: "/platform/registration",
          icon: Settings,
          active: pathname.startsWith("/platform/registration"),
          ready: true,
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row text-slate-800">
      {/* ======================================================== */}
      {/* DESKTOP SIDEBAR (Dark Slate Theme: #0F172A) */}
      {/* ======================================================== */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0F172A] border-r border-slate-800 shrink-0">
        {/* Brand Banner */}
        <Link href="/platform" className="h-16 flex items-center px-5 border-b border-slate-800/80 gap-3 hover:bg-slate-900/50 transition-colors">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white text-base tracking-tight">PharmaPro</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Platform Administration</p>
          </div>
        </Link>

        {/* Navigation Groups */}
        <div className="flex-1 py-5 px-3 space-y-6 overflow-y-auto">
          {navLinks.map((section, idx) => (
            <div key={idx} className="space-y-1">
              <h3 className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {section.group}
              </h3>
              <div className="space-y-0.5 pt-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  if (!item.ready) {
                    return (
                      <div
                        key={item.label}
                        className="flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-500 rounded-lg cursor-not-allowed select-none opacity-60"
                        title="Available in Phase 4"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 text-slate-500" />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="text-[10px] font-medium bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        item.active
                          ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                          : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${item.active ? "text-white" : "text-slate-400"}`} />
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer info & DiracAI Services Attribution */}
        <div className="p-3 border-t border-slate-800/80 space-y-2">
          <div className="px-3 py-2.5 bg-slate-900/60 rounded-lg border border-slate-800/60 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Main Host</span>
              <span className="text-indigo-300 font-mono text-[10px]">pharmapro.diracai.com</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Developer</span>
              <span className="text-slate-200 font-semibold">DiracAI Services</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* MAIN CONTAINER */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200/80 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Breadcrumb / Platform Title */}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  Platform Admin
                </span>
                <span className="text-slate-300 hidden sm:inline">/</span>
                <span className="text-sm font-semibold text-slate-800 truncate hidden sm:inline">
                  {title || "Control Plane"}
                </span>
              </div>
            </div>
          </div>

          {/* Right Header items */}
          <div className="flex items-center gap-3">
            {/* Health pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>System Live</span>
            </div>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-expanded={userDropdownOpen}
              >
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center text-xs shadow-sm">
                  {user?.full_name?.charAt(0) || user?.email?.charAt(0) || "A"}
                </div>
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-semibold text-slate-800 truncate max-w-[150px]">
                    {user?.full_name || user?.email}
                  </div>
                  <div className="text-[10px] text-slate-500">Superuser</div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setUserDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-40 text-sm">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {user?.full_name || "Platform Admin"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                      <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[10px] font-medium text-indigo-700">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Platform Owner</span>
                      </div>
                    </div>

                    <button
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-rose-600 hover:bg-rose-50 transition-colors font-medium"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0F172A] border-b border-slate-800 px-4 py-3 space-y-4">
            {navLinks.map((section, idx) => (
              <div key={idx} className="space-y-1">
                <h3 className="px-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {section.group}
                </h3>
                <div className="space-y-1 pt-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    if (!item.ready) {
                      return (
                        <div
                          key={item.label}
                          className="flex items-center justify-between px-3 py-2 text-sm text-slate-500 rounded-lg opacity-50"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            <span>{item.label}</span>
                          </div>
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                            Phase 4
                          </span>
                        </div>
                      );
                    }
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg ${
                          item.active
                            ? "bg-indigo-600 text-white"
                            : "text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Page Title & Actions Sub-header */}
        {(title || actions) && (
          <div className="bg-white border-b border-slate-200/60 px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {title}
                </h1>
                {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
              </div>
              {actions && <div className="flex items-center gap-2.5">{actions}</div>}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
