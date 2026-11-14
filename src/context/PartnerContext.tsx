"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { PartnerBranding } from "@/types/partner";
import { getPartnerBrandingApi } from "@/lib/api";

interface PartnerContextType {
  branding: PartnerBranding | null;
  isLoading: boolean;
  error: string | null;
  refreshBranding: () => Promise<void>;
  updateBrandingState: (updated: Partial<PartnerBranding>) => void;
}

const defaultContext: PartnerContextType = {
  branding: null,
  isLoading: false,
  error: null,
  refreshBranding: async () => {},
  updateBrandingState: () => {},
};

const PartnerContext = createContext<PartnerContextType>(defaultContext);

export function PartnerProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<PartnerBranding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBranding = useCallback(async () => {
    try {
      const data = await getPartnerBrandingApi();
      setBranding(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load partner branding");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Synchronize dynamic browser title and favicon
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (branding?.name) {
      document.title = `${branding.name} — Partner Administration`;
    }

    if (branding?.logo_url) {
      let favicon = document.querySelector<HTMLLinkElement>("link#dynamic-partner-favicon");
      if (!favicon) {
        favicon = document.createElement("link");
        favicon.id = "dynamic-partner-favicon";
        favicon.rel = "icon";
        document.head.appendChild(favicon);
      }
      favicon.href = branding.logo_url;
    } else {
      const dynamicFavicon = document.querySelector<HTMLLinkElement>("link#dynamic-partner-favicon");
      if (dynamicFavicon) {
        dynamicFavicon.remove();
      }
    }
  }, [branding]);

  const updateBrandingState = useCallback((updated: Partial<PartnerBranding>) => {
    setBranding((prev) => (prev ? { ...prev, ...updated } : (updated as PartnerBranding)));
  }, []);

  return (
    <PartnerContext.Provider
      value={{
        branding,
        isLoading,
        error,
        refreshBranding: fetchBranding,
        updateBrandingState,
      }}
    >
      {children}
    </PartnerContext.Provider>
  );
}

export function usePartnerBranding() {
  const context = useContext(PartnerContext);
  return context || defaultContext;
}
