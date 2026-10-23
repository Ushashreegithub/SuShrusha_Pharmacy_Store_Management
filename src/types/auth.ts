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
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
  is_email_verified: boolean;
  is_staff: boolean;
  primary_role?: "owner" | "manager" | "employee" | "none";
  created_at: string;
  organizations: OrganizationInfo[];
  stores: StoreInfo[];
}

export interface AuthResponse {
  message: string;
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
