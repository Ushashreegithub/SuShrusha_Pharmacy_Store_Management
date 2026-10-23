export interface Store {
  id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  status: "setup" | "active" | "inactive";
  manager?: string | null;
  manager_name?: string | null;
  manager_email?: string | null;
  organization?: string;
  organization_name?: string;
  member_count?: number;
  role?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateStorePayload {
  name: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  status?: "setup" | "active" | "inactive";
}

export interface UpdateStorePayload {
  name?: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  status?: "setup" | "active" | "inactive";
}

export interface OrganizationOverviewMetrics {
  total_stores: number;
  active_stores: number;
  setup_stores: number;
  total_members: number;
  active_members: number;
  pending_invitations: number;
}

export interface AuditEventItem {
  id: string;
  event_type: string;
  user_email: string;
  user_name?: string;
  ip_address?: string;
  details: Record<string, any>;
  created_at: string;
}

export interface StoreSummaryItem {
  id: string;
  name: string;
  code: string;
  status: "setup" | "active" | "inactive";
  address?: string;
  phone?: string;
  city?: string;
  manager_name: string;
  manager_email?: string | null;
  active_members_count: number;
}

export interface OrganizationOverview {
  organization: {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    created_at: string;
  };
  metrics: OrganizationOverviewMetrics;
  recent_activity: AuditEventItem[];
  stores_summary: StoreSummaryItem[];
}

export interface Invitation {
  id: string;
  email: string;
  role: "manager" | "pharmacist" | "cashier" | "staff";
  status: "pending" | "accepted" | "revoked" | "expired";
  store: string;
  store_name: string;
  store_code: string;
  organization: string;
  organization_name: string;
  invited_by?: string;
  invited_by_name: string;
  expires_at: string;
  accepted_at?: string | null;
  created_at: string;
  emailDispatched?: boolean;
}

export interface CreateInvitationPayload {
  email: string;
  store_id: string;
  role: "manager" | "pharmacist" | "cashier" | "staff";
}

export interface StoreMember {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone_number?: string;
  store: string;
  store_name: string;
  store_code: string;
  role: "manager" | "pharmacist" | "cashier" | "staff" | "owner";
  is_active: boolean;
  created_at: string;
}

export interface TeamMemberStoreAssignment {
  membership_id: string;
  store_id: string;
  store_name: string;
  store_code: string;
  role: string;
  is_active: boolean;
}

export interface TeamMember {
  user_id: string;
  full_name: string;
  email: string;
  phone_number?: string;
  role?: string;
  is_active?: boolean;
  is_email_verified?: boolean;
  created_at: string;
  store_assignments: TeamMemberStoreAssignment[];
}

export interface CreateEmployeePayload {
  full_name: string;
  email: string;
  phone_number?: string;
  role: "manager" | "pharmacist" | "cashier" | "staff";
  store_ids: string[];
  password: string;
  confirm_password: string;
}

export interface UpdateEmployeePayload {
  full_name?: string;
  phone_number?: string;
  role?: "manager" | "pharmacist" | "cashier" | "staff";
  store_ids?: string[];
  is_active?: boolean;
}

export interface Product {
  id: string;
  name: string;
  brand_name: string;
  generic_name: string;
  sku: string;
  barcode: string;
  hsn_code: string;
  item_type: string;
  item_type_display?: string;
  category: string;
  category_display?: string;
  manufacturer: string;
  strength: string;
  dosage_form: string;
  dosage_form_display?: string;
  prescription_class: string;
  prescription_class_display?: string;
  is_narcotic: boolean;
  pack_description: string;
  base_unit: string;
  sale_unit: string;
  conversion_factor: number;
  is_loose_dispensing_allowed: boolean;
  gst_rate: string | number;
  storage_condition: string;
  storage_condition_display?: string;
  description?: string;
  is_active: boolean;
  created_by?: string;
  created_by_name?: string | null;
  updated_by?: string;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCreatePayload {
  name: string;
  brand_name?: string;
  generic_name?: string;
  sku: string;
  barcode?: string;
  hsn_code?: string;
  item_type?: string;
  category: string;
  manufacturer?: string;
  strength?: string;
  dosage_form?: string;
  prescription_class?: string;
  is_narcotic?: boolean;
  pack_description?: string;
  base_unit?: string;
  sale_unit?: string;
  conversion_factor?: number;
  is_loose_dispensing_allowed?: boolean;
  gst_rate?: string | number;
  storage_condition?: string;
  description?: string;
  is_active?: boolean;
}

export interface ProductListResponse {
  count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  results: Product[];
}

export interface ProductMetadata {
  categories: { value: string; label: string }[];
  item_types: { value: string; label: string }[];
  dosage_forms: { value: string; label: string }[];
  prescription_classes: { value: string; label: string }[];
  units: { value: string; label: string }[];
  storage_conditions: { value: string; label: string }[];
}



