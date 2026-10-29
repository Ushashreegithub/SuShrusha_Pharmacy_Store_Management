import React from "react";
import Link from "next/link";

interface LogoProps {
  size?: "sm" | "md" | "lg";
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
    sm: { sizePx: 22, tw: "w-[22px] h-[22px]" },
    md: { sizePx: 26, tw: "w-[26px] h-[26px]" },
    lg: { sizePx: 32, tw: "w-[32px] h-[32px]" },
  };

  const textSizes = {
    sm: "text-base tracking-tight",
    md: "text-lg tracking-tight",
    lg: "text-2xl tracking-tight",
  };

  const currentIcon = iconConfig[size];

  const content = (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      {/* Official DiracAI Services company logo matching brand text height */}
      <div
        className={`${currentIcon.tw} flex-shrink-0 flex items-center justify-center`}
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
          className="w-full h-full object-contain block"
          style={{
            maxWidth: `${currentIcon.sizePx}px`,
            maxHeight: `${currentIcon.sizePx}px`,
          }}
        />
      </div>

      <div className="flex flex-col text-left">
        <span
          className={`font-bold text-[#164E63] leading-none ${textSizes[size]}`}
        >
          Pharma<span className="text-[#0F766E] font-semibold">Pro</span>
        </span>
        {withTagline && (
          <span className="text-[11px] text-slate-500 font-medium mt-0.5">
            {tagline || "by DiracAI Services"}
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
