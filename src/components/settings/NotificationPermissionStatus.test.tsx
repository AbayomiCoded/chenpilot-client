import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationPermissionStatus } from './NotificationPermissionStatus';

const installNotification = (permission: NotificationPermission, nextOnRequest?: NotificationPermission) => {
  const requestPermission = vi.fn(async () => {
    if (nextOnRequest) mock.permission = nextOnRequest;
    return mock.permission;
  });
  const mock = { permission, requestPermission };
  Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: mock });
  return mock;
};

describe('NotificationPermissionStatus (#302)', () => {
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete window.Notification;
  });

  it('reads the permission on load without prompting', () => {
    const mock = installNotification('default');
    render(<NotificationPermissionStatus />);
    expect(screen.getByTestId('notification-permission')).toHaveAttribute('data-state', 'default');
    expect(mock.requestPermission).not.toHaveBeenCalled();
  });

  it('requests permission only after the user clicks Enable', async () => {
    const mock = installNotification('default', 'granted');
    render(<NotificationPermissionStatus />);

    fireEvent.click(screen.getByRole('button', { name: 'Enable browser notifications' }));

    await waitFor(() => expect(screen.getByTestId('notification-permission')).toHaveAttribute('data-state', 'granted'));
    expect(mock.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('allowed');
  });

  it('explains how to unblock when denied, without a prompt button', () => {
    installNotification('denied');
    render(<NotificationPermissionStatus />);
    expect(screen.getByRole('status')).toHaveTextContent(/blocked.*site settings/i);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('handles unsupported browsers', () => {
    render(<NotificationPermissionStatus />);
    expect(screen.getByTestId('notification-permission')).toHaveAttribute('data-state', 'unsupported');
    expect(screen.getByRole('status')).toHaveTextContent("doesn't support notifications");
  });

  it('picks up a revocation made outside the app when the tab regains focus', () => {
    const mock = installNotification('granted');
    render(<NotificationPermissionStatus />);
    mock.permission = 'denied';
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(screen.getByTestId('notification-permission')).toHaveAttribute('data-state', 'denied');
  });
});
