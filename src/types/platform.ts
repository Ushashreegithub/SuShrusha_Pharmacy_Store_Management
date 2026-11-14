/**
 * TypeScript definitions for DiracPharma Platform Administration
 * Matches backend `apps.platform` serializers.
 */

export interface PlatformActivityItem {
  id: string;
  event_type: string;
  timestamp: string;
  actor_email: string;
  organization_id: string | null;
  organization_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, any>;
}

export interface PlatformOverviewMetrics {
  total_organizations: number;
  active_organizations: number;
  suspended_organizations: number;
  total_users: number;
  active_users: number;
  inactive_users: number;
  total_stores: number;
  total_domains: number;
  verified_domains: number;
  pending_domains: number;
  active_sessions: number;
  recent_activity: PlatformActivityItem[];
}

export interface PlatformDomainSummary {
  id: string;
  domain: string;
  is_verified: boolean;
  is_primary: boolean;
  status: "active" | "suspended" | "pending";
}

export interface PlatformOrganizationListItem {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  is_active: boolean;
  stores_count: number;
  users_count: number;
  domains: PlatformDomainSummary[];
  created_at: string;
  updated_at: string;
}

export interface PlatformOwnerSummary {
  id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  created_at: string;
}

export interface PlatformStoreSummary {
  id: string;
  name: string;
  code: string;
  status: string;
  manager_name: string | null;
  manager_email: string | null;
  created_at: string;
}

export interface PlatformOrganizationDetail extends PlatformOrganizationListItem {
  owner: PlatformOwnerSummary | null;
  stores: PlatformStoreSummary[];
}

export interface PlatformStatusUpdatePayload {
  is_active: boolean;
  reason: string;
}

export interface PlatformStatusUpdateResponse {
  message: string;
  organization_id: string;
  is_active: boolean;
  revoked_sessions_count: number;
}

export interface PlatformPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PlatformOrganizationQueryParams {
  search?: string;
  status?: "active" | "suspended" | "";
  page?: number;
  page_size?: number;
}

// ==========================================
// Phase 4: Users & Accounts Interfaces
// ==========================================

export interface PlatformUserOrgMembership {
  id: string;
  name: string;
  slug: string;
  role: string;
  is_active: boolean;
  is_org_active: boolean;
}

export interface PlatformUserStoreMembership {
  id: string;
  name: string;
  code: string;
  role: string;
  is_active: boolean;
  organization_name: string;
}

export interface PlatformUserAuditItem {
  id: string;
  event_type: string;
  timestamp: string;
  ip_address: string | null;
  details: Record<string, any>;
}

export interface PlatformUserListItem {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  is_email_verified: boolean;
  must_change_password: boolean;
  created_at: string;
  last_login: string | null;
  organizations: PlatformUserOrgMembership[];
  stores: PlatformUserStoreMembership[];
}

export interface PlatformUserDetail extends PlatformUserListItem {
  audit_activity: PlatformUserAuditItem[];
}

export interface PlatformUserQueryParams {
  search?: string;
  organization_id?: string;
  role?: string;
  status?: "active" | "suspended" | "";
  page?: number;
  page_size?: number;
}

export interface PlatformTemporaryPasswordPayload {
  reason: string;
}

export interface PlatformTemporaryPasswordResponse {
  message: string;
  user_id: string;
  email: string;
  temporary_password: string;
  must_change_password: boolean;
}

export interface PlatformRevokeSessionsResponse {
  message: string;
  user_id: string;
  revoked_sessions_count: number;
}

// ==========================================
// Phase 4: Domains Interfaces
// ==========================================

export interface PlatformDomainItem {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_slug?: string;
  organization_is_active?: boolean;
  organization_created_at?: string;
  owner_name?: string | null;
  owner_email?: string | null;
  stores_count?: number;
  domain: string;
  domain_type: "client" | "platform";
  is_verified: boolean;
  verification_method?: "manual_admin" | "unverified";
  is_primary: boolean;
  status: "active" | "suspended" | "pending" | "revoked";
  created_at: string;
  updated_at: string;
}

export interface PlatformHostInfo {
  primary_platform_domain: string;
  configured_platform_domains: string[];
  configured_client_mappings: Array<{
    domain: string;
    in_database?: boolean;
    configured_target_slug?: string;
    organization_slug: string | null;
    organization_name: string | null;
    organization_id: string | null;
    organization_is_active: boolean | null;
    organization_created_at?: string | null;
    owner_name?: string | null;
    owner_email: string | null;
  }>;
}

export interface PlatformRegistrationHistoryItem {
  id: string;
  actor_email: string;
  actor_name: string;
  before_enabled: boolean;
  after_enabled: boolean;
  reason: string;
  timestamp: string;
}

export interface PlatformRegistrationSettings {
  public_registration_enabled: boolean;
  last_updated_reason: string;
  updated_at: string | null;
  updated_by_email: string | null;
  updated_by_name: string | null;
  history: PlatformRegistrationHistoryItem[];
  message?: string;
}

export interface PlatformRegistrationSettingsUpdatePayload {
  public_registration_enabled: boolean;
  reason: string;
}

export interface PlatformDomainCreatePayload {
  organization_id: string;
  domain: string;
  domain_type?: "client" | "platform";
  is_primary?: boolean;
}

export interface PlatformDomainQueryParams {
  search?: string;
  organization_id?: string;
  status?: "active" | "suspended" | "pending" | "revoked" | "";
  is_verified?: "true" | "false" | "";
  page?: number;
  page_size?: number;
}

export interface PlatformDomainVerifyPayload {
  reason: string;
}

export interface PlatformDomainStatusPayload {
  status: "active" | "suspended" | "pending" | "revoked";
  reason: string;
}

// ==========================================
// Phase 4: Login Activity Interfaces
// ==========================================

export interface PlatformLoginActivityItem {
  id: string;
  event_type: string;
  status: "SUCCESS" | "FAILED" | "LOGOUT" | "INFO";
  timestamp: string;
  user_id: string | null;
  user_email: string;
  organization_id: string | null;
  organization_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, any>;
}

export interface PlatformLoginActivityQueryParams {
  email?: string;
  organization_id?: string;
  status?: "SUCCESS" | "FAILED" | "";
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

// ==========================================
// Phase 4: Security & Audit Interfaces
// ==========================================

export interface PlatformAuditItem {
  id: string;
  event_type: string;
  timestamp: string;
  actor_email: string;
  organization_id: string | null;
  organization_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, any>;
}

export interface PlatformAuditQueryParams {
  event_type?: string;
  organization_id?: string;
  actor_email?: string;
  start_date?: string;
  end_date?: string;
  target_account?: string;
  page?: number;
  page_size?: number;
}
