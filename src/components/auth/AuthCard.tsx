import React from "react";
import { Logo } from "./Logo";

interface AuthCardProps {
  children: React.ReactNode;
  headerIcon?: React.ReactNode;
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg";
  className?: string;
}

export const AuthCard: React.FC<AuthCardProps> = ({
  children,
  headerIcon,
  title,
  subtitle,
  badge,
  footer,
  maxWidth = "md",
  className = "",
}) => {
  const maxWidthClass = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-xl",
  }[maxWidth];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between py-10 px-4 sm:px-6 lg:px-8">
      {/* Top Header */}
      <header className="flex justify-center mb-6">
        <Logo size="md" withTagline={false} />
      </header>

      {/* Main Card */}
      <main className={`w-full ${maxWidthClass} mx-auto my-auto`}>
        <div
          className={`bg-white rounded-xl shadow-xs border border-[#E2E8F0] p-6 sm:p-8 ${className}`}
        >
          {(headerIcon || title || subtitle || badge) && (
            <div className="text-center mb-6">
              {headerIcon && (
                <div className="flex justify-center mb-3.5">{headerIcon}</div>
              )}
              {badge && <div className="flex justify-center mb-2">{badge}</div>}
              {title && (
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mt-1.5 text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
          )}

          <div>{children}</div>

          {footer && (
            <div className="mt-6 pt-5 border-t border-[#E2E8F0] text-center text-xs text-slate-500">
              {footer}
            </div>
          )}
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="text-center text-xs text-slate-400 mt-10 select-none">
        <p>© {new Date().getFullYear()} DiracPharma by DiracAI Services. All rights reserved.</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Secure Multi-Branch Architecture</p>
      </footer>
    </div>
  );
};
