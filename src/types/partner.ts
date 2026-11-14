export interface PartnerInfo {
  id: string;
  name: string;
  slug: string;
  domain: string;
}

export interface PartnerOverviewMetrics {
  total_pharmacies: number;
  active_pharmacies: number;
  inactive_pharmacies: number;
  total_stores: number;
  active_stores: number;
  total_managers: number;
  active_managers: number;
  pending_password_changes: number;
}

export interface PartnerAuditSummaryItem {
  id: string;
  event_type: string;
  actor_email: string | null;
  organization_id: string | null;
  organization_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface PartnerPrimaryManagerSummary {
  id: string;
  full_name: string;
  email: string;
  phone_number?: string;
  is_active: boolean;
  must_change_password: boolean;
}

export interface PartnerPharmacyItem {
  id: string;
  name: string;
  slug: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  license_number: string;
  gstin: string;
  notes: string;
  is_active: boolean;
  stores_count: number;
  active_stores_count: number;
  managers_count: number;
  primary_manager: PartnerPrimaryManagerSummary | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerStoreItem {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_is_active: boolean;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
  email: string;
  status: "setup" | "active" | "inactive";
  manager_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerManagerOrgSummary {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  role: string;
  membership_active: boolean;
}

export interface PartnerManagerStoreSummary {
  id: string;
  name: string;
  code: string;
  status: string;
  organization_id: string;
  organization_name: string;
  is_active: boolean;
}

export interface PartnerManagerItem {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  is_active: boolean;
  must_change_password: boolean;
  organizations: PartnerManagerOrgSummary[];
  assigned_stores: PartnerManagerStoreSummary[];
  created_at: string;
}

export interface PartnerOverviewResponse {
  partner: PartnerInfo;
  metrics: PartnerOverviewMetrics;
  recent_pharmacies: PartnerPharmacyItem[];
  recent_activity: PartnerAuditSummaryItem[];
}

export interface PartnerPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PartnerPharmacyDetailResponse {
  pharmacy: PartnerPharmacyItem;
  stores: PartnerStoreItem[];
  managers: PartnerManagerItem[];
}

export interface PartnerCreatePharmacyPayload {
  name: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  license_number?: string;
  gstin?: string;
  notes?: string;
  stores?: Array<{
    name: string;
    code?: string;
    address?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    phone?: string;
    email?: string;
    status?: "setup" | "active" | "inactive";
  }>;
  manager?: {
    full_name: string;
    email: string;
    phone_number?: string;
    password?: string;
  } | null;
}

export interface PartnerCreatePharmacyResponse {
  message: string;
  pharmacy: PartnerPharmacyItem;
  stores: PartnerStoreItem[];
  manager_credentials?: {
    user_id: string;
    full_name: string;
    email: string;
    temporary_password: string;
    must_change_password: boolean;
  };
}

export interface PartnerCreateStorePayload {
  organization_id: string;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  status?: "setup" | "active" | "inactive";
  manager_id?: string | null;
}

export interface PartnerCreateManagerPayload {
  organization_id: string;
  full_name: string;
  email: string;
  phone_number?: string;
  password?: string;
  store_ids?: string[];
}

export interface PartnerCreateManagerResponse {
  message: string;
  manager: PartnerManagerItem;
  temporary_password: string;
  must_change_password: boolean;
}

export interface PartnerResetPasswordResponse {
  message: string;
  user_id: string;
  email: string;
  temporary_password: string;
  must_change_password: boolean;
  revoked_sessions_count: number;
}

export interface PartnerOrganizationProfile {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  logo_url: string | null;
  contact_email: string;
  contact_phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  gstin: string;
  drug_license_number: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerUpdateProfilePayload {
  name?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  gstin?: string;
  drug_license_number?: string;
  description?: string;
}

export interface PartnerBranding {
  name: string;
  slug: string;
  logo_url: string | null;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
}
