import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentCapabilitiesResult } from '@/types/agent';

const { dispatch, api } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  api: { getAgentStatus: vi.fn(), getAgentCapabilities: vi.fn() },
}));

vi.mock('@/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({ chat: { agentStatus: { isConnected: true, lastHealthCheck: null, capabilities: null } } }),
}));
vi.mock('@/services/api', () => ({ default: api }));

import AgentStatus, { capabilityNotice } from './AgentStatus';
import { LOCAL_CAPABILITIES } from '@/services/agentService';

const status = {
  isOnline: true,
  version: '1.0.0',
  uptime: 0,
  lastActivity: '2026-10-21T10:00:00Z',
  activeConnections: 1,
  services: {},
};

const result = (overrides: Partial<AgentCapabilitiesResult>): AgentCapabilitiesResult => ({
  availability: 'available',
  source: 'backend',
  capabilities: { ...LOCAL_CAPABILITIES, features: { ...LOCAL_CAPABILITIES.features, swapping: true } },
  fetchedAt: new Date().toISOString(),
  ...overrides,
});

describe('AgentStatus capability states (#270)', () => {
  beforeEach(() => {
    dispatch.mockReset();
    api.getAgentStatus.mockReset().mockResolvedValue(status);
    api.getAgentCapabilities.mockReset();
  });

  it('shows backend capabilities as enabled with their source', async () => {
    api.getAgentCapabilities.mockResolvedValue(result({}));
    render(<AgentStatus showDetails />);

    const section = await screen.findByTestId('agent-capabilities');
    expect(section).toHaveAttribute('data-availability', 'available');
    expect(within(section).getByText(/Reported by agent/)).toBeInTheDocument();
    expect(within(section).getByText('swapping')).toHaveAttribute('aria-disabled', 'false');
    expect(within(section).queryByRole('note')).not.toBeInTheDocument();
  });

  it('marks unsupported capabilities as unconfirmed defaults and disables them', async () => {
    api.getAgentCapabilities.mockResolvedValue(result({ availability: 'unsupported', source: 'local_fallback' }));
    render(<AgentStatus showDetails />);

    const section = await screen.findByTestId('agent-capabilities');
    expect(within(section).getByText(/App defaults \(not confirmed\)/)).toBeInTheDocument();
    expect(within(section).getByRole('note')).toHaveTextContent("doesn't report its capabilities");
    expect(within(section).getByText('swapping')).toHaveAttribute('aria-disabled', 'true');
  });

  it('explains when capabilities are unavailable and shows no actions', async () => {
    api.getAgentCapabilities.mockResolvedValue(result({ availability: 'unavailable', source: 'none', capabilities: null, error: 'network' }));
    render(<AgentStatus showDetails />);

    const section = await screen.findByTestId('agent-capabilities');
    expect(within(section).getByRole('note')).toHaveTextContent("couldn't be reached");
    expect(within(section).queryByText('swapping')).not.toBeInTheDocument();
    expect(within(section).getByText('No capabilities to show.')).toBeInTheDocument();
  });

  it('notes stale data', () => {
    const now = Date.parse('2026-10-21T10:00:00Z');
    expect(capabilityNotice(result({ fetchedAt: '2026-10-21T09:00:00Z' }), now)).toMatch(/out of date/);
    expect(capabilityNotice(result({ fetchedAt: '2026-10-21T09:59:00Z' }), now)).toBeNull();
  });
});
