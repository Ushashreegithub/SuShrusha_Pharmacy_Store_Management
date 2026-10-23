import React from "react";
import { Logo } from "./Logo";
import { ShieldCheck, Store, Users, CheckCircle2 } from "lucide-react";

interface AuthSplitLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export const AuthSplitLayout: React.FC<AuthSplitLayoutProps> = ({
  children,
  title,
  subtitle,
}) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      {/* Header bar */}
      <header className="max-w-5xl mx-auto w-full mb-6 flex items-center justify-between">
        <Logo size="md" withTagline={true} />
        <div className="text-xs text-slate-500 hidden sm:block">
          Enterprise Pharmacy SaaS
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto w-full my-auto">
        <div className="bg-white rounded-2xl shadow-xs border border-[#E2E8F0] overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
          {/* Left Minimal Brand Panel */}
          <div className="lg:col-span-5 bg-[#F0FDFA]/60 p-6 sm:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#E2E8F0]">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0F766E]/10 text-xs font-semibold text-[#0F766E] mb-5">
                <Store className="w-3.5 h-3.5" />
                <span>Multi-Store Management</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-[#164E63] leading-snug tracking-tight">
                Unified Pharmacy Operations Across All Your Branches
              </h2>

              <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">
                Centralized multi-store inventory tracking, role-based employee access, and secure pharmacy management.
              </p>

              {/* Minimal Clean Feature Checklist */}
              <div className="mt-8 space-y-3.5 text-xs">
                <div className="flex items-start gap-2.5 text-slate-700">
                  <div className="w-5 h-5 rounded bg-[#0F766E]/10 flex items-center justify-center flex-shrink-0 text-[#0F766E] mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 block">Owner Control:</span>
                    <span className="text-slate-500">Register once to manage all pharmacy branches centrally.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-slate-700">
                  <div className="w-5 h-5 rounded bg-[#0F766E]/10 flex items-center justify-center flex-shrink-0 text-[#0F766E] mt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 block">Direct Account Provisioning:</span>
                    <span className="text-slate-500">Staff sign in immediately with credentials created by store owners.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-slate-700">
                  <div className="w-5 h-5 rounded bg-[#0F766E]/10 flex items-center justify-center flex-shrink-0 text-[#0F766E] mt-0.5">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 block">Store-Level Permissions:</span>
                    <span className="text-slate-500">Assign store managers, pharmacists, and billing cashiers.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-[#E2E8F0] text-[11px] text-slate-400 flex items-center justify-between">
              <span>Encrypted Session Management</span>
              <span>HIPAA / Data Compliant</span>
            </div>
          </div>

          {/* Right Form Card Panel */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
            <div className="max-w-md mx-auto w-full">
              <div className="mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    {subtitle}
                  </p>
                )}
              </div>

              {children}
            </div>
          </div>
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="max-w-5xl mx-auto w-full text-center text-xs text-slate-400 mt-6 select-none">
        <p>© {new Date().getFullYear()} DiracPharma by DiracAI Services. All rights reserved.</p>
      </footer>
    </div>
  );
};
