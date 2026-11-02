"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";

interface SushrushaLogoProps {
  size?: "sm" | "md" | "lg";
  withTagline?: boolean;
  tagline?: string;
  href?: string;
  className?: string;
  variant?: "default" | "white";
  showAppName?: boolean;
  logoUrl?: string | null;
}

export const SushrushaLogo: React.FC<SushrushaLogoProps> = ({
  size = "md",
  withTagline = true,
  tagline = "Powered by DiracAI Services",
  href,
  className = "",
  variant = "default",
  showAppName = true,
  logoUrl,
}) => {
  const [imageError, setImageError] = useState(false);

  // Logo dimensions
  const iconConfig = {
    sm: { sizePx: 28, tw: "w-7 h-7" },
    md: { sizePx: 36, tw: "w-9 h-9" },
    lg: { sizePx: 48, tw: "w-12 h-12" },
  };

  const textSizes = {
    sm: "text-base tracking-tight",
    md: "text-lg tracking-tight",
    lg: "text-2xl tracking-tight",
  };

  const currentIcon = iconConfig[size];

  // Colors based on variant
  const isWhite = variant === "white";
  const primaryTextColor = isWhite ? "text-white" : "text-[#0F766E]";
  const secondaryTextColor = isWhite ? "text-teal-200" : "text-slate-800";
  const taglineColor = isWhite ? "text-teal-100/80" : "text-slate-500";

  // Clean static brand asset with graceful fallback
  const resolvedLogoUrl = logoUrl || "/images/sushrusha-logo.png";

  const content = (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Brand Icon / Logo */}
      <div
        className={`${currentIcon.tw} flex-shrink-0 flex items-center justify-center rounded-xl overflow-hidden shadow-2xs border ${
          isWhite ? "border-white/20 bg-white/10" : "border-teal-200 bg-white"
        }`}
        style={{
          width: `${currentIcon.sizePx}px`,
          height: `${currentIcon.sizePx}px`,
        }}
      >
        {!imageError ? (
          <img
            src={resolvedLogoUrl}
            alt="Sushrusha Pharmacy Logo"
            width={currentIcon.sizePx}
            height={currentIcon.sizePx}
            className="w-full h-full object-contain p-0.5"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-teal-600 text-white font-bold">
            <Building2 className={size === "sm" ? "w-4 h-4" : size === "md" ? "w-5 h-5" : "w-6 h-6"} />
          </div>
        )}
      </div>

      {/* Brand & Application Text */}
      <div className="flex flex-col text-left">
        <div className={`font-bold leading-none ${textSizes[size]}`}>
          <span className={primaryTextColor}>Sushrusha</span>{" "}
          <span className={secondaryTextColor}>
            {showAppName ? "Pharmacy Management" : "Pharmacy"}
          </span>
        </div>
        {withTagline && (
          <span className={`text-[10px] font-medium mt-1 leading-tight ${taglineColor}`}>
            {tagline}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex hover:opacity-95 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
};
