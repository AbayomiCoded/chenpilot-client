import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { getSignInActivity: vi.fn(), revokeSession: vi.fn(), reportSignInEvent: vi.fn() },
}));
vi.mock('@/services/api', () => ({ default: api }));

import { SignInActivity } from './SignInActivity';

const events = [
  {
    id: 'e1',
    type: 'sign_in',
    outcome: 'success',
    occurredAt: '2026-10-20T09:15:00Z',
    device: { browser: 'Chrome', os: 'macOS' },
    approxLocation: { region: 'Lagos', country: 'NG' },
    ipAddress: '203.0.113.42',
    sessionId: 's-current',
    current: true,
  },
  {
    id: 'e2',
    type: 'sign_in',
    outcome: 'success',
    occurredAt: '2026-10-19T22:00:00Z',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0',
    ipAddress: '198.51.100.7',
    sessionId: 's-other',
  },
  {
    id: 'e3',
    type: 'sign_in',
    outcome: 'failure',
    occurredAt: '2026-10-18T03:00:00Z',
    device: { browser: 'Firefox', os: 'Linux' },
    ipAddress: '192.0.2.10',
  },
];

const respond = (capabilities: Record<string, boolean> = {}) =>
  api.getSignInActivity.mockResolvedValue({ events, capabilities });

describe('SignInActivity (#257)', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it('shows date, approximate device and outcome without IP addresses by default', async () => {
    respond();
    const { container } = render(<SignInActivity />);

    const rows = await screen.findAllByTestId('activity-event');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText(/Chrome on macOS/)).toBeInTheDocument();
    expect(within(rows[0]).getByText('This device')).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Edge on Windows/)).toBeInTheDocument();
    expect(within(rows[2]).getByText('failed')).toBeInTheDocument();
    expect(rows[0].querySelector('time')).toHaveAttribute('dateTime', '2026-10-20T09:15:00Z');

    for (const ip of ['203.0.113', '198.51.100', '192.0.2']) {
      expect(container.textContent).not.toContain(ip);
    }
  });

  it('reveals only coarsened network details on request', async () => {
    respond();
    const { container } = render(<SignInActivity />);
    await screen.findAllByTestId('activity-event');

    fireEvent.click(screen.getByLabelText('Show network details'));

    expect(container.textContent).toContain('203.0.113.x');
    expect(container.textContent).not.toContain('203.0.113.42');
  });

  it('hides revoke and report actions when the backend does not support them', async () => {
    respond();
    render(<SignInActivity />);
    await screen.findAllByTestId('activity-event');

    expect(screen.queryByRole('button', { name: /Sign out session/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /wasn't me/ })).not.toBeInTheDocument();
  });

  it('revokes another session, but never offers it for the current one', async () => {
    respond({ revokeSession: true });
    api.revokeSession.mockResolvedValue(undefined);
    render(<SignInActivity />);
    const rows = await screen.findAllByTestId('activity-event');

    expect(within(rows[0]).queryByRole('button', { name: /Sign out session/ })).not.toBeInTheDocument();
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Sign out session' }));

    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith('s-other'));
    expect(await within(rows[1]).findByRole('button', { name: 'Signed out' })).toBeDisabled();
  });

  it('reports unfamiliar activity', async () => {
    respond({ reportEvent: true });
    api.reportSignInEvent.mockResolvedValue(undefined);
    render(<SignInActivity />);
    const rows = await screen.findAllByTestId('activity-event');

    fireEvent.click(within(rows[2]).getByRole('button', { name: "This wasn't me" }));

    await waitFor(() => expect(api.reportSignInEvent).toHaveBeenCalledWith('e3'));
    expect(await screen.findByText(/We'll review this activity/)).toBeInTheDocument();
  });

  it('explains when activity is not available', async () => {
    api.getSignInActivity.mockRejectedValue({ response: { status: 404 } });
    render(<SignInActivity />);
    expect(await screen.findByText(/isn't available for your account yet/)).toBeInTheDocument();
  });

  it('offers a retry after a failure', async () => {
    api.getSignInActivity.mockRejectedValueOnce({ response: { status: 500 } });
    respond();
    render(<SignInActivity />);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findAllByTestId('activity-event')).toHaveLength(3);
  });
});
