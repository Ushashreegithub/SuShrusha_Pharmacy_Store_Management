import React from "react";

interface StatusBadgeProps {
  status: "active" | "inactive" | "pending" | "expired" | "used" | "store";
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className = "",
}) => {
  const config = {
    active: {
      text: label || "Active",
      bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    },
    inactive: {
      text: label || "Inactive",
      bg: "bg-rose-50 text-rose-700 border-rose-200",
      dot: "bg-rose-500",
    },
    pending: {
      text: label || "Pending",
      bg: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
    },
    expired: {
      text: label || "Expired",
      bg: "bg-slate-100 text-slate-700 border-slate-300",
      dot: "bg-slate-500",
    },
    used: {
      text: label || "Redeemed",
      bg: "bg-sky-50 text-sky-700 border-sky-200",
      dot: "bg-sky-500",
    },
    store: {
      text: label || "Store Code",
      bg: "bg-[#F0FDFA] text-[#0F766E] border-[#CCFBF1] font-semibold",
      dot: "bg-[#0F766E]",
    },
  };

  const current = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${current.bg} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      <span>{current.text}</span>
    </span>
  );
};
