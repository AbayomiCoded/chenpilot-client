import apiService, { singleFlight } from './api';
import type { ApiResponse } from '@/types';

const REAUTHENTICATION_WINDOW_MS = 5 * 60 * 1000;

/**
 * HTTP status codes and backend message fragments that indicate the submitted
 * credentials are wrong, the account does not exist, or the email is already
 * taken.  All of these are collapsed into a single public-facing string so
 * that an attacker cannot determine whether a given email address is enrolled.
 *
 * Add patterns here as new backend error shapes are discovered.  Never surface
 * these patterns to the user — keep them internal.
 */
const ACCOUNT_EXISTENCE_PATTERNS: RegExp[] = [
  /user\s+not\s+found/i,
  /account\s+not\s+found/i,
  /no\s+account.*found/i,
  /invalid\s+credentials?/i,
  /incorrect\s+(email|password|credentials?)/i,
  /email.*already\s+(exists?|registered|taken|in\s+use)/i,
  /already\s+registered/i,
  /duplicate\s+(email|account)/i,
  /email\s+taken/i,
];

/** Single user-visible string shown for any credential or account-existence error. */
const GENERIC_AUTH_ERROR =
  'Invalid email or password. Please check your credentials and try again.';

/** Single user-visible string shown when email registration cannot proceed. */
const GENERIC_REGISTER_ERROR =
  'Unable to create account. Please check your details and try again.';

/**
 * Auth error normalized for forms (#258). `fieldErrors` holds messages for known form fields;
 * `message` is a general message safe to show (never contains the submitted password).
 */
export interface NormalizedAuthError {
  message: string;
  fieldErrors: Record<string, string>;
  status?: number;
}

// Fallback for the #258 field-error normalizer; distinct from the privacy-safe GENERIC_AUTH_ERROR
const GENERIC_FORM_ERROR = 'Something went wrong. Please try again.';
const MASK = '••••••';

// Server field names that map onto form fields with a different name
const FIELD_ALIASES: Record<string, string> = {
  username: 'email',
  emailAddress: 'email',
  fullName: 'name',
  displayName: 'name',
};

const firstMessage = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(firstMessage).find(Boolean);
  if (value && typeof value === 'object') {
    const v = value as { message?: unknown; msg?: unknown };
    return firstMessage(v.message ?? v.msg);
  }
  return undefined;
};

/** Remove any occurrence of secret values (e.g. the submitted password) from a message. */
const redact = (message: string, secrets: Array<string | undefined>): string =>
  secrets.reduce<string>(
    (text, secret) => (secret && secret.length >= 1 ? text.split(secret).join(MASK) : text),
    message,
  );

/**
 * Normalize a failed login/register request into field-level errors (#258).
 *
 * Accepted backend shapes (see docs/API_CONTRACT.md "Auth Validation Errors"):
 * - `{ message, errors: { email: "Already registered", password: ["Too short"] } }`
 * - `{ message, errors: [{ field | path | param: "email", message | msg: "..." }] }`
 * - `{ message, details: [...] }` (same item shape as above)
 * Fields not in `fields` are folded into the general message. Echoed `value`s are ignored, and
 * any `secrets` (the submitted password) are masked out of every message.
 */
export function normalizeAuthError(
  error: unknown,
  fields: readonly string[],
  secrets: Array<string | undefined> = []
): NormalizedAuthError {
  const e = error as {
    message?: string;
    response?: { status?: number; data?: unknown };
  } | null | undefined;
  const data = (e?.response?.data ?? undefined) as
    | { message?: unknown; error?: unknown; errors?: unknown; details?: unknown }
    | undefined;
  const status = e?.response?.status;

  const fieldErrors: Record<string, string> = {};
  const unmatched: string[] = [];
  const add = (rawField: unknown, rawMessage: unknown) => {
    const message = firstMessage(rawMessage);
    if (!message) return;
    const name = typeof rawField === 'string' ? rawField.split('.').pop() ?? rawField : '';
    const field = FIELD_ALIASES[name] ?? name;
    const safe = redact(message, secrets);
    if (field && fields.includes(field)) {
      fieldErrors[field] ??= safe;
    } else {
      unmatched.push(safe);
    }
  };

  const list = data?.errors ?? data?.details;
  if (Array.isArray(list)) {
    for (const item of list) {
      const i = item as { field?: unknown; path?: unknown; param?: unknown; message?: unknown; msg?: unknown };
      const path = Array.isArray(i?.path) ? i.path[i.path.length - 1] : i?.path;
      add(i?.field ?? path ?? i?.param, i?.message ?? i?.msg);
    }
  } else if (list && typeof list === 'object') {
    for (const [field, value] of Object.entries(list as Record<string, unknown>)) add(field, value);
  }

  const serverMessage = firstMessage(data?.message) ?? firstMessage(data?.error);
  let message: string;
  if (serverMessage) message = redact(serverMessage, secrets);
  else if (unmatched.length) message = unmatched[0];
  else if (Object.keys(fieldErrors).length) message = 'Please correct the highlighted fields.';
  else if (status === undefined && e?.message && /network/i.test(e.message)) {
    message = "Can't reach the server. Check your connection and try again.";
  } else if (typeof (error as { message?: unknown })?.message === 'string' && !e?.response) {
    message = redact((error as { message: string }).message, secrets) || GENERIC_FORM_ERROR;
  } else message = GENERIC_FORM_ERROR;

  return { message, fieldErrors, status };
}

/** Type guard for an already-normalized error (e.g. a thunk's `rejectWithValue` payload). */
export function isNormalizedAuthError(value: unknown): value is NormalizedAuthError {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as NormalizedAuthError).message === 'string' &&
      typeof (value as NormalizedAuthError).fieldErrors === 'object'
  );
}

/**
 * The one email normalization used for authentication requests (#259), matching the API
 * contract (docs/API_CONTRACT.md "Email Normalization"):
 * - trim leading/trailing whitespace (including non-breaking and zero-width spaces)
 * - lowercase the whole address
 * Nothing else: no provider-specific rules (Gmail dots, `+tags`) and no punycode conversion.
 * Apply it to request payloads only; the input keeps what the user typed.
 */
export function normalizeEmail(email: string): string {
  return email.replace(/^[\s\u200B-\u200D\uFEFF]+|[\s\u200B-\u200D\uFEFF]+$/g, '').toLowerCase();
}

/**
 * Build the credentials sent for login/registration: normalized email, password untouched (#259).
 */
export function toAuthPayload<T extends { email: string; password: string }>(data: T): T {
  return { ...data, email: normalizeEmail(data.email), password: data.password };
}

/**
 * Sensitive actions that the backend may gate behind recent authentication (#255).
 * See docs/adr/0006-idle-session-reauthentication.md for the agreed list and contract.
 */
export type SensitiveAction = 'change_password' | 'delete_account' | 'export_data';

export interface ReauthChallenge {
  action: SensitiveAction;
  /** How recent the authentication must be, as reported by the server. */
  maxAgeSeconds?: number;
  /** Message from the previous failed attempt (e.g. wrong password). */
  error?: string;
}

/** Ask the user for their password. Resolve `null` to cancel. */
export type ReauthPrompt = (challenge: ReauthChallenge) => Promise<string | null>;

export class ReauthCancelledError extends Error {
  constructor() {
    super('Re-authentication was cancelled');
    this.name = 'ReauthCancelledError';
  }
}

export class ReauthTimeoutError extends Error {
  constructor() {
    super('Re-authentication timed out');
    this.name = 'ReauthTimeoutError';
  }
}

export class ReauthFailedError extends Error {
  constructor(message = 'Could not confirm your identity') {
    super(message);
    this.name = 'ReauthFailedError';
  }
}

/** Server step-up challenge: `{ code: 'REAUTH_REQUIRED', maxAgeSeconds? }` on a 401/403. */
export function getReauthChallenge(error: unknown): { maxAgeSeconds?: number } | null {
  const response = (error as { response?: { status?: number; data?: { code?: string; maxAgeSeconds?: number } } })?.response;
  if ((response?.status === 401 || response?.status === 403) && response.data?.code === 'REAUTH_REQUIRED') {
    return { maxAgeSeconds: typeof response.data.maxAgeSeconds === 'number' ? response.data.maxAgeSeconds : undefined };
  }
  return null;
}

/** Re-authentication prompt answer window (#255). */
export const REAUTH_PROMPT_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_REAUTH_ATTEMPTS = 3;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ReauthTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Run a sensitive action, re-authenticating only when the server asks for it (#255).
 *
 * 1. Run the action.
 * 2. If the server answers `REAUTH_REQUIRED`, prompt for the password (up to 3 attempts,
 *    each within `timeoutMs`), call `POST /auth/reauthenticate`, then run the action once more.
 *
 * There is no client-side idle timer: the server decides when authentication is too old.
 *
 * @throws {ReauthCancelledError} The user dismissed the prompt.
 * @throws {ReauthTimeoutError} The prompt was not answered in time.
 * @throws {ReauthFailedError} Wrong password too many times, or the server still refuses.
 */
export async function withRecentAuth<T>(
  action: SensitiveAction,
  run: () => Promise<T>,
  prompt: ReauthPrompt,
  options: { timeoutMs?: number; reauthenticate?: (password: string) => Promise<unknown> } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? REAUTH_PROMPT_TIMEOUT_MS;
  const reauthenticate = options.reauthenticate ?? ((password: string) => apiService.stepUpReauthenticate(password));

  try {
    return await run();
  } catch (error) {
    const challenge = getReauthChallenge(error);
    if (!challenge) throw error;

    let lastError: string | undefined;
    for (let attempt = 0; attempt < MAX_REAUTH_ATTEMPTS; attempt++) {
      const password = await withTimeout(
        prompt({ action, maxAgeSeconds: challenge.maxAgeSeconds, error: lastError }),
        timeoutMs,
      );
      if (password === null || password === '') throw new ReauthCancelledError();

      try {
        await reauthenticate(password);
      } catch (reauthError) {
        const status = (reauthError as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403 || status === 400) {
          lastError = 'That password is incorrect. Try again.';
          continue;
        }
        throw reauthError;
      }

      try {
        return await run();
      } catch (retryError) {
        if (getReauthChallenge(retryError)) {
          throw new ReauthFailedError('The server still requires re-authentication. Please sign in again.');
        }
        throw retryError;
      }
    }
    throw new ReauthFailedError('Too many incorrect attempts.');
  }
}

/**
 * Service for handling authentication-related tasks beyond basic API calls,
 * such as state persistence in local browser storage and session destruction.
 */
/** Raw failure detail for internal logs only; never shown to the user. */
function describeRawAuthError(error: unknown): string {
  if (typeof error === 'string') return error;
  const e = error as { message?: string; response?: { status?: number; data?: { message?: unknown } } } | null | undefined;
  const parts = [
    e?.response?.status !== undefined ? `status=${e.response.status}` : null,
    typeof e?.response?.data?.message === 'string' ? e.response.data.message : null,
    typeof e?.message === 'string' ? e.message : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' | ') : 'unknown error';
}

class AuthService {
  private recentAuthenticationAt: number | null = null;

  /**
   * Privacy-safe login error (account-enumeration resistance): every failure, including wrong
   * password, unknown user, 401 and network errors, becomes `GENERIC_AUTH_ERROR`. The raw reason
   * is logged internally only. See docs/API_CONTRACT.md "Privacy-Safe Authentication Errors".
   */
  normalizeLoginError(error: unknown): string {
    console.error('[auth] login error (internal):', describeRawAuthError(error));
    return GENERIC_AUTH_ERROR;
  }

  /** Privacy-safe registration error: every failure becomes `GENERIC_REGISTER_ERROR`. */
  normalizeRegisterError(error: unknown): string {
    console.error('[auth] register error (internal):', describeRawAuthError(error));
    return GENERIC_REGISTER_ERROR;
  }

  /**
   * Verify the user's current password and grant a short-lived security-settings gate.
   */
  async reauthenticate(email: string, password: string): Promise<void> {
    if (!email.trim()) {
      throw new Error('Email is required for re-authentication');
    }
    if (!password) {
      throw new Error('Password is required for re-authentication');
    }

    this.clearRecentAuthentication();
    await apiService.reauthenticate(email, password);
    this.recentAuthenticationAt = Date.now();
  }

  /**
   * Check whether a successful re-authentication is still within the five-minute window.
   */
  hasRecentAuthentication(): boolean {
    if (this.recentAuthenticationAt === null) return false;

    const elapsed = Date.now() - this.recentAuthenticationAt;
    if (elapsed < 0 || elapsed >= REAUTHENTICATION_WINDOW_MS) {
      this.clearRecentAuthentication();
      return false;
    }

    return true;
  }

  clearRecentAuthentication(): void {
    this.recentAuthenticationAt = null;
  }

  clearLocalSession(): void {
    this.clearRecentAuthentication();
    apiService.clearToken();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_data');
      localStorage.removeItem('refresh_token');
      sessionStorage.clear();
    }
  }

  async requestPasswordReset(email: string): Promise<ApiResponse<{ message: string }>> {
    return apiService.forgotPassword(email);
  }

  async resetPassword(token: string, password: string): Promise<ApiResponse<{ message: string }>> {
    return apiService.resetPassword(token, password);
  }

  async signOutAllOtherDevices(): Promise<{ currentSessionRevoked: boolean }> {
    return apiService.revokeOtherSessions();
  }

  /**
   * Performs a logout by invalidating the session on the backend and
   * clearing all local authentication state.
   * Does NOT throw on backend errors; swallows network error so client cleanup always succeeds.
   *
   * @returns Promise resolving to void when logout cleanup completes.
   *
   * @example
   * ```ts
   * import { authService } from '@/services/auth.service';
   * 
   * await authService.logout();
   * console.log('User logged out, isAuthenticated:', authService.isAuthenticated()); // false
   * ```
   */
  async logout(): Promise<void> {
    this.clearRecentAuthentication();
    try {
      // Call the API service to perform the backend logout
      await apiService.logout();
    } catch (error) {
      console.error('AuthService.logout failed:', error);
      // We don't throw here because we want the frontend to proceed
      // with local cleanup regardless of server success.
    }
  }

  /**
   * Checks if the user is currently authenticated locally by inspecting localStorage for `auth_token`.
   * Synchronous operation; returns `false` in Server-Side Rendering (SSR) environment.
   *
   * @returns Boolean `true` if an auth token is stored in localStorage, `false` otherwise.
   */
  isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('auth_token');
  }

  /**
   * Gets the stored access token from browser localStorage.
   * Synchronous operation; returns `null` if window is undefined or token is missing.
   *
   * @returns JWT token string if found, or `null`.
   */
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  /**
   * Gets and parses stored user data object from browser localStorage.
   * Synchronous operation; returns `null` if window is undefined or data is missing/invalid.
   *
   * @template T - Target return type (defaults to unknown).
   * @returns Parsed user object of type T or `null`.
   */
  getUserData<T = unknown>(): T | null {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem('user_data');
    return data ? JSON.parse(data) : null;
  }

  /**
   * Retrieves the current Multi-Factor Authentication (MFA) status.
   * Checks the backend for authoritative confirmation.
   * If the backend returns 404 or unsupported status, returns `{ enabled: false, supported: false }`.
   *
   * @returns Promise resolving to MFA status object.
   */
  async getMfaStatus(): Promise<{ enabled: boolean; supported: boolean; method?: 'totp' | null }> {
    try {
      const response = await apiService.getMfaStatus();
      if (response && 'success' in response && response.success && response.data) {
        return {
          enabled: !!response.data.enabled,
          supported: true,
          method: response.data.method || 'totp',
        };
      }
      return {
        enabled: false,
        supported: false,
      };
    } catch {
      // Backend error or unsupported endpoint
      return {
        enabled: false,
        supported: false,
      };
    }
  }

  /**
   * Initiates MFA enrollment by requesting enrollment secrets from the backend.
   * Uses singleFlight to prevent duplicate concurrent enrollment calls.
   *
   * IMPORTANT: The returned enrollment secrets must NEVER be written to localStorage
   * or persistent browser storage. They must remain in transient component memory only.
   *
   * @returns Promise resolving to enrollment payload containing secret and QR code.
   * @throws Error if backend fails or MFA is unsupported.
   */
  async initiateMfaSetup(): Promise<{
    secret: string;
    qrCodeUrl?: string;
    otpAuthUri?: string;
    recoveryCodes?: string[];
  }> {
    return singleFlight.run('mfa:initiate-setup', async () => {
      const response = await apiService.initiateMfaEnrollment();
      if (!response || !('success' in response) || !response.success || !response.data) {
        const errorMsg =
          ('message' in response && response.message) ||
          'Failed to initiate multi-factor authentication setup';
        throw new Error(errorMsg);
      }

      if (!response.data.secret) {
        throw new Error('Backend did not return an MFA enrollment secret');
      }

      return {
        secret: response.data.secret,
        qrCodeUrl: response.data.qrCodeUrl,
        otpAuthUri: response.data.otpAuthUri,
        recoveryCodes: response.data.recoveryCodes,
      };
    });
  }

  /**
   * Verifies an MFA enrollment code with the backend.
   * Uses singleFlight to prevent duplicate submissions.
   * Does NOT report MFA enabled unless the backend authoritatively confirms success.
   *
   * @param code - 6-digit TOTP verification code.
   * @returns Promise resolving to verification result.
   * @throws Error if code is invalid or backend verification rejects the code.
   */
  async verifyMfaSetup(code: string): Promise<{
    enabled: boolean;
    message?: string;
    recoveryCodes?: string[];
  }> {
    const trimmedCode = code ? code.trim() : '';
    if (!trimmedCode) {
      throw new Error('Verification code is required');
    }

    if (!/^\d{6}$/.test(trimmedCode)) {
      throw new Error('Verification code must be exactly 6 digits');
    }

    return singleFlight.run(`mfa:verify-setup:${trimmedCode}`, async () => {
      const response = await apiService.verifyMfaEnrollment({ code: trimmedCode });
      if (!response || !('success' in response) || !response.success || !response.data) {
        const errorMsg =
          ('message' in response && response.message) ||
          'Invalid verification code. Please check your authenticator app and try again.';
        throw new Error(errorMsg);
      }

      if (!response.data.enabled) {
        throw new Error('Backend did not confirm MFA enablement');
      }

      return {
        enabled: true,
        message: response.data.message || 'Two-factor authentication enabled successfully',
        recoveryCodes: response.data.recoveryCodes,
      };
    });
  }

  /**
   * Cancels an incomplete MFA setup flow.
   * Clears any transient state and ensures no lingering secrets or recovery codes.
   */
  cancelMfaSetup(): void {
    // In-memory operation: ensure no sensitive MFA state is leaked into persistent storage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mfa_secret');
      localStorage.removeItem('mfa_recovery_codes');
      sessionStorage.removeItem('mfa_secret');
      sessionStorage.removeItem('mfa_recovery_codes');
    }
  }
}

export const authService = new AuthService();
export default authService;

// Exported for unit tests only — not part of the public API surface.
export { GENERIC_AUTH_ERROR, GENERIC_REGISTER_ERROR, ACCOUNT_EXISTENCE_PATTERNS };
