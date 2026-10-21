import React from "react";
import Link from "next/link";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  withTagline?: boolean;
  href?: string;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = "md",
  withTagline = false,
  href = "/",
  className = "",
}) => {
  const iconSizes = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-11 h-11",
  };

  const textSizes = {
    sm: "text-base tracking-tight",
    md: "text-lg tracking-tight",
    lg: "text-2xl tracking-tight",
  };

  const content = (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Minimal, modern healthcare cross icon in deep teal and primary teal */}
      <div
        className={`${iconSizes[size]} rounded-lg bg-[#0F766E] flex items-center justify-center flex-shrink-0 shadow-xs relative`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5 text-white"
        >
          {/* Medical cross with rounded clean edges */}
          <path
            d="M12 5V19M5 12H19"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex flex-col text-left">
        <span
          className={`font-bold text-[#164E63] leading-none ${textSizes[size]}`}
        >
          Sushrusha <span className="text-[#0F766E] font-semibold">Pharmacy</span>
        </span>
        {withTagline && (
          <span className="text-[11px] text-slate-500 font-normal mt-0.5">
            Store Management System
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
};
