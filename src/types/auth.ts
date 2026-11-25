export type UserRole = "OWNER" | "STORE_MANAGER" | "PHARMACIST" | "CASHIER" | "INVENTORY_STAFF";

export interface OwnerRegistrationPayload {
  fullName: string;
  email: string;
  phoneNumber: string;
  organizationName: string;
  password: string;
  confirmPassword: string;
  agreeToTerms?: boolean;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
  confirm_new_password: string;
}

export interface EmployeeSetupPayload {
  password: string;
  confirmPassword: string;
  agreeToPolicy: boolean;
}

export type InvitationStatus = "valid" | "expired" | "used" | "invalid";

export interface EmployeeInvitationData {
  invitationId: string;
  fullName: string;
  email: string;
  role: UserRole;
  storeName: string;
  storeCode: string;
  assignedStores: string[];
  expiresAt: string; // ISO string 24h
  status: InvitationStatus;
}

export interface AuthValidationErrors {
  [key: string]: string | undefined;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
  is_owner: boolean;
  logo_url?: string | null;
}

export interface StoreInfo {
  id: string;
  name: string;
  code: string;
  role: string;
  status: string;
  is_active?: boolean;
  address?: string;
  phone?: string;
  organization_id?: string;
  organization_name?: string;
  organization_logo_url?: string | null;
}

export type PortalRole =
  | "PLATFORM_OWNER"
  | "PARTNER_OWNER"
  | "PHARMACY_MANAGER"
  | "PHARMACY_STAFF"
  | "NONE";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
  is_email_verified: boolean;
  is_staff: boolean;
  is_superuser?: boolean;
  is_platform_admin?: boolean;
  must_change_password?: boolean;
  portal_role?: PortalRole;
  active_partner?: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string | null;
  } | null;
  active_organization?: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    subscription?: {
      status: string;
      is_expired: boolean;
      is_valid: boolean;
      current_period_end: string | null;
    } | null;
  } | null;
  primary_role?: "owner" | "manager" | "employee" | "none";
  created_at: string;
  organizations: OrganizationInfo[];
  stores: StoreInfo[];
}

export interface AuthResponse {
  message: string;
  must_change_password?: boolean;
  active_organization?: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    subscription?: {
      status: string;
      is_expired: boolean;
      is_valid: boolean;
      current_period_end: string | null;
    } | null;
  } | null;
  user: UserProfile;
}

export interface RegisterResponse {
  message: string;
  email: string;
  organizationName: string;
  isEmailVerified: boolean;
}

export interface EmailVerificationResponse {
  message: string;
  email: string;
  isEmailVerified: boolean;
}
