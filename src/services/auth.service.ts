import apiService from './api';

/**
 * Auth error normalized for forms (#258). `fieldErrors` holds messages for known form fields;
 * `message` is a general message safe to show (never contains the submitted password).
 */
export interface NormalizedAuthError {
  message: string;
  fieldErrors: Record<string, string>;
  status?: number;
}

const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';
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
    message = redact((error as { message: string }).message, secrets) || GENERIC_AUTH_ERROR;
  } else message = GENERIC_AUTH_ERROR;

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
 * Service for handling authentication-related tasks beyond basic API calls,
 * such as state persistence in local browser storage and session destruction.
 */
class AuthService {
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
   * @template T - Target return type (defaults to any).
   * @returns Parsed user object of type T or `null`.
   */
  getUserData<T = any>(): T | null {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem('user_data');
    return data ? JSON.parse(data) : null;
  }
}

export const authService = new AuthService();
export default authService;
