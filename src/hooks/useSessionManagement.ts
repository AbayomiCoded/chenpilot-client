import { useEffect } from 'react';
import { useAppDispatch } from '@/store';
import { setSessionExpirationTime, setSessionWarningActive } from '@/store/slices/authSlice';
import { sessionService, DEFAULT_SESSION_CONFIG } from '@/services/sessionService';

/**
 * Hook to manage session lifecycle
 * Starts session on mount, handles expiration and extension
 */
export function useSessionManagement() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Sync with any existing session from other tabs
    sessionService.syncWithStoredSession();

    // Start the session when component mounts (i.e., when user logs in)
    sessionService.startSession(DEFAULT_SESSION_CONFIG);

    // Setup cross-tab synchronization
    const cleanupCrossTabSync = sessionService.setupCrossTabSync();

    // Handle warning trigger
    const unsubscribeWarning = sessionService.onWarning(() => {
      dispatch(setSessionWarningActive(true));
      // Store expiration time in redux for component access
      const timeUntilExpiration = sessionService.getTimeUntilExpiration();
      if (timeUntilExpiration !== null) {
        dispatch(setSessionExpirationTime(Date.now() + timeUntilExpiration));
      }
    });

    // Handle session extension
    const unsubscribeExtend = sessionService.onExtend(() => {
      dispatch(setSessionWarningActive(false));
      dispatch(setSessionExpirationTime(null));
    });

    // Cleanup on unmount
    return () => {
      unsubscribeWarning();
      unsubscribeExtend();
      cleanupCrossTabSync?.();
    };
  }, [dispatch]);
}

/**
 * Hook to restart session on user activity
 * Resets inactivity timer when user interacts with the page
 */
export function useActivityTracking(shouldTrack: boolean = true) {
  useEffect(() => {
    if (!shouldTrack || !sessionService.isSessionActive()) {
      return;
    }

    const resetSessionTimeout = () => {
      // Only reset if warning is not already active
      if (!sessionService.isWarningActive()) {
        sessionService.extendSession(DEFAULT_SESSION_CONFIG);
      }
    };

    // Track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((event) => {
      document.addEventListener(event, resetSessionTimeout, true);
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, resetSessionTimeout, true);
      });
    };
  }, [shouldTrack]);
}
