# Browser Notification Permission (#302)

`src/lib/notificationPermission.ts` and `NotificationPermissionStatus` (Settings → Notifications).

- **Reading never prompts:** the current state is read from `Notification.permission` on mount.
- **Prompt only after a user action:** `requestNotificationPermission()` runs only when the user clicks "Enable browser notifications". The older callback-style API used by some Safari versions is supported.
- **States and next steps:**

| State | Shown |
| --- | --- |
| `default` | "Browser notifications are off…" plus the **Enable** button |
| `granted` | "Browser notifications are allowed." |
| `denied` | Blocked, with instructions to allow notifications in the browser's site settings (lock icon). There is no button, because the browser won't prompt again. |
| `unsupported` | "This browser doesn't support notifications." |

- **Revocation outside the app:** picked up from the Permissions API `change` event where it is available, and by re-checking on window focus and `visibilitychange`.
