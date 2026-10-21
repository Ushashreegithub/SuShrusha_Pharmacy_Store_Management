import {
  OwnerRegistrationPayload,
  RegisterResponse,
  EmailVerificationResponse,
  UserProfile,
  AuthResponse,
  StoreInfo,
} from "@/types/auth";
import {
  Store,
  CreateStorePayload,
  UpdateStorePayload,
  OrganizationOverview,
  Invitation,
  CreateInvitationPayload,
  StoreMember,
  TeamMember,
  AuditEventItem,
} from "@/types/dashboard";

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

  try {
    const res = await fetch(`${API_BASE}/auth/csrf/`, {
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
  const url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

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
    throw new ApiError(
      "Unable to connect to the Sushrusha backend service. Please check that the server is running.",
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

export async function getOrganizationOverviewApi(): Promise<OrganizationOverview> {
  return apiFetch<OrganizationOverview>("/organizations/overview/");
}

export async function getOrganizationTeamApi(): Promise<TeamMember[]> {
  return apiFetch<TeamMember[]>("/organizations/team/");
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

export async function getInvitationsApi(params?: {
  status?: string;
  store_id?: string;
}): Promise<Invitation[]> {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.store_id) query.append("store_id", params.store_id);
  const qStr = query.toString();
  return apiFetch<Invitation[]>(`/invitations/${qStr ? `?${qStr}` : ""}`);
}

export async function createInvitationApi(
  payload: CreateInvitationPayload
): Promise<Invitation> {
  return apiFetch<Invitation>("/invitations/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function resendInvitationApi(
  invitationId: string
): Promise<Invitation> {
  return apiFetch<Invitation>(`/invitations/${invitationId}/resend/`, {
    method: "POST",
  });
}

export async function revokeInvitationApi(
  invitationId: string
): Promise<{ detail: string; status: string }> {
  return apiFetch<{ detail: string; status: string }>(
    `/invitations/${invitationId}/revoke/`,
    {
      method: "POST",
    }
  );
}

export async function verifyInvitationTokenApi(token: string): Promise<{
  status: "valid" | "expired" | "used" | "revoked" | "invalid";
  email: string;
  role: string;
  role_display: string;
  store_name: string;
  store_code: string;
  organization_name: string;
  expires_at: string;
}> {
  return apiFetch(`/invitations/verify/?token=${encodeURIComponent(token)}`);
}

export async function acceptInvitationApi(payload: {
  token: string;
  fullName: string;
  password: string;
  confirmPassword: string;
}): Promise<{ message: string; email: string; role: string; store_name: string }> {
  return apiFetch("/invitations/accept/", {
    method: "POST",
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

