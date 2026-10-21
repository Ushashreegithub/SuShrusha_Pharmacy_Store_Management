import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
} from "lucide-react";

export interface AlertProps {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = "info",
  title,
  children,
  onClose,
  className = "",
}) => {
  const styles = {
    info: {
      container: "bg-teal-50/70 border-teal-200 text-teal-950",
      icon: <Info className="w-4 h-4 text-[#0F766E] flex-shrink-0 mt-0.5" />,
      titleColor: "text-[#0F766E]",
    },
    success: {
      container: "bg-emerald-50/70 border-emerald-200 text-emerald-950",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />,
      titleColor: "text-emerald-800",
    },
    warning: {
      container: "bg-amber-50/70 border-amber-200 text-amber-950",
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />,
      titleColor: "text-amber-800",
    },
    error: {
      container: "bg-rose-50/70 border-rose-200 text-rose-950",
      icon: <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />,
      titleColor: "text-rose-800",
    },
  };

  const current = styles[variant];

  return (
    <div
      role="alert"
      className={`border rounded-lg p-3 flex items-start gap-2.5 text-xs leading-relaxed transition-all ${current.container} ${className}`}
    >
      {current.icon}
      <div className="flex-1 min-w-0">
        {title && (
          <h4 className={`font-semibold mb-0.5 text-xs ${current.titleColor}`}>
            {title}
          </h4>
        )}
        <div className="text-slate-700 font-normal">{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors -mr-1"
          aria-label="Dismiss alert"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
