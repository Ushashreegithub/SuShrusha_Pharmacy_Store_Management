"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sushrusha/change-password");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
      <div className="w-8 h-8 border-2 border-teal-700 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm text-slate-600 font-medium">Redirecting to password setup...</p>
    </div>
  );
}
