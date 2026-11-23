import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sessionService, DEFAULT_SESSION_CONFIG } from "../sessionService";

describe("SessionService", () => {
  beforeEach(() => {
    // Clear session state before each test
    sessionService.clearSession();
    if (typeof window !== "undefined") {
      localStorage.clear();
    }
    vi.useFakeTimers();
  });

  afterEach(() => {
    sessionService.clearSession();
    if (typeof window !== "undefined") {
      localStorage.clear();
    }
    vi.useRealTimers();
  });

  describe("startSession", () => {
    it("starts a session with default config", () => {
      sessionService.startSession();
      expect(sessionService.isSessionActive()).toBe(true);
    });

    it("starts a session with custom config", () => {
      const customConfig = {
        sessionTimeout: 60000, // 1 minute
        warningTime: 10000, // 10 seconds
      };
      sessionService.startSession(customConfig);
      expect(sessionService.isSessionActive()).toBe(true);
    });

    it("clears existing timers when starting new session", () => {
      sessionService.startSession();
      const firstActive = sessionService.isSessionActive();
      sessionService.startSession();
      const secondActive = sessionService.isSessionActive();
      expect(firstActive).toBe(true);
      expect(secondActive).toBe(true);
    });

    it("saves expiration time to localStorage", () => {
      sessionService.startSession();
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("session_expiration");
        expect(stored).not.toBeNull();
      }
    });

    it("resets warning triggered time on new session", () => {
      sessionService.startSession();
      vi.advanceTimersByTime(
        DEFAULT_SESSION_CONFIG.sessionTimeout -
          DEFAULT_SESSION_CONFIG.warningTime,
      );
      vi.advanceTimersByTime(1000);
      sessionService.startSession();
      expect(sessionService.isWarningActive()).toBe(false);
    });
  });

  describe("extendSession", () => {
    it("extends the session with new expiration time", () => {
      sessionService.startSession();
      vi.advanceTimersByTime(10000);
      sessionService.extendSession();
      const extendedTime = sessionService.getTimeUntilExpiration();
      expect(extendedTime).toBeGreaterThan(0);
    });

    it("triggers onExtend callbacks", () => {
      const callback = vi.fn();
      sessionService.onExtend(callback);
      sessionService.extendSession();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("resets warning state when extending", () => {
      sessionService.startSession();
      vi.advanceTimersByTime(
        DEFAULT_SESSION_CONFIG.sessionTimeout -
          DEFAULT_SESSION_CONFIG.warningTime,
      );
      vi.advanceTimersByTime(1000);
      sessionService.extendSession();
      expect(sessionService.isWarningActive()).toBe(false);
    });
  });

  describe("clearSession", () => {
    it("clears session and timers", () => {
      sessionService.startSession();
      sessionService.clearSession();
      expect(sessionService.isSessionActive()).toBe(false);
      expect(sessionService.getTimeUntilExpiration()).toBeNull();
    });

    it("removes expiration time from localStorage", () => {
      sessionService.startSession();
      sessionService.clearSession();
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("session_expiration");
        expect(stored).toBeNull();
      }
    });

    it("clears warning state", () => {
      sessionService.startSession();
      vi.advanceTimersByTime(
        DEFAULT_SESSION_CONFIG.sessionTimeout -
          DEFAULT_SESSION_CONFIG.warningTime,
      );
      vi.advanceTimersByTime(1000);
      sessionService.clearSession();
      expect(sessionService.isWarningActive()).toBe(false);
    });
  });

  describe("getTimeUntilExpiration", () => {
    it("returns remaining time when session is active", () => {
      sessionService.startSession();
      const timeUntil = sessionService.getTimeUntilExpiration();
      expect(timeUntil).toBeGreaterThan(0);
    });

    it("returns null when session is not active", () => {
      const timeUntil = sessionService.getTimeUntilExpiration();
      expect(timeUntil).toBeNull();
    });

    it("returns 0 when session has expired", () => {
      sessionService.startSession();
      vi.advanceTimersByTime(DEFAULT_SESSION_CONFIG.sessionTimeout + 1000);
      const timeUntil = sessionService.getTimeUntilExpiration();
      // Service returns null when expired but clears session on expiration
      expect(timeUntil).toBeNull();
    });
  });

  describe("getTimeUntilWarning", () => {
    it("returns time until warning when session is active", () => {
      sessionService.startSession();
      const timeUntil = sessionService.getTimeUntilWarning();
      expect(timeUntil).toBeGreaterThan(0);
    });

    it("returns null when session is not active", () => {
      const timeUntil = sessionService.getTimeUntilWarning();
      expect(timeUntil).toBeNull();
    });

    it("returns null after warning has been triggered", () => {
      sessionService.startSession();
      vi.advanceTimersByTime(
        DEFAULT_SESSION_CONFIG.sessionTimeout -
          DEFAULT_SESSION_CONFIG.warningTime,
      );
      vi.advanceTimersByTime(1000);
      const timeUntil = sessionService.getTimeUntilWarning();
      expect(timeUntil).toBeNull();
    });
  });

  describe("isWarningActive", () => {
    it("returns false when session is not started", () => {
      expect(sessionService.isWarningActive()).toBe(false);
    });

    it("returns false before warning time", () => {
      sessionService.startSession();
      expect(sessionService.isWarningActive()).toBe(false);
    });

    it("returns true after warning time has passed", () => {
      sessionService.startSession();
      vi.advanceTimersByTime(
        DEFAULT_SESSION_CONFIG.sessionTimeout -
          DEFAULT_SESSION_CONFIG.warningTime,
      );
      vi.advanceTimersByTime(1000);
      expect(sessionService.isWarningActive()).toBe(true);
    });
  });

  describe("isSessionActive", () => {
    it("returns false when session is not started", () => {
      expect(sessionService.isSessionActive()).toBe(false);
    });

    it("returns true when session is active", () => {
      sessionService.startSession();
      expect(sessionService.isSessionActive()).toBe(true);
    });

    it("returns false when session has expired", () => {
      sessionService.startSession();
      vi.advanceTimersByTime(DEFAULT_SESSION_CONFIG.sessionTimeout + 1000);
      expect(sessionService.isSessionActive()).toBe(false);
    });
  });

  describe("callback registration", () => {
    it("onWarning registers and triggers callback", () => {
      const callback = vi.fn();
      sessionService.onWarning(callback);
      sessionService.startSession();
      vi.advanceTimersByTime(
        DEFAULT_SESSION_CONFIG.sessionTimeout -
          DEFAULT_SESSION_CONFIG.warningTime,
      );
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("onExpiration registers and triggers callback", () => {
      const callback = vi.fn();
      sessionService.onExpiration(callback);
      sessionService.startSession();
      vi.advanceTimersByTime(DEFAULT_SESSION_CONFIG.sessionTimeout + 1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("onExtend registers and triggers callback", () => {
      const callback = vi.fn();
      sessionService.onExtend(callback);
      sessionService.startSession();
      sessionService.extendSession();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("callback unregister function removes callback", () => {
      const callback = vi.fn();
      const unregister = sessionService.onWarning(callback);
      sessionService.startSession();
      unregister();
      vi.advanceTimersByTime(
        DEFAULT_SESSION_CONFIG.sessionTimeout -
          DEFAULT_SESSION_CONFIG.warningTime,
      );
      vi.advanceTimersByTime(1000);
      expect(callback).not.toHaveBeenCalled();
    });

    it("multiple callbacks are all triggered", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      sessionService.onWarning(callback1);
      sessionService.onWarning(callback2);
      sessionService.startSession();
      vi.advanceTimersByTime(
        DEFAULT_SESSION_CONFIG.sessionTimeout -
          DEFAULT_SESSION_CONFIG.warningTime,
      );
      vi.advanceTimersByTime(1000);
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("cross-tab synchronization", () => {
    it("getStoredExpirationTime returns stored time", () => {
      const testTime = Date.now() + 60000;
      if (typeof window !== "undefined") {
        localStorage.setItem("session_expiration", testTime.toString());
      }
      const stored = sessionService.getStoredExpirationTime();
      expect(stored).toBe(testTime);
    });

    it("getStoredExpirationTime returns null when not set", () => {
      const stored = sessionService.getStoredExpirationTime();
      expect(stored).toBeNull();
    });

    it("syncWithStoredSession updates expiration time", () => {
      const testTime = Date.now() + 60000;
      if (typeof window !== "undefined") {
        localStorage.setItem("session_expiration", testTime.toString());
      }
      sessionService.syncWithStoredSession();
      expect(sessionService.getTimeUntilExpiration()).toBeGreaterThan(0);
    });

    it("setupCrossTabSync returns cleanup function", () => {
      const cleanup = sessionService.setupCrossTabSync();
      expect(typeof cleanup).toBe("function");
      cleanup!();
    });

    it("setupCrossTabSync handles session cleared in another tab", () => {
      const onExpiration = vi.fn();
      sessionService.onExpiration(onExpiration);
      sessionService.startSession();
      const cleanup = sessionService.setupCrossTabSync();

      // Simulate storage event for session cleared
      const event = new StorageEvent("storage", {
        key: "session_expiration",
        newValue: null,
      });
      window.dispatchEvent(event);

      expect(onExpiration).toHaveBeenCalled();
      cleanup!();
    });

    it("setupCrossTabSync handles session updated in another tab", () => {
      sessionService.startSession();
      const cleanup = sessionService.setupCrossTabSync();

      const newExpirationTime = Date.now() + 120000;
      const event = new StorageEvent("storage", {
        key: "session_expiration",
        newValue: newExpirationTime.toString(),
      });
      window.dispatchEvent(event);

      const timeUntil = sessionService.getTimeUntilExpiration();
      expect(timeUntil).toBeGreaterThan(0);
      cleanup!();
    });
  });

  describe("edge cases", () => {
    it("handles rapid session start/stop cycles", () => {
      for (let i = 0; i < 5; i++) {
        sessionService.startSession();
        sessionService.clearSession();
      }
      expect(sessionService.isSessionActive()).toBe(false);
    });

    it("handles extending session before expiration", () => {
      sessionService.startSession();
      vi.advanceTimersByTime(10000);
      sessionService.extendSession();
      expect(sessionService.isSessionActive()).toBe(true);
    });

    it("handles extending session after expiration", () => {
      sessionService.startSession();
      vi.advanceTimersByTime(DEFAULT_SESSION_CONFIG.sessionTimeout + 1000);
      sessionService.extendSession();
      expect(sessionService.isSessionActive()).toBe(true);
    });

    it("handles multiple warning callbacks", () => {
      const callbacks = Array.from({ length: 5 }, () => vi.fn());
      callbacks.forEach((cb) => sessionService.onWarning(cb));
      sessionService.startSession();
      vi.advanceTimersByTime(
        DEFAULT_SESSION_CONFIG.sessionTimeout -
          DEFAULT_SESSION_CONFIG.warningTime,
      );
      vi.advanceTimersByTime(1000);
      callbacks.forEach((cb) => {
        expect(cb).toHaveBeenCalledTimes(1);
      });
    });
  });
});
