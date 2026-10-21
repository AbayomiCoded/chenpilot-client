import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { deleteAccount: vi.fn(), changePassword: vi.fn(), reauthenticate: vi.fn() },
}));

vi.mock('@/services/api', () => ({ default: api }));

import { SecuritySettings } from './SecuritySettings';

const challenge = { response: { status: 403, data: { code: 'REAUTH_REQUIRED', maxAgeSeconds: 300 } } };

const startDelete = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
  fireEvent.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
};

describe('SecuritySettings re-authentication (#255)', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it('deletes without a prompt when the server does not require re-authentication', async () => {
    api.deleteAccount.mockResolvedValue({ success: true });
    const onAccountDeleted = vi.fn();
    render(<SecuritySettings title="Security" onAccountDeleted={onAccountDeleted} />);

    startDelete();

    await waitFor(() => expect(onAccountDeleted).toHaveBeenCalled());
    expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument();
  });

  it('asks for the password on challenge, re-authenticates and completes the action', async () => {
    api.deleteAccount.mockRejectedValueOnce(challenge).mockResolvedValueOnce({ success: true });
    api.reauthenticate.mockResolvedValue({});
    const onAccountDeleted = vi.fn();
    render(<SecuritySettings title="Security" onAccountDeleted={onAccountDeleted} />);

    startDelete();
    const password = await screen.findByLabelText('Password');
    fireEvent.change(password, { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onAccountDeleted).toHaveBeenCalled());
    expect(api.reauthenticate).toHaveBeenCalledWith('Secret123');
    expect(api.deleteAccount).toHaveBeenCalledTimes(2);
  });

  it('cancelling the prompt leaves the account untouched', async () => {
    api.deleteAccount.mockRejectedValue(challenge);
    const onAccountDeleted = vi.fn();
    render(<SecuritySettings title="Security" onAccountDeleted={onAccountDeleted} />);

    startDelete();
    await screen.findByLabelText('Password');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Cancelled. Nothing was changed.')).toBeInTheDocument();
    expect(api.reauthenticate).not.toHaveBeenCalled();
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it('change password clears both password fields after the request', async () => {
    api.changePassword.mockResolvedValue({ success: true });
    render(<SecuritySettings title="Security" onAccountDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'OldPass123' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPass456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText('Your password was changed.')).toBeInTheDocument();
    expect(api.changePassword).toHaveBeenCalledWith('OldPass123', 'NewPass456');
  });
});
