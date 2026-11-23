import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { getNotificationPreferences: vi.fn(), updateNotificationPreferences: vi.fn() },
}));
vi.mock('@/services/api', () => ({ default: api }));

import { NotificationPreferencesSection } from './NotificationPreferencesSection';

const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('NotificationPreferencesSection (#301)', () => {
  beforeEach(() => {
    api.getNotificationPreferences.mockReset();
    api.updateNotificationPreferences.mockReset();
  });

  it('shows the saved values', async () => {
    api.getNotificationPreferences.mockResolvedValue({ transactions: false, chat: true });
    render(<NotificationPreferencesSection />);

    await screen.findByRole('checkbox', { name: 'Transaction Notifications' });
    expect(checkbox('Transaction Notifications').checked).toBe(false);
    expect(checkbox('Chat Notifications').checked).toBe(true);
  });

  it('persists a change through the preferences service', async () => {
    api.getNotificationPreferences.mockResolvedValue({ transactions: false, chat: true });
    api.updateNotificationPreferences.mockImplementation(async (p) => p);
    render(<NotificationPreferencesSection />);

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Transaction Notifications' }));

    await waitFor(() =>
      expect(api.updateNotificationPreferences).toHaveBeenCalledWith({ transactions: true, chat: true }),
    );
    expect(checkbox('Transaction Notifications').checked).toBe(true);
  });

  it('reverts on save failure and retries the same change', async () => {
    api.getNotificationPreferences.mockResolvedValue({ transactions: false, chat: true });
    api.updateNotificationPreferences
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockImplementationOnce(async (p) => p);
    render(<NotificationPreferencesSection />);

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Transaction Notifications' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save");
    expect(checkbox('Transaction Notifications').checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(checkbox('Transaction Notifications').checked).toBe(true));
    expect(api.updateNotificationPreferences).toHaveBeenLastCalledWith({ transactions: true, chat: true });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks the controls unavailable when the backend has no endpoint', async () => {
    api.getNotificationPreferences.mockRejectedValue({ response: { status: 404 } });
    render(<NotificationPreferencesSection />);
    expect(await screen.findByTestId('notification-prefs-unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    api.getNotificationPreferences
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce({ transactions: true, chat: false });
    render(<NotificationPreferencesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('checkbox', { name: 'Chat Notifications' })).not.toBeChecked();
  });
});
