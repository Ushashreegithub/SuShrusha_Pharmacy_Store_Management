import React from "react";
import { Check, X } from "lucide-react";

interface PasswordStrengthMeterProps {
  password: string;
  showRequirements?: boolean;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  password,
  showRequirements = true,
}) => {
  const criteria = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special symbol", met: /[^A-Za-z0-9]/.test(password) },
  ];

  const score = criteria.filter((c) => c.met).length;

  const getStrengthInfo = () => {
    if (!password) return { label: "", color: "bg-slate-200", textColor: "text-slate-400", width: "w-0" };
    if (score <= 2) return { label: "Weak", color: "bg-rose-500", textColor: "text-rose-600", width: "w-1/4" };
    if (score === 3) return { label: "Fair", color: "bg-amber-500", textColor: "text-amber-600", width: "w-2/4" };
    if (score === 4) return { label: "Good", color: "bg-teal-600", textColor: "text-[#0F766E]", width: "w-3/4" };
    return { label: "Strong", color: "bg-emerald-600", textColor: "text-emerald-700", width: "w-full" };
  };

  const strength = getStrengthInfo();

  if (!password && !showRequirements) return null;

  return (
    <div className="mt-2 space-y-2">
      {password && (
        <div>
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="text-slate-500">Strength:</span>
            <span className={`font-semibold ${strength.textColor}`}>{strength.label}</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${strength.color} ${strength.width}`}
            />
          </div>
        </div>
      )}

      {showRequirements && (
        <div className="grid grid-cols-2 gap-1 text-[11px] pt-1">
          {criteria.map((c, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-1.5 ${
                c.met ? "text-emerald-700 font-medium" : "text-slate-400"
              }`}
            >
              {c.met ? (
                <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" />
              ) : (
                <X className="w-3 h-3 text-slate-300 flex-shrink-0" />
              )}
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
