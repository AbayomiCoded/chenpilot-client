'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import apiService from '@/services/api';
import type { NotificationPreferences } from '@/types/notificationPreferences';

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

const ROWS: Array<{ key: keyof NotificationPreferences; label: string; description: string }> = [
  { key: 'transactions', label: 'Transaction Notifications', description: 'Get notified when transactions complete' },
  { key: 'chat', label: 'Chat Notifications', description: 'Get notified of new AI agent responses' },
];

const isUnsupported = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 501;
};

const isValid = (value: unknown): value is NotificationPreferences =>
  !!value &&
  typeof (value as NotificationPreferences).transactions === 'boolean' &&
  typeof (value as NotificationPreferences).chat === 'boolean';

/**
 * Controlled notification preferences (#301). Values come from the account; each change is
 * saved immediately, reverted if the save fails (with a Retry), and the controls are shown as
 * unavailable when the backend has no preferences endpoint.
 */
export function NotificationPreferencesSection() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [failedChange, setFailedChange] = useState<NotificationPreferences | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const saved = await apiService.getNotificationPreferences();
      if (!isValid(saved)) throw new Error('Invalid preferences');
      setPrefs(saved);
      setLoadState('ready');
    } catch (error) {
      setLoadState(isUnsupported(error) ? 'unavailable' : 'error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (next: NotificationPreferences, previous: NotificationPreferences) => {
    setPrefs(next);
    setSaving(true);
    setFailedChange(null);
    try {
      const saved = await apiService.updateNotificationPreferences(next);
      setPrefs(isValid(saved) ? saved : next);
    } catch {
      // Revert so the checkbox shows what is actually saved, and offer a retry
      setPrefs(previous);
      setFailedChange(next);
    } finally {
      setSaving(false);
    }
  };

  if (loadState === 'loading') {
    return <p role="status" className="text-sm text-gray-400">Loading notification preferences…</p>;
  }
  if (loadState === 'unavailable') {
    return (
      <p className="text-sm text-gray-400" data-testid="notification-prefs-unavailable">
        Notification preferences aren&apos;t available for your account yet.
      </p>
    );
  }
  if (loadState === 'error' || !prefs) {
    return (
      <div role="alert" className="flex items-center gap-3 text-sm text-red-400">
        <span>Couldn&apos;t load notification preferences.</span>
        <Button type="button" size="sm" variant="ghost" onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ROWS.map((row) => (
        <div key={row.key} className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">{row.label}</p>
            <p className="text-sm text-gray-400">{row.description}</p>
          </div>
          <input
            type="checkbox"
            checked={prefs[row.key]}
            disabled={saving}
            onChange={(e) => save({ ...prefs, [row.key]: e.target.checked }, prefs)}
            aria-label={row.label}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
        </div>
      ))}
      {saving && <p role="status" className="text-xs text-gray-400">Saving…</p>}
      {failedChange && !saving && (
        <div role="alert" className="flex items-center gap-3 text-sm text-red-400">
          <span>Couldn&apos;t save your notification preferences.</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => save(failedChange, prefs)}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

export default NotificationPreferencesSection;
