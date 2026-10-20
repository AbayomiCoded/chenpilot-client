import apiService from './api';

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

  /**
   * Normalize a login error into a single user-visible string that does not
   * reveal whether the email address exists.
   *
   * Account-existence signals (wrong password, user not found, invalid
   * credentials, etc.) are collapsed into a generic message.  The original
   * error is written to console.error so internal diagnostics remain intact.
   *
   * @param error - Raw error value from a failed login thunk / API call.
   * @returns A safe, public-facing error string.
   */
  normalizeLoginError(error: unknown): string {
    const raw = this._extractMessage(error);

    // Redacted internal log — never shown to the user.
    console.error('[auth] login error (internal):', raw);

    if (this._isAccountExistenceSignal(raw) || this._isHttpCredentialError(error)) {
      return GENERIC_AUTH_ERROR;
    }

    return GENERIC_AUTH_ERROR;
  }

  /**
   * Normalize a registration error into a single user-visible string that
   * does not reveal whether the email address is already enrolled.
   *
   * @param error - Raw error value from a failed register thunk / API call.
   * @returns A safe, public-facing error string.
   */
  normalizeRegisterError(error: unknown): string {
    const raw = this._extractMessage(error);

    // Redacted internal log — never shown to the user.
    console.error('[auth] register error (internal):', raw);

    if (this._isAccountExistenceSignal(raw) || this._isHttpCredentialError(error)) {
      return GENERIC_REGISTER_ERROR;
    }

    return GENERIC_REGISTER_ERROR;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Extract a plain message string from an arbitrary thrown value. */
  private _extractMessage(error: unknown): string {
    if (!error) return '';
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
      const e = error as Record<string, any>;
      return (
        e.message ||
        e.response?.data?.message ||
        e.response?.data?.error ||
        ''
      );
    }
    return '';
  }

  /** Returns true when the message matches a known account-existence pattern. */
  private _isAccountExistenceSignal(message: string): boolean {
    return ACCOUNT_EXISTENCE_PATTERNS.some((re) => re.test(message));
  }

  /** Returns true for HTTP 401 / 409 status codes that reveal credential facts. */
  private _isHttpCredentialError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const status = (error as Record<string, any>).response?.status;
    return status === 401 || status === 409;
  }
}

export const authService = new AuthService();
export default authService;

// Exported for unit tests only — not part of the public API surface.
export { GENERIC_AUTH_ERROR, GENERIC_REGISTER_ERROR, ACCOUNT_EXISTENCE_PATTERNS };
