'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { sessionService } from '@/services/sessionService';
import { useAppDispatch } from '@/store';
import { logout } from '@/store/slices/authSlice';
import { useRouter } from 'next/navigation';

export function SessionExpirationWarning() {
  const [isVisible, setIsVisible] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const dispatch = useAppDispatch();
  const router = useRouter();

  useEffect(() => {
    // Handle warning trigger
    const unsubscribeWarning = sessionService.onWarning(() => {
      setIsVisible(true);
    });

    // Handle expiration
    const unsubscribeExpiration = sessionService.onExpiration(() => {
      setIsVisible(false);
      dispatch(logout());
      router.push('/auth/login');
    });

    // Handle extension
    const unsubscribeExtend = sessionService.onExtend(() => {
      setIsVisible(false);
      setTimeRemaining(0);
    });

    return () => {
      unsubscribeWarning();
      unsubscribeExpiration();
      unsubscribeExtend();
    };
  }, [dispatch, router]);

  // Update time display while warning is visible
  useEffect(() => {
    if (!isVisible) return;

    const updateTimeDisplay = () => {
      const remaining = sessionService.getTimeUntilExpiration();
      if (remaining !== null) {
        setTimeRemaining(remaining);
      }
    };

    updateTimeDisplay();

    const interval = setInterval(updateTimeDisplay, 1000);
    return () => clearInterval(interval);
  }, [isVisible]);

  const handleExtendSession = () => {
    sessionService.extendSession();
  };

  const handleLogout = () => {
    dispatch(logout());
    router.push('/auth/login');
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="bg-yellow-50 dark:bg-yellow-950 border-b border-yellow-200 dark:border-yellow-800 px-6 py-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <h2 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100">
            Session Expiring Soon
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-gray-700 dark:text-gray-300 text-sm">
            Your session will expire due to inactivity. Click extend to stay logged in or
            you'll be redirected to the login page.
          </p>

          {/* Time Display */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Time remaining:
              </span>
            </div>
            <span className="font-mono font-semibold text-lg text-gray-900 dark:text-white">
              {formatTime(timeRemaining)}
            </span>
          </div>

          {/* Warning Message */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-3">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>💾 Tip:</strong> Your work is safe. Extending your session will keep you
              logged in.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 flex gap-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleLogout}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Logout
          </button>
          <button
            onClick={handleExtendSession}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Extend Session
          </button>
        </div>
      </div>
    </div>
  );
}
