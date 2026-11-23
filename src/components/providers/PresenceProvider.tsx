'use client';

import React from 'react';
import {
  usePresenceManagement,
  useActivityPresenceTracking,
  useBrowserPresenceTransitions,
} from '@/hooks/usePresenceManagement';
import { useAppSelector } from '@/store';

interface PresenceProviderProps {
  children: React.ReactNode;
}

/**
 * Presence Provider - Manages user presence state and real-time updates
 */
export function PresenceProvider({ children }: PresenceProviderProps) {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

  // Initialize presence management when authenticated
  usePresenceManagement();

  // Track user activity to keep presence alive
  useActivityPresenceTracking(isAuthenticated);

  // Debounced presence updates on tab visibility / connectivity changes (#288)
  useBrowserPresenceTransitions(isAuthenticated);

  return <>{children}</>;
}
