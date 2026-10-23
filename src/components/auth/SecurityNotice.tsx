import React from "react";
import { ShieldCheck, Clock, KeyRound, Building2 } from "lucide-react";

interface SecurityNoticeProps {
  type: "owner-only" | "employee-link" | "session-invalidation" | "email-verification";
  className?: string;
}

export const SecurityNotice: React.FC<SecurityNoticeProps> = ({
  type,
  className = "",
}) => {
  const content = {
    "owner-only": {
      icon: <Building2 className="w-4 h-4 text-[#0F766E] flex-shrink-0" />,
      title: "Business Owner Registration Only",
      text: "Only pharmacy business owners register publicly here. Store managers, pharmacists, and staff accounts are created directly by the owner from the dashboard.",
    },
    "employee-link": {
      icon: <Clock className="w-4 h-4 text-[#0F766E] flex-shrink-0" />,
      title: "Direct Account Notice",
      text: "Staff accounts are directly created by store owners. Log in directly using your provided credentials.",
    },
    "session-invalidation": {
      icon: <KeyRound className="w-4 h-4 text-[#0F766E] flex-shrink-0" />,
      title: "Session Security Notice",
      text: "Resetting your password will automatically invalidate all existing active login sessions across all devices for your protection.",
    },
    "email-verification": {
      icon: <ShieldCheck className="w-4 h-4 text-[#0F766E] flex-shrink-0" />,
      title: "Mandatory Email Verification",
      text: "Owners must verify their corporate email before accessing store management features and creating pharmacy branches.",
    },
  };

  const item = content[type];

  return (
    <div
      className={`rounded-lg bg-[#F0FDFA] border border-[#CCFBF1] p-3 flex items-start gap-2.5 text-xs text-slate-700 ${className}`}
    >
      <div className="mt-0.5">{item.icon}</div>
      <div>
        <p className="font-semibold text-[#164E63] mb-0.5">{item.title}</p>
        <p className="leading-relaxed text-slate-600">{item.text}</p>
      </div>
    </div>
  );
};
