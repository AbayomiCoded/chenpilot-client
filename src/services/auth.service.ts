import apiService from './api';

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
  const reauthenticate = options.reauthenticate ?? ((password: string) => apiService.reauthenticate(password));

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
