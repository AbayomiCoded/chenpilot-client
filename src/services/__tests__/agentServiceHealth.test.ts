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

import agentService from '../agentService';

/** Each call to performance.now() returns the next value. */
const clock = (...values: number[]) => {
  const spy = vi.spyOn(performance, 'now');
  values.forEach((v) => spy.mockReturnValueOnce(v));
  return spy;
};

const httpError = (status: number, data?: unknown) => ({ message: `Request failed with status code ${status}`, response: { status, data } });

describe('AgentService.healthCheck (#272)', () => {
  beforeEach(() => {
    mockInstance.request.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses GET /health and measures the elapsed time', async () => {
    clock(1000, 1042.4);
    mockInstance.request.mockResolvedValue({ status: 200, data: { status: 'ok' } });

    const result = await agentService.healthCheck();

    expect(mockInstance.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', url: '/health' }));
    expect(result).toMatchObject({
      status: 'healthy',
      probe: 'health_endpoint',
      healthEndpointSupported: true,
      responseTimeMs: 42,
      services: { agent: { status: 'up', responseTime: 42 } },
    });
    expect(result.system).toBeUndefined();
    expect(agentService.isAgentConnected()).toBe(true);
  });

  it('reports degraded when the health endpoint says so', async () => {
    clock(0, 10);
    mockInstance.request.mockResolvedValue({ status: 200, data: { status: 'degraded' } });
    await expect(agentService.healthCheck()).resolves.toMatchObject({ status: 'degraded', responseTimeMs: 10 });
  });

  it('reads a 503 health body instead of treating it as a plain outage', async () => {
    clock(0, 15);
    mockInstance.request.mockRejectedValue(httpError(503, { status: 'degraded' }));
    await expect(agentService.healthCheck()).resolves.toMatchObject({ status: 'degraded', responseTimeMs: 15, probe: 'health_endpoint' });
  });

  it('falls back to a connectivity-only probe when /health is unsupported', async () => {
    clock(0, 5, 100, 130);
    mockInstance.request
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce({ status: 200, data: '' });

    const result = await agentService.healthCheck();

    expect(mockInstance.request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'HEAD', url: '/' }));
    expect(result).toMatchObject({
      status: 'healthy',
      probe: 'connectivity',
      healthEndpointSupported: false,
      responseTimeMs: 30,
    });
  });

  it('treats any non-5xx answer to the fallback as reachable', async () => {
    clock(0, 5, 0, 8);
    mockInstance.request.mockRejectedValueOnce(httpError(501)).mockRejectedValueOnce(httpError(401));
    await expect(agentService.healthCheck()).resolves.toMatchObject({ status: 'healthy', probe: 'connectivity', responseTimeMs: 8 });
  });

  it('distinguishes an unsupported endpoint from an outage', async () => {
    mockInstance.request.mockRejectedValueOnce(httpError(500));
    const outage = await agentService.healthCheck();
    expect(outage).toMatchObject({ status: 'unhealthy', reason: 'server_error', healthEndpointSupported: true, probe: 'health_endpoint' });
    expect(agentService.isAgentConnected()).toBe(false);

    mockInstance.request.mockRejectedValueOnce(httpError(404)).mockRejectedValueOnce({ code: 'ERR_NETWORK', message: 'Network Error' });
    const fallbackOutage = await agentService.healthCheck();
    expect(fallbackOutage).toMatchObject({ status: 'unhealthy', reason: 'network', healthEndpointSupported: false, probe: 'connectivity' });
  });

  it('reports no response time when nothing answered', async () => {
    mockInstance.request.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout of 5000ms exceeded' });

    const result = await agentService.healthCheck();

    expect(result).toMatchObject({ status: 'unhealthy', reason: 'timeout', responseTimeMs: null });
    expect(result.services.agent.responseTime).toBeUndefined();
  });
});
