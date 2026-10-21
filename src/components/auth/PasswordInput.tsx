import React, { useState, forwardRef } from "react";
import { Eye, EyeOff, Lock, AlertCircle } from "lucide-react";

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      label = "Password",
      error,
      helperText,
      required,
      id,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const inputId = id || label.toLowerCase().replace(/[^a-z0-9]/g, "-");

    return (
      <div className="w-full text-left">
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-slate-700"
          >
            {label}
            {required && <span className="text-red-500 ml-1 font-bold">*</span>}
          </label>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Lock className="w-4 h-4" />
          </div>
          <input
            ref={ref}
            id={inputId}
            type={showPassword ? "text" : "password"}
            disabled={disabled}
            className={`w-full rounded-lg text-sm bg-white border transition-all duration-150 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed pl-10 pr-10 py-2.5 ${
              error
                ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-100"
                : "border-[#E2E8F0] text-slate-900 focus:border-[#0F766E] focus:ring-[#0F766E]/15"
            } ${className}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={disabled}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4 text-slate-600" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            className="mt-1 text-xs text-red-600 flex items-center gap-1 font-medium"
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
          </p>
        )}
        {!error && helperText && (
          <p className="mt-1 text-xs text-slate-500">{helperText}</p>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
