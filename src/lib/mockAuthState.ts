/**
 * Frontend-only mock authentication state manager.
 * Uses sessionStorage to simulate account verification status across page navigation.
 * STRICTLY does NOT store passwords or sensitive credentials.
 */

const STORAGE_KEY_VERIFIED = "sushrusha_mock_verified_emails";
const STORAGE_KEY_UNVERIFIED = "sushrusha_mock_unverified_emails";
const STORAGE_KEY_LATEST_REGISTRATION = "sushrusha_mock_latest_registration";

// Pre-configured test accounts (development-only presets)
export const DEFAULT_VERIFIED_EMAILS = [
  "owner@sushrusha.com",
  "pharmacist@sushrusha.com",
];

export const DEFAULT_UNVERIFIED_EMAILS = [
  "unverified.owner@sushrusha.com",
];

export interface LatestRegistrationInfo {
  email: string;
  organizationName?: string;
  fullName?: string;
}

export function saveLatestRegistration(info: LatestRegistrationInfo): void {
  if (typeof window === "undefined" || !info.email) return;
  try {
    sessionStorage.setItem(STORAGE_KEY_LATEST_REGISTRATION, JSON.stringify(info));
  } catch {
    // Ignore
  }
}

export function getLatestRegistration(): LatestRegistrationInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const data = sessionStorage.getItem(STORAGE_KEY_LATEST_REGISTRATION);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function getVerifiedEmails(): string[] {
  if (typeof window === "undefined") return DEFAULT_VERIFIED_EMAILS;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY_VERIFIED);
    if (!stored) {
      sessionStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify(DEFAULT_VERIFIED_EMAILS));
      return DEFAULT_VERIFIED_EMAILS;
    }
    return JSON.parse(stored);
  } catch {
    return DEFAULT_VERIFIED_EMAILS;
  }
}

export function getUnverifiedEmails(): string[] {
  if (typeof window === "undefined") return DEFAULT_UNVERIFIED_EMAILS;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY_UNVERIFIED);
    if (!stored) {
      sessionStorage.setItem(STORAGE_KEY_UNVERIFIED, JSON.stringify(DEFAULT_UNVERIFIED_EMAILS));
      return DEFAULT_UNVERIFIED_EMAILS;
    }
    return JSON.parse(stored);
  } catch {
    return DEFAULT_UNVERIFIED_EMAILS;
  }
}

/**
 * Registers an email as unverified (called upon owner registration)
 * Stores non-sensitive metadata only (organization and full name). Zero credentials.
 */
export function registerUnverifiedEmail(
  email: string,
  meta?: { organizationName?: string; fullName?: string }
): void {
  if (!email || typeof window === "undefined") return;
  const normalized = email.trim().toLowerCase();

  try {
    // Store non-sensitive details so displayed verification pages dynamically reflect the user's registration
    saveLatestRegistration({
      email: normalized,
      organizationName: meta?.organizationName,
      fullName: meta?.fullName,
    });

    // Remove from verified if previously present
    const verified = getVerifiedEmails().filter((e) => e !== normalized);
    sessionStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify(verified));

    // Add to unverified
    const unverified = getUnverifiedEmails();
    if (!unverified.includes(normalized)) {
      unverified.push(normalized);
      sessionStorage.setItem(STORAGE_KEY_UNVERIFIED, JSON.stringify(unverified));
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

/**
 * Marks an email as verified (called when clicking development simulation action)
 */
export function markEmailVerified(email: string): void {
  if (!email || typeof window === "undefined") return;
  const normalized = email.trim().toLowerCase();

  try {
    // Remove from unverified
    const unverified = getUnverifiedEmails().filter((e) => e !== normalized);
    sessionStorage.setItem(STORAGE_KEY_UNVERIFIED, JSON.stringify(unverified));

    // Add to verified
    const verified = getVerifiedEmails();
    if (!verified.includes(normalized)) {
      verified.push(normalized);
    }
    sessionStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify(verified));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

/**
 * Checks if an email is marked as verified in mock state
 */
export function isEmailVerified(email: string): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  // Explicit unverified test check
  const unverified = getUnverifiedEmails();
  if (unverified.includes(normalized)) {
    return false;
  }

  // Check verified list
  const verified = getVerifiedEmails();
  return verified.includes(normalized);
}

/**
 * Checks if an email is a recognized mock account (preset or registered)
 */
export function isKnownAccount(email: string): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const unverified = getUnverifiedEmails();
  const verified = getVerifiedEmails();
  return verified.includes(normalized) || unverified.includes(normalized);
}

/**
 * Reset mock verification state back to defaults
 */
export function resetMockAuthState(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify(DEFAULT_VERIFIED_EMAILS));
    sessionStorage.setItem(STORAGE_KEY_UNVERIFIED, JSON.stringify(DEFAULT_UNVERIFIED_EMAILS));
    sessionStorage.removeItem(STORAGE_KEY_LATEST_REGISTRATION);
  } catch {
    // Ignore
  }
}
