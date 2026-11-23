/**
 * Session Service - Manages user session lifecycle and expiration
 */
import apiService from './api';
import type { SignInActivityEvent, SignInActivityPage } from '@/types';

export interface SessionConfig {
  sessionTimeout: number; // Total session duration in milliseconds
  warningTime: number; // Time before expiration to show warning in milliseconds
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  warningTime: 5 * 60 * 1000, // Warn 5 minutes before expiration
};

class SessionService {
  private expirationTime: number | null = null;
  private warningTriggeredTime: number | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private warningTimeoutId: NodeJS.Timeout | null = null;
  private callbacks = {
    onWarning: [] as Array<() => void>,
    onExpiration: [] as Array<() => void>,
    onExtend: [] as Array<() => void>,
  };

  startSession(config: SessionConfig = DEFAULT_SESSION_CONFIG) {
    // Clear any existing timers
    this.clearTimers();

    // Set expiration time
    this.expirationTime = Date.now() + config.sessionTimeout;
    this.warningTriggeredTime = null;

    // Calculate when to show warning
    const warningTriggerTime = config.sessionTimeout - config.warningTime;

    // Set warning timeout
    this.warningTimeoutId = setTimeout(() => {
      this.triggerWarning();
    }, warningTriggerTime);

    // Set expiration timeout
    this.timeoutId = setTimeout(() => {
      this.triggerExpiration();
    }, config.sessionTimeout);

    // Save session start time to localStorage for cross-tab sync
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "session_expiration",
        this.expirationTime.toString(),
      );
    }
  }

  private triggerWarning() {
    this.warningTriggeredTime = Date.now();
    this.callbacks.onWarning.forEach((cb) => cb());
    console.log("[SessionService] Session expiration warning triggered");
  }

  private triggerExpiration() {
    console.log("[SessionService] Session expired");
    this.callbacks.onExpiration.forEach((cb) => cb());
    this.clearSession();
  }

  extendSession(config: SessionConfig = DEFAULT_SESSION_CONFIG) {
    // Restart the session
    this.startSession(config);
    this.callbacks.onExtend.forEach((cb) => cb());
    console.log("[SessionService] Session extended");
  }

  clearSession() {
    this.clearTimers();
    this.expirationTime = null;
    this.warningTriggeredTime = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("session_expiration");
    }
  }

  private clearTimers() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.warningTimeoutId) {
      clearTimeout(this.warningTimeoutId);
      this.warningTimeoutId = null;
    }
  }

  getTimeUntilExpiration(): number | null {
    if (!this.expirationTime) return null;
    const remaining = this.expirationTime - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  getTimeUntilWarning(): number | null {
    if (!this.expirationTime || this.warningTriggeredTime) return null;
    const timeUntilExpiration = this.getTimeUntilExpiration();
    if (!timeUntilExpiration) return null;
    return Math.max(0, timeUntilExpiration);
  }

  isWarningActive(): boolean {
    return this.warningTriggeredTime !== null;
  }

  isSessionActive(): boolean {
    const timeUntilExpiration = this.getTimeUntilExpiration();
    return timeUntilExpiration !== null && timeUntilExpiration > 0;
  }

  onWarning(callback: () => void): () => void {
    this.callbacks.onWarning.push(callback);
    return () => {
      this.callbacks.onWarning = this.callbacks.onWarning.filter(
        (cb) => cb !== callback,
      );
    };
  }

  onExpiration(callback: () => void): () => void {
    this.callbacks.onExpiration.push(callback);
    return () => {
      this.callbacks.onExpiration = this.callbacks.onExpiration.filter(
        (cb) => cb !== callback,
      );
    };
  }

  onExtend(callback: () => void): () => void {
    this.callbacks.onExtend.push(callback);
    return () => {
      this.callbacks.onExtend = this.callbacks.onExtend.filter(
        (cb) => cb !== callback,
      );
    };
  }

  // For cross-tab session tracking
  getStoredExpirationTime(): number | null {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("session_expiration");
    return stored ? parseInt(stored, 10) : null;
  }

  syncWithStoredSession() {
    const storedTime = this.getStoredExpirationTime();
    if (storedTime) {
      this.expirationTime = storedTime;
    }
  }

  // Setup cross-tab synchronization
  setupCrossTabSync(): () => void {
    if (typeof window === "undefined") return () => undefined;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "session_expiration") {
        if (e.newValue === null) {
          // Session was cleared in another tab
          this.clearSession();
          this.callbacks.onExpiration.forEach((cb) => cb());
        } else {
          // Session was updated in another tab
          const newExpirationTime = parseInt(e.newValue, 10);
          if (!isNaN(newExpirationTime)) {
            this.expirationTime = newExpirationTime;
            // Restart timers with new expiration time
            const now = Date.now();
            const timeUntilExpiration = newExpirationTime - now;
            const warningTriggerTime =
              timeUntilExpiration - DEFAULT_SESSION_CONFIG.warningTime;

            this.clearTimers();

            if (warningTriggerTime > 0) {
              this.warningTimeoutId = setTimeout(() => {
                this.triggerWarning();
              }, warningTriggerTime);
            }

            if (timeUntilExpiration > 0) {
              this.timeoutId = setTimeout(() => {
                this.triggerExpiration();
              }, timeUntilExpiration);
            } else {
              // Session already expired
              this.triggerExpiration();
            }
          }
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Return cleanup function
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }
}

export const sessionService = new SessionService();

// ─── Sign-in activity (#257) ────────────────────────────────────────────────

export type SignInActivityResult =
  | { status: 'ok'; page: SignInActivityPage }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

const EVENT_TYPES = new Set(['sign_in', 'sign_out', 'password_change', 'reauthentication', 'token_refresh']);

/** Validate and sort a server activity page (newest first); unknown or malformed events are dropped. */
export function normalizeActivityPage(raw: unknown): SignInActivityPage {
  const data = (raw ?? {}) as { events?: unknown; capabilities?: Partial<SignInActivityPage['capabilities']> };
  const events = (Array.isArray(data.events) ? data.events : [])
    .filter((e): e is SignInActivityEvent => {
      const event = e as Partial<SignInActivityEvent>;
      return (
        typeof event?.id === 'string' &&
        EVENT_TYPES.has(event.type as string) &&
        (event.outcome === 'success' || event.outcome === 'failure') &&
        typeof event.occurredAt === 'string' &&
        !Number.isNaN(Date.parse(event.occurredAt))
      );
    })
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  return {
    events,
    capabilities: {
      revokeSession: data.capabilities?.revokeSession === true,
      reportEvent: data.capabilities?.reportEvent === true,
    },
  };
}

/** Load recent sign-in activity. A 404/501 means the backend has no activity endpoint yet. */
export async function loadSignInActivity(limit = 20): Promise<SignInActivityResult> {
  try {
    return { status: 'ok', page: normalizeActivityPage(await apiService.getSignInActivity(limit)) };
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 501) return { status: 'unsupported' };
    return { status: 'error', message: "Couldn't load sign-in activity. Try again later." };
  }
}

export const revokeSession = (sessionId: string) => apiService.revokeSession(sessionId);
export const reportSignInEvent = (eventId: string) => apiService.reportSignInEvent(eventId);

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS: Array<[RegExp, string]> = [
  [/Windows/, 'Windows'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** Approximate "Browser on OS" label; never exposes version numbers or the raw user agent. */
export function describeDevice(event: Pick<SignInActivityEvent, 'device' | 'userAgent'>): string {
  let browser = event.device?.browser;
  let os = event.device?.os;
  if ((!browser || !os) && event.userAgent) {
    browser ??= BROWSERS.find(([re]) => re.test(event.userAgent!))?.[1];
    os ??= SYSTEMS.find(([re]) => re.test(event.userAgent!))?.[1];
  }
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || 'Unknown device';
}

/** Approximate location label ("Region, Country"), or null. */
export function describeLocation(event: Pick<SignInActivityEvent, 'approxLocation'>): string | null {
  const parts = [event.approxLocation?.region, event.approxLocation?.country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Coarsen an IP address for the optional details view: IPv4 keeps the first three octets
 * (`203.0.113.x`), IPv6 keeps the first three groups. Never shown by default.
 */
export function maskIpAddress(ip: string | undefined): string | null {
  if (!ip) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return `${ip.split('.').slice(0, 3).join('.')}.x`;
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}:…`;
  return null;
}
