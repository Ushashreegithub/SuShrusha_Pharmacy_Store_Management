"use client";

import React, { useState } from "react";
import { Store, Pill, ShieldCheck, HeartPulse } from "lucide-react";

interface PharmacyImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

export const PharmacyImage: React.FC<PharmacyImageProps> = ({
  src,
  alt,
  className = "",
}) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className={`bg-gradient-to-br from-teal-900 via-[#0F766E] to-[#164E63] flex flex-col items-center justify-center p-8 text-center text-white relative overflow-hidden select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
        
        <div className="relative z-10 flex flex-col items-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-teal-200 shadow-inner">
            <Store className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-sm tracking-tight text-white">
              DiracPharma Operations
            </h4>
            <p className="text-[11px] text-teal-100 max-w-xs leading-relaxed">
              Intelligent Management. Better Pharmacy Operations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`object-cover ${className}`}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
};

