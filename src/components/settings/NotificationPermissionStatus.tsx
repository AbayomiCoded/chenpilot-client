'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  NotificationPermissionState,
  describeNotificationPermission,
  getNotificationPermission,
  requestNotificationPermission,
  watchNotificationPermission,
} from '@/lib/notificationPermission';

/**
 * Shows the browser notification permission and the next step (#302). Reads the permission on
 * mount without prompting; the browser prompt only appears after the user clicks "Enable".
 */
export function NotificationPermissionStatus() {
  const [state, setState] = useState<NotificationPermissionState>('default');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setState(getNotificationPermission());
    return watchNotificationPermission(setState);
  }, []);

  const enable = async () => {
    setRequesting(true);
    setState(await requestNotificationPermission());
    setRequesting(false);
  };

  return (
    <div className="rounded-md border border-gray-700 p-3" data-testid="notification-permission" data-state={state}>
      <p role="status" className="text-sm text-gray-300">
        {describeNotificationPermission(state)}
      </p>
      {state === 'default' && (
        <Button type="button" size="sm" className="mt-2" onClick={enable} disabled={requesting}>
          {requesting ? 'Waiting for browser…' : 'Enable browser notifications'}
        </Button>
      )}
    </div>
  );
}

export default NotificationPermissionStatus;
