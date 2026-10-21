import React, { forwardRef } from "react";

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, id, className = "", ...props }, ref) => {
    const inputId = id || "checkbox-" + Math.random().toString(36).substring(2, 9);

    return (
      <div className="w-full text-left">
        <label
          htmlFor={inputId}
          className="flex items-start gap-2.5 cursor-pointer select-none group text-xs text-slate-600 leading-relaxed"
        >
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            className={`mt-0.5 h-4 w-4 rounded border-slate-300 text-[#005C53] focus:ring-[#005C53] focus:ring-offset-0 cursor-pointer accent-[#005C53] ${className}`}
            {...props}
          />
          <span className="group-hover:text-slate-800 transition-colors">
            {label}
          </span>
        </label>
        {error && (
          <p className="mt-1 text-xs text-red-600 pl-6.5 font-medium">{error}</p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";

