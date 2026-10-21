import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import agentService, { LOCAL_CAPABILITIES, isCapabilitiesStale, parseCapabilities } from '../agentService';

const backendBody = {
  supportedActions: ['swap', 'check_balance'],
  supportedAssets: ['XLM', 'USDC'],
  supportedProtocols: ['Soroswap'],
  features: { swapping: true, lending: false },
  limits: { maxQueryLength: 500 },
  updatedAt: '2026-10-21T09:00:00Z',
};

describe('AgentService.getCapabilities (#270)', () => {
  beforeEach(() => {
    mockInstance.get.mockReset();
  });

  it('marks backend-reported capabilities as available with source and freshness', async () => {
    mockInstance.get.mockResolvedValue({ status: 200, data: backendBody });

    const result = await agentService.getCapabilities();

    expect(mockInstance.get).toHaveBeenCalledWith('/capabilities', expect.any(Object));
    expect(result).toMatchObject({ availability: 'available', source: 'backend', updatedAt: '2026-10-21T09:00:00Z' });
    expect(result.capabilities?.supportedActions).toEqual(['swap', 'check_balance']);
    expect(result.capabilities?.features.lending).toBe(false);
    expect(Date.parse(result.fetchedAt)).not.toBeNaN();
  });

  it.each([404, 405, 501])('treats HTTP %s as unsupported and falls back to the local list, marked as such', async (status) => {
    mockInstance.get.mockRejectedValue({ message: 'x', response: { status } });

    const result = await agentService.getCapabilities();

    expect(result).toMatchObject({ availability: 'unsupported', source: 'local_fallback' });
    expect(result.capabilities).toBe(LOCAL_CAPABILITIES);
  });

  it.each([
    ['network failure', { code: 'ERR_NETWORK', message: 'Network Error' }, 'network'],
    ['server error', { message: 'x', response: { status: 503 } }, 'http_503'],
  ])('reports a %s as unavailable with no capabilities', async (_label, error, code) => {
    mockInstance.get.mockRejectedValue(error);

    const result = await agentService.getCapabilities();

    expect(result).toMatchObject({ availability: 'unavailable', source: 'none', capabilities: null, error: code });
  });

  it('treats a malformed body as unavailable rather than guessing', async () => {
    mockInstance.get.mockResolvedValue({ status: 200, data: { supportedActions: 'all' } });
    await expect(agentService.getCapabilities()).resolves.toMatchObject({
      availability: 'unavailable',
      error: 'invalid_response',
    });
  });
});

describe('capability helpers (#270)', () => {
  it('rejects bodies without the required string arrays', () => {
    expect(parseCapabilities(null)).toBeNull();
    expect(parseCapabilities({ supportedActions: [], supportedAssets: [] })).toBeNull();
    expect(parseCapabilities({ ...backendBody, supportedAssets: [1] })).toBeNull();
  });

  it('detects stale data', () => {
    const now = Date.parse('2026-10-21T10:00:00Z');
    expect(isCapabilitiesStale({ fetchedAt: '2026-10-21T09:58:00Z' }, now)).toBe(false);
    expect(isCapabilitiesStale({ fetchedAt: '2026-10-21T09:50:00Z' }, now)).toBe(true);
  });
});
