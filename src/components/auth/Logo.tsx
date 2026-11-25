import React from "react";
import Link from "next/link";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  withTagline?: boolean;
  tagline?: string;
  href?: string;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = "md",
  withTagline = false,
  tagline,
  href = "/",
  className = "",
}) => {
  // Proportional icon sizing matched to brand text font size
  const iconConfig = {
    sm: { sizePx: 26, tw: "w-[26px] h-[26px]" },
    md: { sizePx: 36, tw: "w-[36px] h-[36px]" },
    lg: { sizePx: 46, tw: "w-10 h-10 sm:w-[46px] sm:h-[46px]" },
    xl: { sizePx: 56, tw: "w-12 h-12 sm:w-[56px] sm:h-[56px]" },
  };

  const textSizes = {
    sm: "text-lg tracking-tight",
    md: "text-xl sm:text-2xl tracking-tight",
    lg: "text-2xl sm:text-3xl tracking-tight",
    xl: "text-3xl sm:text-4xl tracking-tight",
  };

  const currentIcon = iconConfig[size] || iconConfig.md;

  const content = (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Official DiracAI Services company logo matching brand text height */}
      <div
        className={`${currentIcon.tw} flex-shrink-0 flex items-center justify-center p-0.5 rounded-xl bg-white shadow-2xs border border-slate-200/80`}
        style={{
          width: `${currentIcon.sizePx}px`,
          height: `${currentIcon.sizePx}px`,
        }}
      >
        <img
          src="/images/diracai-logo-compact.png"
          alt="DiracAI Services Logo"
          width={currentIcon.sizePx}
          height={currentIcon.sizePx}
          className="w-full h-full object-contain block drop-shadow-xs"
        />
      </div>

      <div className="flex flex-col text-left justify-center">
        <span
          className={`font-black text-[#0F172A] leading-none ${textSizes[size] || textSizes.md}`}
        >
          Pharma<span className="text-[#0F766E] font-black">Pro</span>
        </span>
        {withTagline && (
          <span className="text-[11px] text-slate-500 font-semibold tracking-normal mt-1">
            {tagline || "by DiracAI Services"}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center hover:opacity-95 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
};
