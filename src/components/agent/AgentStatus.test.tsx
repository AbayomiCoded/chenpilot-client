import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentCapabilitiesResult, AgentStatus as AgentStatusType } from '@/types/agent';

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

import AgentStatus, { capabilityNotice, formatUptime } from './AgentStatus';
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


const unavailable: AgentStatusType = {
  isOnline: true,
  source: 'unavailable',
  version: null,
  uptime: null,
  lastActivity: null,
  activeConnections: null,
  services: {},
  health: {
    status: 'healthy',
    timestamp: '2026-10-21T10:00:00Z',
    probe: 'connectivity',
    healthEndpointSupported: false,
    responseTimeMs: 37,
    services: { agent: { status: 'up', responseTime: 37 } },
  },
};

describe('AgentStatus dashboard (#271)', () => {
  beforeEach(() => {
    dispatch.mockReset();
    api.getAgentStatus.mockReset();
    api.getAgentCapabilities.mockReset().mockResolvedValue(null);
  });

  it('shows unknown metrics as unavailable instead of fabricated values', async () => {
    api.getAgentStatus.mockResolvedValue(unavailable);
    render(<AgentStatus showDetails />);

    const metrics = await screen.findByTestId('agent-metrics');
    expect(metrics).toHaveTextContent('Version: Unavailable');
    expect(metrics).toHaveTextContent('Uptime: Unavailable');
    expect(metrics).toHaveTextContent('Connections: Unavailable');
    expect(screen.getByText(/Protocol health is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/soroswap/i)).not.toBeInTheDocument();
  });

  it('labels a connectivity-only probe and shows its measured response time', async () => {
    api.getAgentStatus.mockResolvedValue(unavailable);
    render(<AgentStatus showDetails />);

    expect(await screen.findByTestId('agent-health')).toHaveTextContent('Response time: 37 ms (connectivity check only)');
  });

  it('shows real service health, with unknown states marked unknown', async () => {
    api.getAgentStatus.mockResolvedValue({
      ...unavailable,
      source: 'backend',
      version: '2.3.0',
      uptime: 7200,
      activeConnections: 3,
      services: {
        soroswap: { isActive: true, isHealthy: true, lastCheck: null },
        blend: { isActive: null, isHealthy: null, lastCheck: null },
      },
    });
    render(<AgentStatus showDetails />);

    expect(await screen.findByTestId('agent-metrics')).toHaveTextContent('Version: 2.3.0 | Uptime: 2h | Connections: 3');
    expect(screen.getByLabelText('Healthy')).toBeInTheDocument();
    expect(screen.getByLabelText('Unknown')).toBeInTheDocument();
  });

  it('reports offline when the health probe says so, even though capabilities load', async () => {
    api.getAgentStatus.mockResolvedValue({ ...unavailable, isOnline: false, health: null });
    api.getAgentCapabilities.mockResolvedValue({ features: {} });
    render(<AgentStatus />);

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ isConnected: false }) })),
    );
  });

  it('formats uptime', () => {
    expect(formatUptime(null)).toBe('Unavailable');
    expect(formatUptime(1800)).toBe('30m');
    expect(formatUptime(7200)).toBe('2h');
  });
});
