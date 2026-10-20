import apiService from './api';

const REAUTHENTICATION_WINDOW_MS = 5 * 60 * 1000;

/**
 * Service for handling authentication-related tasks beyond basic API calls,
 * such as state persistence in local browser storage and session destruction.
 */
class AuthService {
  private recentAuthenticationAt: number | null = null;

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
