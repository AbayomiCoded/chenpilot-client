import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentStatus as AgentStatusType } from '@/types/agent';

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

import AgentStatus, { formatUptime } from './AgentStatus';

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
