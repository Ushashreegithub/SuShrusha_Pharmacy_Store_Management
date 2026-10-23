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
      "Unable to connect to the DiracPharma backend service. Please check that the server is running.",
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

export async function getOrganizationSettingsApi(): Promise<{
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}> {
  return apiFetch("/organizations/settings/");
}

export async function updateOrganizationSettingsApi(payload: {
  name: string;
}): Promise<{ id: string; name: string; slug: string }> {
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


