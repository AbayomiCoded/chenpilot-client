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

describe('AgentService.getMemory (#267)', () => {
  beforeEach(() => {
    mockInstance.get.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns saved memory entries', async () => {
    mockInstance.get.mockResolvedValue({ status: 200, data: ['prefers USDC', 'risk: low'] });
    await expect(agentService.getMemory('u1')).resolves.toEqual({ ok: true, entries: ['prefers USDC', 'risk: low'] });
    expect(mockInstance.get).toHaveBeenCalledWith('/memory/u1');
  });

  it('treats a real empty list as a successful answer', async () => {
    mockInstance.get.mockResolvedValue({ status: 200, data: [] });
    await expect(agentService.getMemory('u1')).resolves.toEqual({ ok: true, entries: [] });
  });

  it.each([
    ['network failure', { code: 'ERR_NETWORK', message: 'Network Error' }, 'unavailable'],
    ['server error', { message: 'x', response: { status: 503 } }, 'unavailable'],
    ['unauthorized', { message: 'x', response: { status: 401 } }, 'unauthorized'],
    ['forbidden', { message: 'x', response: { status: 403 } }, 'unauthorized'],
    ['missing endpoint or user', { message: 'x', response: { status: 404 } }, 'not_found'],
  ])('reports %s as an error, not an empty memory', async (_label, error, kind) => {
    mockInstance.get.mockRejectedValue(error);

    const result = await agentService.getMemory('u1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe(kind);
  });

  it.each([
    ['an object', { entries: ['x'] }],
    ['non-string entries', ['ok', 42]],
    ['an HTML page', '<html></html>'],
  ])('rejects %s as an invalid response', async (_label, body) => {
    mockInstance.get.mockResolvedValue({ status: 200, data: body });
    await expect(agentService.getMemory('u1')).resolves.toMatchObject({ ok: false, error: { kind: 'invalid_response' } });
  });

  it('encodes the user id in the path', async () => {
    mockInstance.get.mockResolvedValue({ status: 200, data: [] });
    await agentService.getMemory('a/b');
    expect(mockInstance.get).toHaveBeenCalledWith('/memory/a%2Fb');
  });
});
