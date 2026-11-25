"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserProfile } from "@/types/auth";
import { Store } from "@/types/dashboard";
import { getCurrentUserApi, getStoresApi, logoutApi, switchActiveOrganizationApi } from "@/lib/api";

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
  switchOrganization: (organizationId: string) => Promise<void>;
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

  const switchOrganization = async (organizationId: string) => {
    const res = await switchActiveOrganizationApi(organizationId);
    setUser(res.user);
    if (typeof window !== "undefined") {
      localStorage.removeItem("pharmapro_active_store");
      localStorage.removeItem("sushrusha_active_store");
    }
    const storeList = await getStoresApi();
    setStores(storeList);
    const firstActive = storeList.find((s) => s.is_active !== false);
    setActiveStoreIdState(firstActive ? firstActive.id : storeList[0]?.id || null);
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
        if (u.must_change_password) {
          router.replace("/sushrusha/change-password");
          return;
        }

        // If user is a Partner Owner, route exclusively to Partner Administration
        if (u.portal_role === "PARTNER_OWNER" || Boolean(u.active_partner)) {
          router.replace("/sushrusha/partner");
          return;
        }

        // If user is a pure platform owner without pharmacy tenant membership, route to /platform
        if (u.is_platform_admin || (u.is_staff && u.is_superuser)) {
          if (!u.organizations || u.organizations.length === 0) {
            router.replace("/platform");
            return;
          }
        }

        // If active pharmacy subscription is expired, allow access to overview and subscription page
        const isCurrentExpired = Boolean(u.active_organization?.subscription?.is_expired);
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
        const isAllowedOnExpired =
          currentPath === "/dashboard" ||
          currentPath.startsWith("/dashboard/subscription") ||
          currentPath === "/subscription-expired";

        if (isCurrentExpired && !isAllowedOnExpired) {
          router.replace("/subscription-expired");
          return;
        }

        setUser(u);

        // Load stores
        try {
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
        } catch (storeErr: any) {
          if (storeErr?.code === "SUBSCRIPTION_EXPIRED") {
            if (!isAllowedOnExpired) {
              router.replace("/subscription-expired");
              return;
            }
          } else {
            console.warn("Could not load initial stores:", storeErr);
          }
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
    // 1. Authoritative active organization from server
    if (user.active_organization) {
      return {
        id: user.active_organization.id,
        name: user.active_organization.name,
        slug: user.active_organization.slug || "",
        logo_url: user.active_organization.logo_url || null,
      };
    }
    // 2. Fallbacks
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
        switchOrganization,
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

