/**
 * Session Service - Manages user session lifecycle and expiration
 */

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
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'session_expiration',
        this.expirationTime.toString(),
      );
    }
  }

  private triggerWarning() {
    this.warningTriggeredTime = Date.now();
    this.callbacks.onWarning.forEach((cb) => cb());
    console.log('[SessionService] Session expiration warning triggered');
  }

  private triggerExpiration() {
    console.log('[SessionService] Session expired');
    this.callbacks.onExpiration.forEach((cb) => cb());
    this.clearSession();
  }

  extendSession(config: SessionConfig = DEFAULT_SESSION_CONFIG) {
    // Restart the session
    this.startSession(config);
    this.callbacks.onExtend.forEach((cb) => cb());
    console.log('[SessionService] Session extended');
  }

  clearSession() {
    this.clearTimers();
    this.expirationTime = null;
    this.warningTriggeredTime = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('session_expiration');
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
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('session_expiration');
    return stored ? parseInt(stored, 10) : null;
  }

  syncWithStoredSession() {
    const storedTime = this.getStoredExpirationTime();
    if (storedTime) {
      this.expirationTime = storedTime;
    }
  }

  // Setup cross-tab synchronization
  setupCrossTabSync() {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'session_expiration') {
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
            const warningTriggerTime = timeUntilExpiration - DEFAULT_SESSION_CONFIG.warningTime;

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

    window.addEventListener('storage', handleStorageChange);

    // Return cleanup function
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }
}

export const sessionService = new SessionService();
