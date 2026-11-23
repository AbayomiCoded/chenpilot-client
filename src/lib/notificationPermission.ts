/**
 * Browser notification permission (#302).
 *
 * - Reading never prompts: `Notification.permission` is read directly.
 * - `requestNotificationPermission()` must only be called from a user action (a click).
 * - Revocation outside the app is picked up via the Permissions API `change` event where
 *   supported; callers also re-check when the tab regains focus.
 */
export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Current permission without prompting. */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  const value = window.Notification.permission;
  return value === 'granted' || value === 'denied' ? value : 'default';
}

/** Ask the browser for permission. Call only in response to a user action. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    // Older Safari only supports the callback form
    const result = await new Promise<NotificationPermission>((resolve) => {
      const maybePromise = window.Notification.requestPermission(resolve);
      if (maybePromise && typeof (maybePromise as Promise<NotificationPermission>).then === 'function') {
        (maybePromise as Promise<NotificationPermission>).then(resolve);
      }
    });
    return result === 'granted' || result === 'denied' ? result : 'default';
  } catch {
    return getNotificationPermission();
  }
}

/** Subscribe to permission changes made outside the app. Returns an unsubscribe function. */
export function watchNotificationPermission(onChange: (state: NotificationPermissionState) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const recheck = () => onChange(getNotificationPermission());
  window.addEventListener('focus', recheck);
  document.addEventListener('visibilitychange', recheck);

  let status: PermissionStatus | null = null;
  const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
  permissions
    ?.query({ name: 'notifications' as PermissionName })
    .then((s) => {
      status = s;
      s.addEventListener('change', recheck);
    })
    .catch(() => undefined);

  return () => {
    window.removeEventListener('focus', recheck);
    document.removeEventListener('visibilitychange', recheck);
    status?.removeEventListener('change', recheck);
  };
}

/** User-facing explanation and next step for each state. */
export function describeNotificationPermission(state: NotificationPermissionState): string {
  switch (state) {
    case 'granted':
      return 'Browser notifications are allowed.';
    case 'denied':
      return "Browser notifications are blocked. To turn them on, allow notifications for this site in your browser's site settings (usually the lock icon next to the address bar), then come back here.";
    case 'unsupported':
      return "This browser doesn't support notifications.";
    default:
      return 'Browser notifications are off. Enable them to get alerts when this tab is in the background.';
  }
}
