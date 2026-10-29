"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserProfile } from "@/types/auth";
import { Store } from "@/types/dashboard";
import { getCurrentUserApi, getStoresApi, logoutApi } from "@/lib/api";

export interface ActiveOrganization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

interface DashboardContextType {
  user: UserProfile | null;
  organization: ActiveOrganization | null;
  stores: Store[];
  activeStore: Store | null;
  activeStoreId: string | null;
  setActiveStoreId: (id: string) => void;
  isLoading: boolean;
  refreshStores: () => Promise<void>;
  refreshUser: () => Promise<void>;
  handleLogout: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const u = await getCurrentUserApi();
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  const refreshStores = useCallback(async () => {
    try {
      const storeList = await getStoresApi();
      setStores(storeList);
      setActiveStoreIdState((prev) => {
        if (prev && storeList.some((s) => s.id === prev)) {
          return prev;
        }
        const firstActive = storeList.find((s) => s.is_active !== false);
        return firstActive ? firstActive.id : storeList[0]?.id || null;
      });
    } catch (err) {
      console.warn("Could not refresh stores:", err);
    }
  }, []);

  const setActiveStoreId = (id: string) => {
    setActiveStoreIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("pharmapro_active_store", id);
      localStorage.setItem("sushrusha_active_store", id);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch {
      // Ignore network errors on logout
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("pharmapro_active_store");
        localStorage.removeItem("sushrusha_active_store");
      }
      router.push("/login");
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function init() {
      setIsLoading(true);
      try {
        const u = await getCurrentUserApi();
        if (!isMounted) return;

        if (!u) {
          router.replace("/login");
          return;
        }
        setUser(u);

        // Load stores
        const storeList = await getStoresApi();
        if (!isMounted) return;
        setStores(storeList);

        // Saved active store
        const savedStoreId =
          typeof window !== "undefined"
            ? localStorage.getItem("pharmapro_active_store") ||
              localStorage.getItem("sushrusha_active_store")
            : null;
        if (savedStoreId && storeList.some((s) => s.id === savedStoreId)) {
          setActiveStoreIdState(savedStoreId);
        } else {
          const firstActive = storeList.find((s) => s.is_active !== false);
          setActiveStoreIdState(firstActive ? firstActive.id : storeList[0]?.id || null);
        }
      } catch (err) {
        console.error("Dashboard initialization error:", err);
        if (isMounted) router.replace("/login");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const activeStore = stores.find((s) => s.id === activeStoreId) || null;

  const organization: ActiveOrganization | null = React.useMemo(() => {
    if (!user) return null;
    if (user.organizations && user.organizations.length > 0) {
      const org = user.organizations[0];
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo_url: org.logo_url || null,
      };
    }
    if (user.stores && user.stores.length > 0) {
      const st = user.stores[0];
      return {
        id: st.organization_id || "",
        name: st.organization_name || "Pharmacy Entity",
        slug: "",
        logo_url: st.organization_logo_url || null,
      };
    }
    return null;
  }, [user]);

  return (
    <DashboardContext.Provider
      value={{
        user,
        organization,
        stores,
        activeStore,
        activeStoreId,
        setActiveStoreId,
        isLoading,
        refreshStores,
        refreshUser,
        handleLogout,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}

