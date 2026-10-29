import {
  OwnerRegistrationPayload,
  RegisterResponse,
  EmailVerificationResponse,
  UserProfile,
  AuthResponse,
  StoreInfo,
  ChangePasswordPayload,
} from "@/types/auth";
import {
  Store,
  CreateStorePayload,
  UpdateStorePayload,
  OrganizationOverview,
  StoreMember,
  TeamMember,
  CreateEmployeePayload,
  UpdateEmployeePayload,
  AuditEventItem,
  Product,
  ProductCreatePayload,
  ProductListResponse,
  ProductMetadata,
} from "@/types/dashboard";

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname || "localhost";
    return `${window.location.protocol}//${host}:8000/api`;
  }
  return "http://localhost:8000/api";
}

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"
).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    code?: string,
    fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Generic interface for paginated responses returned by Django REST Framework.
 */
export interface PaginatedResponse<T> {
  count: number;
  num_pages?: number;
  total_pages?: number;
  current_page: number;
  page_size: number;
  results: T[];
}

/**
 * Safely extracts an array from either a plain array response or a Django paginated response object.
 * Returns an empty array if the input is null, undefined, or missing a valid results array.
 */
export function extractList<T>(data: T[] | { results?: T[] } | null | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && Array.isArray((data as any).results)) {
    return (data as any).results;
  }
  return [];
}

/**
 * Retrieve CSRF token from document cookie
 */
export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Fetch and establish CSRF token cookie from Django backend
 */
export async function ensureCsrfToken(): Promise<string | null> {
  let token = getCsrfTokenFromCookie();
  if (token) return token;

  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/auth/csrf/`, {
      method: "GET",
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      token = data.csrfToken || getCsrfTokenFromCookie();
    }
  } catch (err) {
    console.warn("Could not fetch CSRF token from backend:", err);
  }
  return token;
}

/**
 * Standard HTTP fetch wrapper with CSRF injection and credential management
 */
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string>),
  };

  const method = (options.method || "GET").toUpperCase();

  // Attach CSRF token on state-changing requests
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    if (!headers["Content-Type"] && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    let csrf = getCsrfTokenFromCookie();
    if (!csrf) {
      csrf = await ensureCsrfToken();
    }
    if (csrf) {
      headers["X-CSRFToken"] = csrf;
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (networkError) {
    console.error("API Network Error:", networkError, "Requested URL:", url);
    throw new ApiError(
      "Unable to connect to the PharmaPro backend service. Please check that the server is running.",
      0
    );
  }

  // Parse response
  let data: any = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    let errorMessage = "An unexpected error occurred.";
    let fieldErrors: Record<string, string> | undefined = undefined;
    let code: string | undefined = undefined;

    if (data) {
      if (typeof data.detail === "string") {
        errorMessage = data.detail;
      } else if (typeof data.message === "string") {
        errorMessage = data.message;
      }

      if (data.code) {
        code = String(data.code);
      }

      // Check field errors
      if (typeof data === "object" && !Array.isArray(data)) {
        fieldErrors = {};
        for (const [key, val] of Object.entries(data)) {
          if (key !== "detail" && key !== "message" && key !== "code") {
            fieldErrors[key] = Array.isArray(val) ? val.join(" ") : String(val);
          }
        }
        if (Object.keys(fieldErrors).length === 0) {
          fieldErrors = undefined;
        } else if (!data.detail && !data.message) {
          const firstKey = Object.keys(fieldErrors)[0];
          errorMessage = fieldErrors[firstKey];
        }
      }
    } else {
      errorMessage = `Server responded with error status ${response.status}.`;
    }

    throw new ApiError(errorMessage, response.status, code, fieldErrors);
  }

  return data as T;
}

// -----------------------------------------------------------------------------
// Authentication API Methods
// -----------------------------------------------------------------------------

export async function registerOwnerApi(
  payload: OwnerRegistrationPayload
): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>("/auth/register/owner/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyEmailApi(
  token: string
): Promise<EmailVerificationResponse> {
  return apiFetch<EmailVerificationResponse>("/auth/verify-email/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function resendVerificationApi(
  email: string
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/resend-verification/", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function loginApi(payload: {
  email: string;
  password: string;
  rememberMe?: boolean;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logoutApi(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/logout/", {
    method: "POST",
  });
}

export async function requestPasswordResetApi(
  email: string
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/password-reset/request/", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordResetApi(payload: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/password-reset/confirm/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCurrentUserApi(): Promise<UserProfile | null> {
  try {
    return await apiFetch<UserProfile>("/auth/me/");
  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      return null;
    }
    throw err;
  }
}

export async function getStoresApi(params?: {
  search?: string;
  status?: string;
}): Promise<Store[]> {
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.status) query.append("status", params.status);
  const qStr = query.toString();
  return apiFetch<Store[]>(`/organizations/stores/${qStr ? `?${qStr}` : ""}`);
}

export async function createStoreApi(payload: CreateStorePayload): Promise<Store> {
  return apiFetch<Store>("/organizations/stores/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getStoreDetailApi(storeId: string): Promise<Store> {
  return apiFetch<Store>(`/organizations/stores/${storeId}/`);
}

export async function updateStoreApi(
  storeId: string,
  payload: UpdateStorePayload
): Promise<Store> {
  return apiFetch<Store>(`/organizations/stores/${storeId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function assignStoreManagerApi(
  storeId: string,
  email: string
): Promise<Store> {
  return apiFetch<Store>(`/organizations/stores/${storeId}/assign-manager/`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function getStoreMembersApi(storeId: string): Promise<StoreMember[]> {
  return apiFetch<StoreMember[]>(`/organizations/stores/${storeId}/members/`);
}

export async function addStoreMemberApi(
  storeId: string,
  payload: { email: string; role: string }
): Promise<StoreMember> {
  return apiFetch<StoreMember>(`/organizations/stores/${storeId}/members/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateStoreMemberStatusApi(
  storeId: string,
  membershipId: string,
  payload: { is_active?: boolean; role?: string }
): Promise<StoreMember> {
  return apiFetch<StoreMember>(
    `/organizations/stores/${storeId}/members/${membershipId}/`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function changePasswordApi(
  payload: ChangePasswordPayload
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/change-password/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOrganizationOverviewApi(): Promise<OrganizationOverview> {
  return apiFetch<OrganizationOverview>("/organizations/overview/");
}

export async function getOrganizationTeamApi(): Promise<TeamMember[]> {
  return apiFetch<TeamMember[]>("/organizations/team/");
}

export async function createEmployeeApi(
  payload: CreateEmployeePayload
): Promise<{ message: string; user: TeamMember }> {
  return apiFetch<{ message: string; user: TeamMember }>("/organizations/team/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTeamMemberDetailApi(userId: string): Promise<TeamMember> {
  return apiFetch<TeamMember>(`/organizations/team/${userId}/`);
}

export async function updateTeamMemberApi(
  userId: string,
  payload: UpdateEmployeePayload
): Promise<TeamMember> {
  return apiFetch<TeamMember>(`/organizations/team/${userId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export interface OrganizationBranding {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

export async function getOrganizationBrandingApi(): Promise<OrganizationBranding> {
  return apiFetch<OrganizationBranding>("/organizations/branding/");
}

export async function uploadOrganizationLogoApi(file: File): Promise<OrganizationBranding> {
  const formData = new FormData();
  formData.append("logo", file);
  return apiFetch<OrganizationBranding>("/organizations/logo/", {
    method: "POST",
    body: formData,
  });
}

export async function removeOrganizationLogoApi(): Promise<OrganizationBranding> {
  return apiFetch<OrganizationBranding>("/organizations/logo/", {
    method: "DELETE",
  });
}

export async function getOrganizationSettingsApi(): Promise<{
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  is_active: boolean;
}> {
  return apiFetch("/organizations/settings/");
}

export async function updateOrganizationSettingsApi(payload: {
  name: string;
}): Promise<{ id: string; name: string; slug: string; logo_url?: string | null }> {
  return apiFetch("/organizations/settings/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAuditLogsApi(params?: {
  event_type?: string;
  limit?: number;
}): Promise<AuditEventItem[]> {
  const query = new URLSearchParams();
  if (params?.event_type) query.append("event_type", params.event_type);
  if (params?.limit) query.append("limit", String(params.limit));
  const qStr = query.toString();
  return apiFetch<AuditEventItem[]>(`/audit/${qStr ? `?${qStr}` : ""}`);
}

// ---------------------------------------------------------------------------
// Product Master APIs
// ---------------------------------------------------------------------------

export async function getProductsApi(params?: {
  search?: string;
  category?: string;
  item_type?: string;
  dosage_form?: string;
  prescription_class?: string;
  status?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}): Promise<ProductListResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.category && params.category !== "all") query.append("category", params.category);
  if (params?.item_type && params.item_type !== "all") query.append("item_type", params.item_type);
  if (params?.dosage_form && params.dosage_form !== "all") query.append("dosage_form", params.dosage_form);
  if (params?.prescription_class && params.prescription_class !== "all") query.append("prescription_class", params.prescription_class);
  if (params?.status) query.append("status", params.status);
  if (params?.ordering) query.append("ordering", params.ordering);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));

  const qStr = query.toString();
  return apiFetch<ProductListResponse>(`/products/${qStr ? `?${qStr}` : ""}`);
}

export async function getProductDetailApi(id: string): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/`);
}

export async function createProductApi(payload: ProductCreatePayload): Promise<Product> {
  return apiFetch<Product>("/products/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProductApi(id: string, payload: Partial<ProductCreatePayload>): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function archiveProductApi(id: string): Promise<{ message: string; id: string; is_active: boolean }> {
  return apiFetch<{ message: string; id: string; is_active: boolean }>(`/products/${id}/archive/`, {
    method: "POST",
  });
}

export async function reactivateProductApi(id: string): Promise<{ message: string; id: string; is_active: boolean }> {
  return apiFetch<{ message: string; id: string; is_active: boolean }>(`/products/${id}/reactivate/`, {
    method: "POST",
  });
}

export async function getProductMetadataApi(): Promise<ProductMetadata> {
  return apiFetch<ProductMetadata>("/products/metadata/");
}

// ---------------------------------------------------------------------------
// Milestone 2C.2: Inter-Store Stock Transfers APIs
// ---------------------------------------------------------------------------

export interface StockTransferItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  barcode: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  base_unit: string;
  sale_unit: string;
  conversion_factor: number;
  quantity_requested: number;
  quantity_dispatched: number;
  quantity_received: number;
  quantity_damaged: number;
  quantity_missing: number;
  quantity_excess: number;
  in_transit_quantity: number;
  status: string;
  unit_mrp: string;
  unit_cost?: string;
  discrepancies: TransferDiscrepancy[];
}

export interface TransferDiscrepancy {
  id: string;
  discrepancy_type: "SHORTAGE" | "DAMAGE" | "EXCESS" | "BATCH_MISMATCH";
  expected_quantity: number;
  actual_quantity: number;
  discrepancy_quantity: number;
  evidence_notes: string;
  status: "PENDING_INVESTIGATION" | "INVESTIGATING" | "RESOLVED";
  reported_by_name: string | null;
  reviewed_by_name: string | null;
  resolution_decision?: string;
  resolution_notes?: string;
  resolved_at?: string;
  created_at: string;
}

export interface StockTransfer {
  id: string;
  transfer_number: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "DISPATCHED" | "PARTIALLY_RECEIVED" | "COMPLETED" | "DISCREPANCY_HOLD" | "CANCELLED";
  source_store_id: string;
  source_store_name: string;
  destination_store_id: string;
  destination_store_name: string;
  notes?: string;
  cancellation_reason?: string;
  requested_by_name: string | null;
  approved_by_name: string | null;
  dispatched_by_name: string | null;
  received_by_name: string | null;
  approved_at?: string;
  dispatched_at?: string;
  received_at?: string;
  created_at: string;
  updated_at: string;
  items_count: number;
  items: StockTransferItem[];
  discrepancies: TransferDiscrepancy[];
}

export interface StockTransferListResponse {
  count: number;
  num_pages: number;
  current_page: number;
  page_size: number;
  results: StockTransfer[];
}

export interface CreateStockTransferPayload {
  source_store_id: string;
  destination_store_id: string;
  notes?: string;
  items: Array<{
    product_id: string;
    batch_id: string;
    quantity_requested?: number;
    quantity_sale_units?: number;
    quantity_loose_base_units?: number;
  }>;
}

export interface ReceiveStockTransferPayload {
  receipt_lines: Array<{
    item_id: string;
    quantity_received?: number;
    quantity_damaged?: number;
    quantity_missing?: number;
    quantity_excess?: number;
    evidence_notes?: string;
  }>;
}

export interface ResolveDiscrepancyPayload {
  resolution_decision: "RECOVERED" | "RETURNED_TO_SOURCE" | "LOSS_CONFIRMED";
  resolution_notes: string;
}

export async function getStockTransfersApi(params?: {
  store_id?: string;
  direction?: "in" | "out";
  status?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<StockTransferListResponse> {
  const query = new URLSearchParams();
  if (params?.store_id) query.append("store_id", params.store_id);
  if (params?.direction) query.append("direction", params.direction);
  if (params?.status && params.status !== "ALL") query.append("status", params.status);
  if (params?.search) query.append("search", params.search);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));

  const qStr = query.toString();
  return apiFetch<StockTransferListResponse>(`/inventory/transfers/${qStr ? `?${qStr}` : ""}`);
}

export async function getStockTransferDetailApi(transferId: string): Promise<StockTransfer> {
  return apiFetch<StockTransfer>(`/inventory/transfers/${transferId}/`);
}

export async function createStockTransferApi(payload: CreateStockTransferPayload): Promise<StockTransfer> {
  return apiFetch<StockTransfer>("/inventory/transfers/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function dispatchStockTransferApi(
  transferId: string,
  idempotencyKey?: string
): Promise<{ status: string; message: string; transfer_id: string }> {
  const key = idempotencyKey || (typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).substring(2));
  return apiFetch(`/inventory/transfers/${transferId}/dispatch/`, {
    method: "POST",
    headers: {
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ idempotency_key: key }),
  });
}

export async function receiveStockTransferApi(
  transferId: string,
  payload: ReceiveStockTransferPayload,
  idempotencyKey?: string
): Promise<{ status: string; message: string; transfer_id: string; items: any[] }> {
  const key = idempotencyKey || (typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).substring(2));
  return apiFetch(`/inventory/transfers/${transferId}/receive/`, {
    method: "POST",
    headers: {
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ ...payload, idempotency_key: key }),
  });
}

export async function cancelStockTransferApi(
  transferId: string,
  cancellationReason?: string
): Promise<{ status: string; message: string }> {
  return apiFetch(`/inventory/transfers/${transferId}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ cancellation_reason: cancellationReason || "" }),
  });
}

export async function resolveTransferDiscrepancyApi(
  discrepancyId: string,
  payload: ResolveDiscrepancyPayload
): Promise<{ status: string; message: string; discrepancy_id: string }> {
  return apiFetch(`/inventory/transfers/discrepancies/${discrepancyId}/resolve/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getStoreStockApi(
  storeId: string,
  params?: {
    search?: string;
    filter?: string;
    page?: number;
    page_size?: number;
  }
): Promise<{ count: number; results: any[] }> {
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.filter) query.append("filter", params.filter);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));

  const qStr = query.toString();
  return apiFetch(`/inventory/stores/${storeId}/stock/${qStr ? `?${qStr}` : ""}`);
}

// ---------------------------------------------------------------------------
// Milestone 2C.3: Stock Adjustments & Physical Stock Count APIs
// ---------------------------------------------------------------------------

export interface StockAdjustment {
  id: string;
  adjustment_number: string;
  store_id: string;
  store_name: string;
  product_id: string;
  product_name: string;
  sku: string;
  barcode: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  base_unit: string;
  system_quantity_at_request: number;
  adjustment_quantity: number;
  resulting_quantity: number;
  reason_code: "DAMAGE" | "EXPIRY_WRITEOFF" | "PHYSICAL_SHORTAGE" | "VERIFIED_SURPLUS" | "CORRECTION" | "OTHER";
  explanation: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "POSTED" | "CANCELLED";
  unit_cost_basis?: string;
  calculated_valuation?: string;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  reviewed_at?: string;
  review_notes?: string;
  posted_by_name: string | null;
  posted_at?: string;
  movement_id?: string;
  created_at: string;
  updated_at: string;
}

export interface StockAdjustmentListResponse {
  count: number;
  num_pages: number;
  current_page: number;
  page_size: number;
  results: StockAdjustment[];
}

export interface CreateStockAdjustmentPayload {
  store_id: string;
  product_id: string;
  batch_id: string;
  adjustment_quantity: number;
  reason_code: string;
  explanation: string;
}

export interface PhysicalStockCountItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  barcode: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  base_unit: string;
  snapshot_system_quantity: number;
  counted_quantity: number | null;
  intervening_movement_quantity: number;
  reconciled_system_quantity: number | null;
  variance_quantity: number | null;
  status: "PENDING_COUNT" | "COUNTED" | "RECONCILED" | "APPROVED" | "REJECTED" | "ADJUSTED";
  notes?: string;
  counted_by_name: string | null;
  counted_at?: string;
  updated_at: string;
}

export interface PhysicalStockCount {
  id: string;
  count_number: string;
  store_id: string;
  store_name: string;
  count_type: "FULL_STORE" | "CYCLE_COUNT";
  status: "PLANNED" | "IN_PROGRESS" | "SUBMITTED" | "RECONCILED" | "COMPLETED" | "RECOUNT_REQUIRED" | "CANCELLED";
  notes?: string;
  snapshot_at?: string;
  initiated_by_name: string | null;
  submitted_by_name: string | null;
  submitted_at?: string;
  reviewed_by_name: string | null;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  updated_at: string;
  items_count: number;
  items: PhysicalStockCountItem[];
}

export interface PhysicalStockCountListResponse {
  count: number;
  num_pages: number;
  current_page: number;
  page_size: number;
  results: PhysicalStockCount[];
}

export interface CreateStockCountPayload {
  store_id: string;
  count_type?: "FULL_STORE" | "CYCLE_COUNT";
  batch_ids?: string[];
  notes?: string;
}

export interface RecordCountQuantitiesPayload {
  items: Array<{
    item_id: string;
    counted_quantity: number;
    notes?: string;
  }>;
}

export interface AdjustmentApprovalPolicy {
  id: string;
  store_id: string | null;
  store_name: string | null;
  max_manager_adjustment_value: string | null;
  max_manager_adjustment_quantity: number | null;
  require_owner_for_writeoff: boolean;
  is_configured: boolean;
  updated_at: string;
}

// Adjustments APIs
export async function getStockAdjustmentsApi(params?: {
  store_id?: string;
  status?: string;
  reason_code?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<StockAdjustmentListResponse> {
  const query = new URLSearchParams();
  if (params?.store_id) query.append("store_id", params.store_id);
  if (params?.status && params.status !== "ALL") query.append("status", params.status);
  if (params?.reason_code) query.append("reason_code", params.reason_code);
  if (params?.search) query.append("search", params.search);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));

  const qStr = query.toString();
  return apiFetch<StockAdjustmentListResponse>(`/inventory/adjustments/${qStr ? `?${qStr}` : ""}`);
}

export async function getStockAdjustmentDetailApi(adjustmentId: string): Promise<StockAdjustment> {
  return apiFetch<StockAdjustment>(`/inventory/adjustments/${adjustmentId}/`);
}

export async function createStockAdjustmentApi(payload: CreateStockAdjustmentPayload): Promise<StockAdjustment> {
  return apiFetch<StockAdjustment>("/inventory/adjustments/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function reviewStockAdjustmentApi(
  adjustmentId: string,
  decision: "APPROVE" | "REJECT",
  reviewNotes: string
): Promise<{ status: string; message: string; adjustment_id: string; adjustment_status: string }> {
  return apiFetch(`/inventory/adjustments/${adjustmentId}/review/`, {
    method: "POST",
    body: JSON.stringify({ decision, review_notes: reviewNotes }),
  });
}

export async function postStockAdjustmentApi(
  adjustmentId: string,
  idempotencyKey?: string
): Promise<{ status: string; message: string; adjustment_id: string; movement_id: string }> {
  const key = idempotencyKey || (typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).substring(2));
  return apiFetch(`/inventory/adjustments/${adjustmentId}/post/`, {
    method: "POST",
    headers: {
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ idempotency_key: key }),
  });
}

export async function cancelStockAdjustmentApi(adjustmentId: string): Promise<{ status: string; message: string }> {
  return apiFetch(`/inventory/adjustments/${adjustmentId}/cancel/`, {
    method: "POST",
  });
}

// Physical Stock Count APIs
export async function getPhysicalStockCountsApi(params?: {
  store_id?: string;
  status?: string;
  count_type?: string;
  page?: number;
  page_size?: number;
}): Promise<PhysicalStockCountListResponse> {
  const query = new URLSearchParams();
  if (params?.store_id) query.append("store_id", params.store_id);
  if (params?.status && params.status !== "ALL") query.append("status", params.status);
  if (params?.count_type) query.append("count_type", params.count_type);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));

  const qStr = query.toString();
  return apiFetch<PhysicalStockCountListResponse>(`/inventory/stock-counts/${qStr ? `?${qStr}` : ""}`);
}

export async function getPhysicalStockCountDetailApi(countId: string): Promise<PhysicalStockCount> {
  return apiFetch<PhysicalStockCount>(`/inventory/stock-counts/${countId}/`);
}

export async function startPhysicalStockCountApi(payload: CreateStockCountPayload): Promise<PhysicalStockCount> {
  return apiFetch<PhysicalStockCount>("/inventory/stock-counts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function recordStockCountQuantitiesApi(
  countId: string,
  payload: RecordCountQuantitiesPayload
): Promise<{ status: string; message: string; count_id: string; count_status: string; items: any[] }> {
  return apiFetch(`/inventory/stock-counts/${countId}/record/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function reconcilePhysicalStockCountApi(
  countId: string
): Promise<{ status: string; message: string; count_id: string; count_status: string; items: any[] }> {
  return apiFetch(`/inventory/stock-counts/${countId}/reconcile/`, {
    method: "POST",
  });
}

export async function generateAdjustmentsFromCountApi(
  countId: string
): Promise<{ status: string; message: string; adjustments_count: number; adjustments: StockAdjustment[] }> {
  return apiFetch(`/inventory/stock-counts/${countId}/generate-adjustments/`, {
    method: "POST",
  });
}

export async function getAdjustmentApprovalPolicyApi(storeId?: string): Promise<AdjustmentApprovalPolicy> {
  const qStr = storeId ? `?store_id=${storeId}` : "";
  return apiFetch<AdjustmentApprovalPolicy>(`/inventory/adjustment-policies/${qStr}`);
}

export async function saveAdjustmentApprovalPolicyApi(payload: {
  store_id?: string;
  max_manager_adjustment_value?: number | null;
  max_manager_adjustment_quantity?: number | null;
  require_owner_for_writeoff?: boolean;
}): Promise<AdjustmentApprovalPolicy> {
  return apiFetch<AdjustmentApprovalPolicy>("/inventory/adjustment-policies/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Milestone 2C.4: Quarantine, Expiry & Batch Recall APIs
// ---------------------------------------------------------------------------

export interface BatchExpiryMonitoringItem {
  batch_id: string;
  batch_number: string;
  product_id: string;
  product_name: string;
  sku: string;
  store_id: string;
  store_name: string;
  expiry_date: string;
  days_until_expiry: number;
  expiry_status: "EXPIRED" | "CRITICAL_NEAR_EXPIRY" | "WARNING_NEAR_EXPIRY" | "SAFE";
  is_recalled: boolean;
  quantity_on_hand: number;
  quantity_quarantined: number;
  available_quantity: number;
  mrp: string;
  base_unit: string;
}

export interface BatchExpiryMonitoringResponse {
  count: number;
  num_pages: number;
  current_page: number;
  page_size: number;
  results: BatchExpiryMonitoringItem[];
}

export interface FEFOCandidateItem {
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  days_until_expiry: number;
  expiry_status: string;
  quantity_on_hand: number;
  quantity_quarantined: number;
  available_quantity: number;
  allocated_quantity: number;
  mrp: string;
  unit_mrp: string;
  conversion_factor: number;
  base_unit: string;
  sale_unit: string;
}

export interface StoreExpiryPolicy {
  id: string;
  store_id: string | null;
  store_name: string | null;
  warning_threshold_days: number;
  critical_threshold_days: number;
  created_at: string;
  updated_at: string;
}

export interface StockQuarantineRecord {
  id: string;
  quarantine_number: string;
  store_id: string;
  store_name: string;
  batch_id: string;
  batch_number: string;
  product_id: string;
  product_name: string;
  sku: string;
  base_unit: string;
  quantity_quarantined: number;
  reason_code: "DAMAGED" | "SUSPECTED_COUNTERFEIT" | "TEMPERATURE_EXCURSION" | "AMBIGUOUS_IDENTITY" | "SUPPLIER_QUALITY" | "RECALL" | "OTHER";
  notes: string;
  evidence_metadata: any;
  status: "ACTIVE" | "RELEASED" | "WRITTEN_OFF" | "RETURNED_TO_SUPPLIER";
  quarantined_by_name: string | null;
  quarantined_at: string;
  released_by_name: string | null;
  released_at: string | null;
  release_reason: string;
  disposition_notes: string;
  created_at: string;
  updated_at: string;
}

export interface StockQuarantineListResponse {
  count: number;
  num_pages: number;
  current_page: number;
  page_size: number;
  results: StockQuarantineRecord[];
}

export interface CreateQuarantinePayload {
  store_id: string;
  batch_id: string;
  quantity: number;
  reason_code: string;
  notes?: string;
  evidence_metadata?: any;
}

export interface BatchRecall {
  id: string;
  recall_number: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  base_unit: string;
  source: "MANUFACTURER" | "REGULATOR" | "SUPPLIER" | "INTERNAL_QUALITY";
  severity: "CLASS_1_CRITICAL" | "CLASS_2_MAJOR" | "CLASS_3_MINOR";
  reason: string;
  evidence_references: any;
  affected_stores_count: number;
  affected_quantity_on_hand: number;
  affected_quantity_in_transit: number;
  status: "INITIATED" | "QUARANTINED_ALL" | "RELEASED" | "COMPLETED_DISPOSED";
  disposition_type: "PENDING" | "SUPPLIER_RETURN" | "DESTRUCTION_WRITEOFF" | "RELEASED_AFTER_CLEARANCE";
  resolution_notes: string;
  initiated_by_name: string | null;
  initiated_at: string;
  closed_by_name: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchRecallListResponse {
  count: number;
  num_pages: number;
  current_page: number;
  page_size: number;
  results: BatchRecall[];
}

export interface CreateBatchRecallPayload {
  batch_id: string;
  source: string;
  severity: string;
  reason: string;
  evidence_references?: any;
  auto_quarantine_stock?: boolean;
}

// Batch Expiry Monitoring & FEFO APIs
export async function getBatchExpiryMonitoringApi(params?: {
  store_id?: string;
  expiry_status?: string;
  is_recalled?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<BatchExpiryMonitoringResponse> {
  const query = new URLSearchParams();
  if (params?.store_id) query.append("store_id", params.store_id);
  if (params?.expiry_status && params.expiry_status !== "ALL") query.append("expiry_status", params.expiry_status);
  if (params?.is_recalled) query.append("is_recalled", params.is_recalled);
  if (params?.search) query.append("search", params.search);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));

  const qStr = query.toString();
  return apiFetch<BatchExpiryMonitoringResponse>(`/inventory/batch-monitoring/${qStr ? `?${qStr}` : ""}`);
}

export async function getFEFOBatchesApi(
  storeId: string,
  productId: string,
  requiredQuantity?: number
): Promise<{ results: FEFOCandidateItem[] }> {
  const query = new URLSearchParams();
  if (requiredQuantity) query.append("required_quantity", String(requiredQuantity));
  const qStr = query.toString();
  return apiFetch<{ results: FEFOCandidateItem[] }>(
    `/inventory/stores/${storeId}/products/${productId}/fefo/${qStr ? `?${qStr}` : ""}`
  );
}

export async function getStoreExpiryPolicyApi(storeId?: string): Promise<StoreExpiryPolicy> {
  const qStr = storeId ? `?store_id=${storeId}` : "";
  return apiFetch<StoreExpiryPolicy>(`/inventory/expiry-policies/${qStr}`);
}

export async function saveStoreExpiryPolicyApi(payload: {
  store_id?: string | null;
  warning_threshold_days: number;
  critical_threshold_days: number;
}): Promise<StoreExpiryPolicy> {
  return apiFetch<StoreExpiryPolicy>("/inventory/expiry-policies/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Quarantine Management APIs
export async function getStockQuarantineRecordsApi(params?: {
  store_id?: string;
  status?: string;
  reason_code?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<StockQuarantineListResponse> {
  const query = new URLSearchParams();
  if (params?.store_id) query.append("store_id", params.store_id);
  if (params?.status && params.status !== "ALL") query.append("status", params.status);
  if (params?.reason_code && params.reason_code !== "ALL") query.append("reason_code", params.reason_code);
  if (params?.search) query.append("search", params.search);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));

  const qStr = query.toString();
  return apiFetch<StockQuarantineListResponse>(`/inventory/quarantine/${qStr ? `?${qStr}` : ""}`);
}

export async function getStockQuarantineDetailApi(id: string): Promise<StockQuarantineRecord> {
  return apiFetch<StockQuarantineRecord>(`/inventory/quarantine/${id}/`);
}

export async function createStockQuarantineApi(
  payload: CreateQuarantinePayload,
  idempotencyKey?: string
): Promise<{ status: string; message: string; quarantine_id: string; quarantine_number: string }> {
  const key = idempotencyKey || (typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).substring(2));
  return apiFetch("/inventory/quarantine/", {
    method: "POST",
    headers: {
      "Idempotency-Key": key,
    },
    body: JSON.stringify(payload),
  });
}

export async function releaseStockQuarantineApi(
  id: string,
  payload: { release_quantity: number; release_reason: string }
): Promise<{ status: string; message: string; quarantine_id: string; quarantine_status: string }> {
  return apiFetch(`/inventory/quarantine/${id}/release/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function disposeStockQuarantineApi(
  id: string,
  payload: { disposition_type: "WRITTEN_OFF" | "RETURNED_TO_SUPPLIER"; notes?: string }
): Promise<{ status: string; message: string; quarantine_id: string; quarantine_status: string }> {
  return apiFetch(`/inventory/quarantine/${id}/dispose/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Batch Recall Management APIs
export async function getBatchRecallsApi(params?: {
  status?: string;
  severity?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<BatchRecallListResponse> {
  const query = new URLSearchParams();
  if (params?.status && params.status !== "ALL") query.append("status", params.status);
  if (params?.severity && params.severity !== "ALL") query.append("severity", params.severity);
  if (params?.search) query.append("search", params.search);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));

  const qStr = query.toString();
  return apiFetch<BatchRecallListResponse>(`/inventory/recalls/${qStr ? `?${qStr}` : ""}`);
}

export async function getBatchRecallDetailApi(id: string): Promise<BatchRecall> {
  return apiFetch<BatchRecall>(`/inventory/recalls/${id}/`);
}

export async function initiateBatchRecallApi(payload: CreateBatchRecallPayload): Promise<BatchRecall> {
  return apiFetch<BatchRecall>("/inventory/recalls/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function releaseBatchRecallApi(
  id: string,
  payload: { resolution_notes: string }
): Promise<{ status: string; message: string; recall_id: string; recall_status: string }> {
  return apiFetch(`/inventory/recalls/${id}/release/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function disposeBatchRecallApi(
  id: string,
  payload: { disposition_type: "SUPPLIER_RETURN" | "DESTRUCTION_WRITEOFF"; notes?: string }
): Promise<{ status: string; message: string; recall_id: string; recall_status: string }> {
  return apiFetch(`/inventory/recalls/${id}/dispose/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}






// ---------------------------------------------------------------------------
// Milestone 2B & 2C: Opening Stock, Suppliers, Goods Receipts, Stock Movements & Overview
// ---------------------------------------------------------------------------

// Opening Stock
export interface PostOpeningStockPayload {
  product_id: string;
  batch_number: string;
  manufacturer_name?: string;
  manufacturing_date?: string | null;
  expiry_date: string;
  mrp: number | string;
  purchase_cost_per_sale_unit: number | string;
  quantity_sale_units?: number;
  quantity_loose_base_units?: number;
  low_stock_threshold?: number;
  receipt_reference?: string;
  reason?: string;
}

export async function postOpeningStockApi(
  storeId: string,
  payload: PostOpeningStockPayload,
  idempotencyKey?: string
): Promise<{
  status: string;
  message: string;
  store_id: string;
  product_id: string;
  batch_id: string;
  quantity_on_hand: number;
  available_quantity: number;
  movement_id: string;
}> {
  const key =
    idempotencyKey ||
    (typeof crypto !== "undefined"
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2));
  return apiFetch(`/inventory/stores/${storeId}/opening-stock/`, {
    method: "POST",
    headers: {
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ ...payload, idempotency_key: key }),
  });
}

// Supplier Master
export interface Supplier {
  id: string;
  name: string;
  supplier_code: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  gstin: string;
  drug_license_number: string;
  payment_terms_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierPayload {
  name: string;
  supplier_code?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  gstin?: string;
  drug_license_number?: string;
  payment_terms_days?: number;
}

export interface SupplierListResponse {
  count: number;
  num_pages: number;
  current_page: number;
  page_size: number;
  results: Supplier[];
}

export async function getSuppliersApi(params?: {
  search?: string;
  is_active?: string | boolean;
  page?: number;
  page_size?: number;
}): Promise<SupplierListResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.is_active !== undefined) query.append("is_active", String(params.is_active));
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  const qStr = query.toString();
  return apiFetch<SupplierListResponse>(`/inventory/suppliers/${qStr ? `?${qStr}` : ""}`);
}

export async function getSupplierDetailApi(supplierId: string): Promise<Supplier> {
  return apiFetch<Supplier>(`/inventory/suppliers/${supplierId}/`);
}

export async function createSupplierApi(payload: CreateSupplierPayload): Promise<Supplier> {
  return apiFetch<Supplier>("/inventory/suppliers/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSupplierApi(
  supplierId: string,
  payload: Partial<CreateSupplierPayload>
): Promise<Supplier> {
  return apiFetch<Supplier>(`/inventory/suppliers/${supplierId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deactivateSupplierApi(
  supplierId: string
): Promise<{ message: string; id: string; is_active: boolean }> {
  return apiFetch(`/inventory/suppliers/${supplierId}/deactivate/`, {
    method: "POST",
  });
}

// Goods Receipt Notes (GRN)
export interface GoodsReceiptItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  barcode: string;
  packaging_version: number;
  base_unit: string;
  sale_unit: string;
  conversion_factor: number;
  batch_id: string | null;
  batch_number: string;
  expiry_date: string;
  manufacturing_date?: string | null;
  quantity_sale_units: number;
  quantity_loose_base_units: number;
  total_base_units: number;
  mrp: string;
  unit_mrp: string;
  intake_status: "VERIFIED" | "QUARANTINED";
  quarantine_reason?: string;
  purchase_cost_per_sale_unit?: string;
  unit_cost?: string;
  tax_rate?: string;
  tax_amount?: string;
  total_cost?: string;
}

export interface GoodsReceipt {
  id: string;
  grn_number: string;
  store_id: string;
  store_name: string;
  supplier_id: string;
  supplier_name: string;
  supplier_invoice_number: string;
  supplier_invoice_date: string;
  receipt_date: string;
  status: "DRAFT" | "SUBMITTED" | "POSTED" | "CANCELLED";
  notes?: string;
  received_by_name: string | null;
  posted_by_name: string | null;
  posted_at?: string;
  created_at: string;
  updated_at: string;
  items_count: number;
  items: GoodsReceiptItem[];
  total_taxable_amount?: string;
  total_tax_amount?: string;
  total_amount?: string;
}

export interface GoodsReceiptListResponse {
  count: number;
  num_pages: number;
  current_page: number;
  page_size: number;
  results: GoodsReceipt[];
}

export interface CreateGoodsReceiptPayload {
  supplier_id: string;
  supplier_invoice_number: string;
  supplier_invoice_date: string;
  receipt_date?: string;
  notes?: string;
  items: Array<{
    product_id: string;
    packaging_snapshot_id?: string | null;
    batch_number: string;
    expiry_date: string;
    manufacturing_date?: string | null;
    quantity_sale_units?: number;
    quantity_loose_base_units?: number;
    purchase_cost_per_sale_unit: number | string;
    mrp: number | string;
    tax_rate?: number | string;
    intake_status?: "VERIFIED" | "QUARANTINED";
    quarantine_reason?: string;
  }>;
}

export async function getGoodsReceiptsApi(
  storeId: string,
  params?: {
    status?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }
): Promise<GoodsReceiptListResponse> {
  const query = new URLSearchParams();
  if (params?.status && params.status !== "ALL") query.append("status", params.status);
  if (params?.search) query.append("search", params.search);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  const qStr = query.toString();
  return apiFetch<GoodsReceiptListResponse>(
    `/inventory/stores/${storeId}/goods-receipts/${qStr ? `?${qStr}` : ""}`
  );
}

export async function getGoodsReceiptDetailApi(
  storeId: string,
  grnId: string
): Promise<GoodsReceipt> {
  return apiFetch<GoodsReceipt>(`/inventory/stores/${storeId}/goods-receipts/${grnId}/`);
}

export async function createGoodsReceiptApi(
  storeId: string,
  payload: CreateGoodsReceiptPayload
): Promise<GoodsReceipt> {
  return apiFetch<GoodsReceipt>(`/inventory/stores/${storeId}/goods-receipts/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function postGoodsReceiptApi(
  storeId: string,
  grnId: string,
  idempotencyKey?: string
): Promise<{
  status: string;
  message: string;
  grn_id: string;
  items_posted: number;
  quarantine_records_created: number;
}> {
  const key =
    idempotencyKey ||
    (typeof crypto !== "undefined"
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2));
  return apiFetch(`/inventory/stores/${storeId}/goods-receipts/${grnId}/post/`, {
    method: "POST",
    headers: {
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ idempotency_key: key }),
  });
}

export async function cancelGoodsReceiptApi(
  storeId: string,
  grnId: string,
  cancellationReason?: string
): Promise<{ status: string; message: string }> {
  return apiFetch(`/inventory/stores/${storeId}/goods-receipts/${grnId}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ cancellation_reason: cancellationReason || "" }),
  });
}

// Stock Movements & Ledger
export interface StockMovement {
  id: string;
  created_at: string;
  store_id: string;
  store_name: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  barcode: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  movement_type: string;
  movement_type_display: string;
  direction: "IN" | "OUT" | "HOLD";
  quantity: number;
  balance_before: number;
  balance_after: number;
  quarantine_before: number;
  quarantine_after: number;
  reference_type: string;
  reference_id: string;
  reason: string;
  actor_name: string | null;
  unit_mrp: string;
  unit_cost?: string;
  total_cost_value?: string;
}

export interface StockMovementListResponse {
  count: number;
  num_pages: number;
  current_page: number;
  page_size: number;
  results: StockMovement[];
}

export async function getStockMovementsApi(params?: {
  store_id?: string;
  movement_type?: string;
  direction?: string;
  batch_id?: string;
  product_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}): Promise<StockMovementListResponse> {
  const query = new URLSearchParams();
  if (params?.store_id) query.append("store_id", params.store_id);
  if (params?.movement_type && params.movement_type !== "ALL")
    query.append("movement_type", params.movement_type);
  if (params?.direction && params.direction !== "ALL")
    query.append("direction", params.direction);
  if (params?.batch_id) query.append("batch_id", params.batch_id);
  if (params?.product_id) query.append("product_id", params.product_id);
  if (params?.search) query.append("search", params.search);
  if (params?.date_from) query.append("date_from", params.date_from);
  if (params?.date_to) query.append("date_to", params.date_to);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  const qStr = query.toString();
  return apiFetch<StockMovementListResponse>(`/inventory/movements/${qStr ? `?${qStr}` : ""}`);
}

// Inventory Command Center Overview
export interface InventoryOverviewKPIs {
  total_products: number;
  active_batches: number;
  total_on_hand_units: number;
  total_quarantined_units: number;
  available_units: number;
  low_stock_count: number;
  expired_count: number;
  critical_near_expiry_count: number;
  warning_near_expiry_count: number;
  active_quarantine_count: number;
  active_recalls_count: number;
  pending_grn_count: number;
  in_transit_transfers_count: number;
  pending_adjustments_count: number;
  active_counts_count: number;
}

export interface InventoryActionQueueItem {
  type: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  description: string;
  action_url: string;
  count: number;
}

export interface InventoryOverviewData {
  kpis: InventoryOverviewKPIs;
  action_queue: InventoryActionQueueItem[];
  recent_movements: StockMovement[];
}

export async function getInventoryOverviewApi(storeId?: string): Promise<InventoryOverviewData> {
  const qStr = storeId ? `?store_id=${storeId}` : "";
  return apiFetch<InventoryOverviewData>(`/inventory/overview/${qStr}`);
}

// ==========================================
// BILLING & POS INTERFACES & APIS
// ==========================================

export interface BillingCustomer {
  id: string;
  name: string;
  phone_number: string;
  email?: string;
  address?: string;
  doctor_name?: string;
  doctor_registration_number?: string;
  created_at: string;
}

export interface POSProductBatchPreview {
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  mrp: string;
  unit_mrp: string;
  available_base_units: number;
  available_sale_units: number;
}

export interface POSProduct {
  id: string;
  name: string;
  brand_name: string;
  generic_name: string;
  sku: string;
  barcode: string;
  prescription_class: "otc" | "schedule_h" | "schedule_h1" | "schedule_x" | "rx_general";
  base_unit: string;
  sale_unit: string;
  conversion_factor: number;
  is_loose_dispensing_allowed: boolean;
  gst_rate: string;
  available_stock_base_units: number;
  available_stock_sale_units: number;
  display_mrp: string;
  display_unit_mrp: string;
  next_expiry: string | null;
  batches: POSProductBatchPreview[];
}

export interface SaleDraftItem {
  id: string;
  draft: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  barcode?: string;
  prescription_class: string;
  unit_type: "SALE_UNIT" | "LOOSE_UNIT";
  unit_name: string;
  quantity: number;
  equivalent_base_units: number;
  unit_mrp: string;
  line_gross: string;
  discount_percentage: string;
  discount_amount: string;
  taxable_amount: string;
  tax_rate: string;
  cgst_amount: string;
  sgst_amount: string;
  line_net: string;
  fefo_preview: Array<{ batch_number: string; expiry_date: string; quantity_base_units: number }>;
  created_at: string;
}

export interface DiscountApprovalRequest {
  id: string;
  draft: string;
  requested_by_name: string;
  discount_percentage: string;
  discount_amount: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewed_by_name?: string;
  rejection_reason?: string;
  created_at: string;
  reviewed_at?: string;
}

export interface SaleDraft {
  id: string;
  draft_number: string;
  store: string;
  customer: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  cashier_name: string;
  status: "ACTIVE" | "HELD" | "COMPLETED" | "CANCELLED";
  notes: string;
  gross_total: string;
  item_discount_total: string;
  bill_discount_percentage: string;
  bill_discount_amount: string;
  total_discount: string;
  taxable_subtotal: string;
  cgst_total: string;
  sgst_total: string;
  round_off_amount: string;
  final_payable_amount: string;
  totals?: any;
  has_prescription_items: boolean;
  is_prescription_verified: boolean;
  rx_number: string;
  rx_doctor_name: string;
  items: SaleDraftItem[];
  pending_discount_request?: DiscountApprovalRequest | null;
  created_at: string;
  updated_at: string;
}

export interface CheckoutAttempt {
  id: string;
  draft: string;
  cart_revision: number;
  cashier: string;
  cashier_name: string;
  customer: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  status:
    | "PENDING_PAYMENT"
    | "PAYMENT_PENDING_VERIFICATION"
    | "READY_TO_FINALIZE"
    | "FINALIZING"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | "EXPIRED";
  payable_amount: string;
  total_confirmed_payments: number;
  remaining_balance: number;
  idempotency_key: string;
  financial_snapshot: any;
  batch_allocations_snapshot: any[];
  payments: Array<{
    id: string;
    payment_method: "CASH" | "UPI" | "CARD";
    amount: string;
    status: "PENDING" | "REQUIRES_VERIFICATION" | "CONFIRMED" | "FAILED" | "CANCELLED";
    reference_number: string;
    cash_tendered: string | null;
    change_due: string | null;
    recorded_by_name: string;
    recorded_at: string;
    verified_by_name?: string;
    verified_at?: string;
    verification_notes?: string;
  }>;
  invoice_id?: string;
  invoice_number?: string;
  failure_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoicePayment {
  id: string;
  payment_method: "CASH" | "UPI" | "CARD";
  amount: string;
  reference_number: string;
  status: string;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  hsn_code: string;
  prescription_class: string;
  unit_type: "SALE_UNIT" | "LOOSE_UNIT";
  unit_name: string;
  quantity: number;
  equivalent_base_units: number;
  unit_mrp: string;
  line_gross: string;
  discount_amount: string;
  taxable_amount: string;
  tax_rate: string;
  cgst_amount: string;
  sgst_amount: string;
  line_net: string;
  batch_allocations: Array<{ batch_number: string; expiry_date: string; quantity_base_units: number }>;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  store: string;
  store_name: string;
  store_code: string;
  store_address: string;
  store_phone: string;
  store_gstin: string;
  store_dl_number: string;
  customer_name: string;
  customer_phone: string;
  cashier_name: string;
  subtotal_gross: string;
  total_discount: string;
  taxable_subtotal: string;
  cgst_total: string;
  sgst_total: string;
  round_off_amount: string;
  net_total: string;
  paid_amount: string;
  change_returned: string;
  payment_status: "PAID" | "PARTIAL" | "UNPAID";
  has_prescription_items: boolean;
  rx_number: string;
  rx_doctor_name: string;
  is_prescription_verified: boolean;
  verified_by_pharmacist_name: string;
  notes: string;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  created_at: string;
}

// API functions
export async function searchPOSProductsApi(storeId: string, q: string): Promise<POSProduct[]> {
  const params = new URLSearchParams({ q });
  return apiFetch<POSProduct[]>(`/billing/stores/${storeId}/products/search/?${params.toString()}`);
}

export async function getBillingCustomersApi(search?: string, storeId?: string | null): Promise<BillingCustomer[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const qStr = params.toString() ? `?${params.toString()}` : "";
  const endpoint = storeId ? `/billing/stores/${storeId}/customers/${qStr}` : `/billing/customers/${qStr}`;
  const res = await apiFetch<any>(endpoint);
  return extractList<BillingCustomer>(res);
}

export async function createBillingCustomerApi(
  payload: {
    name: string;
    phone_number: string;
    email?: string;
    address?: string;
    doctor_name?: string;
    doctor_registration_number?: string;
  },
  storeId?: string | null
): Promise<BillingCustomer> {
  const endpoint = storeId ? `/billing/stores/${storeId}/customers/` : "/billing/customers/";
  return apiFetch<BillingCustomer>(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getActiveSaleDraftApi(storeId: string): Promise<SaleDraft> {
  return apiFetch<SaleDraft>(`/billing/stores/${storeId}/drafts/active/`);
}

export async function getHeldSaleDraftsApi(storeId: string): Promise<SaleDraft[]> {
  const res = await apiFetch<any>(`/billing/stores/${storeId}/drafts/held/`);
  return extractList<SaleDraft>(res);
}

export async function addSaleDraftItemApi(
  storeId: string,
  draftId: string,
  payload: { product_id: string; quantity: number; unit_type?: "SALE_UNIT" | "LOOSE_UNIT" }
): Promise<SaleDraft> {
  return apiFetch<SaleDraft>(`/billing/stores/${storeId}/drafts/${draftId}/items/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function removeSaleDraftItemApi(
  storeId: string,
  draftId: string,
  itemId: string
): Promise<SaleDraft> {
  return apiFetch<SaleDraft>(`/billing/stores/${storeId}/drafts/${draftId}/items/${itemId}/`, {
    method: "DELETE",
  });
}

export async function updateSaleDraftCustomerApi(
  storeId: string,
  draftId: string,
  customerId: string | null
): Promise<SaleDraft> {
  return apiFetch<SaleDraft>(`/billing/stores/${storeId}/drafts/${draftId}/customer/`, {
    method: "PATCH",
    body: JSON.stringify({ customer_id: customerId }),
  });
}

export async function holdSaleDraftApi(
  storeId: string,
  draftId: string,
  notes?: string
): Promise<SaleDraft> {
  return apiFetch<SaleDraft>(`/billing/stores/${storeId}/drafts/${draftId}/hold/`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

export async function resumeSaleDraftApi(storeId: string, draftId: string): Promise<SaleDraft> {
  return apiFetch<SaleDraft>(`/billing/stores/${storeId}/drafts/${draftId}/resume/`, {
    method: "POST",
  });
}

export async function requestDraftDiscountApi(
  storeId: string,
  draftId: string,
  payload: { discount_percentage?: number; discount_amount?: number; reason: string }
): Promise<SaleDraft> {
  return apiFetch<SaleDraft>(`/billing/stores/${storeId}/drafts/${draftId}/request-discount/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function reviewDraftDiscountApi(
  storeId: string,
  requestId: string,
  payload: { approved: boolean; rejection_reason?: string }
): Promise<SaleDraft> {
  return apiFetch<SaleDraft>(`/billing/stores/${storeId}/discount-requests/${requestId}/review/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyDraftPrescriptionApi(
  storeId: string,
  draftId: string,
  payload: { prescription_number: string; doctor_name: string }
): Promise<SaleDraft> {
  return apiFetch<SaleDraft>(`/billing/stores/${storeId}/drafts/${draftId}/verify-prescription/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function checkoutSaleDraftApi(
  storeId: string,
  payload: {
    draft_id: string;
    customer: {
      id?: string;
      name?: string;
      phone_number?: string;
      email?: string;
      address?: string;
      doctor_name?: string;
      doctor_registration_number?: string;
    };
    payments: Array<{
      method: "CASH" | "UPI" | "CARD";
      amount: string | number;
      cash_tendered?: string | number;
      reference_number?: string;
    }>;
    notes?: string;
  },
  idempotencyKey: string
): Promise<{ invoice: Invoice; is_newly_created: boolean }> {
  return apiFetch<{ invoice: Invoice; is_newly_created: boolean }>(
    `/billing/stores/${storeId}/checkout/`,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function getInvoicesApi(
  storeId: string,
  params?: {
    search?: string;
    payment_status?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }
): Promise<PaginatedResponse<Invoice>> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.payment_status) query.set("payment_status", params.payment_status);
  if (params?.start_date) query.set("start_date", params.start_date);
  if (params?.end_date) query.set("end_date", params.end_date);
  if (params?.page) query.set("page", params.page.toString());
  if (params?.page_size) query.set("page_size", params.page_size.toString());

  const qStr = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<PaginatedResponse<Invoice>>(`/billing/stores/${storeId}/invoices/${qStr}`);
}

export async function getInvoiceDetailApi(storeId: string, invoiceId: string): Promise<Invoice> {
  return apiFetch<Invoice>(`/billing/stores/${storeId}/invoices/${invoiceId}/`);
}

// Phase 2 Two-Stage Durable Checkout Lifecycle APIs
export async function initiateCheckoutApi(
  storeId: string,
  payload: {
    draft_id: string;
    customer: {
      id?: string;
      name?: string;
      phone_number?: string;
      email?: string;
      address?: string;
      doctor_name?: string;
      doctor_registration_number?: string;
    };
    idempotency_key?: string;
  },
  idempotencyKey: string
): Promise<CheckoutAttempt> {
  return apiFetch<CheckoutAttempt>(`/billing/stores/${storeId}/checkout/initiate/`, {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey }),
  });
}

export async function recordPaymentApi(
  storeId: string,
  attemptId: string,
  payload: {
    method: "CASH" | "UPI" | "CARD";
    amount: string | number;
    cash_tendered?: string | number;
    reference_number?: string;
  }
): Promise<{ payment: InvoicePayment; checkout_attempt: CheckoutAttempt }> {
  return apiFetch<{ payment: InvoicePayment; checkout_attempt: CheckoutAttempt }>(
    `/billing/stores/${storeId}/checkout/${attemptId}/payments/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function verifyPaymentApi(
  storeId: string,
  attemptId: string,
  paymentId: string,
  payload: {
    approved: boolean;
    verification_notes?: string;
  }
): Promise<{ payment: InvoicePayment; checkout_attempt: CheckoutAttempt }> {
  return apiFetch<{ payment: InvoicePayment; checkout_attempt: CheckoutAttempt }>(
    `/billing/stores/${storeId}/checkout/${attemptId}/payments/${paymentId}/verify/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function finalizeCheckoutApi(
  storeId: string,
  attemptId: string,
  idempotencyKey?: string
): Promise<{ status: string; is_newly_created: boolean; invoice: Invoice }> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  return apiFetch<{ status: string; is_newly_created: boolean; invoice: Invoice }>(
    `/billing/stores/${storeId}/checkout/${attemptId}/finalize/`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    }
  );
}

export async function getCheckoutAttemptStatusApi(
  storeId: string,
  attemptId: string
): Promise<CheckoutAttempt> {
  return apiFetch<CheckoutAttempt>(`/billing/stores/${storeId}/checkout/${attemptId}/`);
}

