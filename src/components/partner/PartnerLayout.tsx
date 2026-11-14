"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  PlusCircle,
  Store,
  UserCog,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Settings,
} from "lucide-react";
import { getCurrentUserApi, logoutApi } from "@/lib/api";
import { UserProfile } from "@/types/auth";
import { PartnerProvider, usePartnerBranding } from "@/context/PartnerContext";

interface PartnerLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PartnerLayout(props: PartnerLayoutProps) {
  return (
    <PartnerProvider>
      <PartnerLayoutContent {...props} />
    </PartnerProvider>
  );
}

function PartnerLayoutContent({
  children,
  title,
  subtitle,
  actions,
}: PartnerLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { branding } = usePartnerBranding();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    async function verifyPartnerSession() {
      try {
        const profile = await getCurrentUserApi();
        if (!active) return;

        if (!profile) {
          router.replace("/login");
          return;
        }

        if (profile.must_change_password) {
          router.replace("/change-password");
          return;
        }

        if (profile.portal_role !== "PARTNER_OWNER") {
          setUnauthorized(true);
          setIsLoading(false);
          return;
        }

        setUser(profile);
      } catch {
        if (active) {
          router.replace("/login");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    verifyPartnerSession();
    return () => {
      active = false;
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logoutApi();
    } catch {
      // Ignore logout network errors
    } finally {
      router.push("/login");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-[#0F766E] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-600">
          Loading Sushrusha Partner Administration...
        </p>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-[#E2E8F0] rounded-2xl p-6 text-center shadow-sm">
          <div className="w-12 h-12 mx-auto mb-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-center text-rose-600">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            Partner Administration Access Restricted
          </h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Your account does not hold Partner Owner permissions for this portal. Customer pharmacy staff and managers must use the Pharmacy Workspace.
          </p>
          <div className="flex flex-col gap-2.5">
            <Link
              href="/dashboard"
              className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-[#0F766E] hover:bg-[#0D645D] text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Go to Pharmacy Dashboard
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Strictly the 6 Partner Administration sections required by specification
  const navItems = [
    {
      label: "Overview",
      href: "/sushrusha/partner",
      icon: LayoutDashboard,
      active: pathname === "/sushrusha/partner",
    },
    {
      label: "Customer Pharmacies",
      href: "/sushrusha/partner/pharmacies",
      icon: Building2,
      active:
        pathname === "/sushrusha/partner/pharmacies" ||
        (pathname.startsWith("/sushrusha/partner/pharmacies/") &&
          !pathname.startsWith("/sushrusha/partner/pharmacies/create")),
    },
    {
      label: "Create Pharmacy",
      href: "/sushrusha/partner/pharmacies/create",
      icon: PlusCircle,
      active: pathname.startsWith("/sushrusha/partner/pharmacies/create"),
    },
    {
      label: "Store Management",
      href: "/sushrusha/partner/stores",
      icon: Store,
      active: pathname.startsWith("/sushrusha/partner/stores"),
    },
    {
      label: "Manager Accounts",
      href: "/sushrusha/partner/managers",
      icon: UserCog,
      active: pathname.startsWith("/sushrusha/partner/managers"),
    },
    {
      label: "Account Management",
      href: "/sushrusha/partner/accounts",
      icon: ShieldCheck,
      active: pathname.startsWith("/sushrusha/partner/accounts"),
    },
    {
      label: "Organization Settings",
      href: "/sushrusha/partner/settings/organization",
      icon: Settings,
      active: pathname.startsWith("/sushrusha/partner/settings/organization"),
    },
  ];

  const partnerName = branding?.name || user?.active_partner?.name || "Sushrusha E-Clinic";
  const logoUrl = branding?.logo_url || user?.active_partner?.logo_url;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row text-slate-800">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0F292E] border-r border-teal-950 shrink-0 text-white">
        <Link
          href="/sushrusha/partner"
          className="h-16 flex items-center px-5 border-b border-teal-900/70 gap-3 hover:bg-teal-950/50 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-[#0F766E] flex items-center justify-center text-white shadow-sm overflow-hidden shrink-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={partnerName}
                className="w-full h-full object-contain p-0.5"
              />
            ) : (
              <Building2 className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-white text-sm tracking-tight block truncate">
              {partnerName}
            </span>
            <p className="text-[11px] text-teal-300/90 font-medium">
              Partner Administration
            </p>
          </div>
        </Link>

        <div className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
          <h3 className="px-3 pb-2 text-[11px] font-semibold text-teal-300/70 uppercase tracking-wider">
            Partner Control Panel
          </h3>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                  item.active
                    ? "bg-[#0F766E] text-white shadow-xs"
                    : "text-teal-100/80 hover:text-white hover:bg-teal-900/50"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-teal-900/70 text-[11px] text-teal-200/70 space-y-1">
          <p className="font-semibold text-teal-100">Powered by PharmaPro</p>
          <p>DiracAI Services SaaS Infrastructure</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-[#E2E8F0] px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Toggle partner menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="min-w-0">
              {title && (
                <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-xs text-slate-500 truncate hidden sm:block">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {actions}

            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E2E8F0] bg-slate-50 hover:bg-white text-xs font-medium text-slate-800 transition"
              >
                <div className="w-6 h-6 rounded-full bg-[#0F766E] text-white flex items-center justify-center font-bold text-[11px]">
                  {(user?.full_name || "P").charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block text-left">
                  <span className="block font-semibold text-slate-900 leading-tight">
                    {user?.full_name}
                  </span>
                  <span className="block text-[10px] text-[#0F766E] font-medium">
                    Partner Owner
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl border border-[#E2E8F0] shadow-lg py-1.5 z-40">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {user?.full_name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                  </div>
                  <button
                    type="button"
                    disabled={loggingOut}
                    onClick={handleLogout}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0F292E] text-white px-4 py-3 space-y-1 border-b border-teal-900">
            <div className="flex items-center gap-3 px-3 py-2 mb-2 border-b border-teal-900/60">
              <div className="w-8 h-8 rounded-lg bg-[#0F766E] flex items-center justify-center text-white shadow-sm overflow-hidden shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt={partnerName} className="w-full h-full object-contain p-0.5" />
                ) : (
                  <Building2 className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <span className="font-bold text-white text-xs block truncate">{partnerName}</span>
                <p className="text-[10px] text-teal-300 font-medium">Partner Administration</p>
              </div>
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-xl ${
                    item.active
                      ? "bg-[#0F766E] text-white"
                      : "text-teal-100/80 hover:bg-teal-900/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
