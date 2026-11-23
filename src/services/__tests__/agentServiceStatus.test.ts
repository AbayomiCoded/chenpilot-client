import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockInstance } = vi.hoisted(() => ({
  mockInstance: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock('axios', () => ({
  default: { create: vi.fn(() => mockInstance) },
  create: vi.fn(() => mockInstance),
}));

import agentService, { parseStatusMetrics } from '../agentService';

const notFound = { message: 'Request failed with status code 404', response: { status: 404 } };

describe('AgentService.getStatus (#271)', () => {
  beforeEach(() => {
    mockInstance.get.mockReset();
    mockInstance.request.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports every metric as unavailable when the backend has no /status', async () => {
    mockInstance.request.mockResolvedValue({ status: 200, data: { status: 'ok' } });
    mockInstance.get.mockRejectedValue(notFound);

    const status = await agentService.getStatus();

    expect(status).toMatchObject({
      isOnline: true,
      source: 'unavailable',
      version: null,
      uptime: null,
      lastActivity: null,
      activeConnections: null,
      services: {},
    });
    expect(JSON.stringify(status)).not.toContain('1.0.0');
  });

  it('never claims protocol health it did not receive', async () => {
    mockInstance.request.mockResolvedValue({ status: 200, data: { status: 'ok' } });
    mockInstance.get.mockRejectedValue({ code: 'ERR_NETWORK', message: 'Network Error' });

    const status = await agentService.getStatus();

    expect(Object.keys(status.services)).toEqual([]);
  });

  it('takes online state from the health probe, not from status metrics', async () => {
    mockInstance.request.mockRejectedValue({ code: 'ERR_NETWORK', message: 'Network Error' });
    mockInstance.get.mockResolvedValue({ data: { version: '2.3.0', uptimeSeconds: 7200 } });

    const status = await agentService.getStatus();

    expect(status.isOnline).toBe(false);
    expect(status.health?.status).toBe('unhealthy');
    expect(status.version).toBe('2.3.0');
  });

  it('uses backend metrics and service health when /status provides them', async () => {
    mockInstance.request.mockResolvedValue({ status: 200, data: { status: 'ok' } });
    mockInstance.get.mockResolvedValue({
      data: {
        version: '2.3.0',
        uptimeSeconds: 5400,
        activeConnections: 12,
        lastActivity: '2026-10-21T10:00:00Z',
        services: {
          soroswap: { isActive: true, isHealthy: true, lastCheck: '2026-10-21T09:59:00Z' },
          blend: { isActive: true, isHealthy: false, lastCheck: '2026-10-21T09:59:00Z', error: 'RPC timeout' },
        },
      },
    });

    const status = await agentService.getStatus();

    expect(mockInstance.get).toHaveBeenCalledWith('/status', expect.any(Object));
    expect(status).toMatchObject({
      source: 'backend',
      version: '2.3.0',
      uptime: 5400,
      activeConnections: 12,
      services: {
        soroswap: { isHealthy: true },
        blend: { isHealthy: false, error: 'RPC timeout' },
      },
    });
  });
});

describe('parseStatusMetrics (#271)', () => {
  it('keeps invalid or missing fields unavailable instead of guessing', () => {
    expect(
      parseStatusMetrics({
        version: 3,
        uptime: -5,
        activeConnections: 'many',
        services: { phoenix: { isHealthy: 'yes' }, junk: null },
      }),
    ).toEqual({
      source: 'backend',
      version: null,
      uptime: null,
      lastActivity: null,
      activeConnections: null,
      services: { phoenix: { isActive: null, isHealthy: null, lastCheck: null } },
    });
  });

  it('rejects non-object bodies', () => {
    expect(parseStatusMetrics('ok')).toBeNull();
    expect(parseStatusMetrics([])).toBeNull();
    expect(parseStatusMetrics(null)).toBeNull();
  });
});
