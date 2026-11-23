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

import agentService, {
  classifyAgentError,
  decideRetry,
  isRetryableErrorKind,
  isStateChangingQuery,
} from '../agentService';

describe('agent retry eligibility (#262)', () => {
  beforeEach(() => {
    mockInstance.post.mockReset();
    mockInstance.get.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies failures', () => {
    expect(classifyAgentError({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' })).toBe('timeout');
    expect(classifyAgentError({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe('network');
    expect(classifyAgentError({ message: 'x', response: { status: 503 } })).toBe('server');
    expect(classifyAgentError({ message: 'x', response: { status: 429 } })).toBe('server');
    expect(classifyAgentError({ response: { status: 400, data: { message: 'invalid query' } } })).toBe('invalid_query');
    expect(classifyAgentError({ message: 'x', response: { status: 401 } })).toBe('unauthenticated');
    expect(classifyAgentError({ message: 'User not authenticated' })).toBe('unauthenticated');
    expect(classifyAgentError(new Error('boom'))).toBe('unknown');
  });

  it('offers retry only for transient failures', () => {
    expect(isRetryableErrorKind('timeout')).toBe(true);
    expect(isRetryableErrorKind('network')).toBe(true);
    expect(isRetryableErrorKind('server')).toBe(true);
    expect(isRetryableErrorKind('unknown')).toBe(true);
    expect(isRetryableErrorKind('invalid_query')).toBe(false);
    expect(isRetryableErrorKind('unauthenticated')).toBe(false);
    expect(isRetryableErrorKind(undefined)).toBe(false);
  });

  it('detects state-changing prompts', () => {
    expect(isStateChangingQuery('send 20 XLM to GABC')).toBe(true);
    expect(isStateChangingQuery('Remove liquidity from the pool')).toBe(true);
    expect(isStateChangingQuery('what is my balance')).toBe(false);
  });

  it.each([
    [false, null, 'retry'],
    [true, { requestId: 'r', status: 'completed' }, 'completed'],
    [true, { requestId: 'r', status: 'pending' }, 'pending'],
    [true, { requestId: 'r', status: 'failed' }, 'retry'],
    [true, { requestId: 'r', status: 'not_found' }, 'retry'],
    [true, { requestId: 'r', status: 'unknown' }, 'confirm'],
    [true, null, 'confirm'],
  ] as const)('decideRetry(stateChanging=%s, %j) → %s', (stateChanging, status, action) => {
    expect(decideRetry(stateChanging, status as never).action).toBe(action);
  });

  it('sends the client request id and returns it with retry metadata on failure', async () => {
    mockInstance.post.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' });

    const result = await agentService.queryAgent({ userId: 'u1', query: 'swap 5 XLM', clientRequestId: 'req_1' });

    expect(mockInstance.post).toHaveBeenCalledWith('/query', expect.objectContaining({ clientRequestId: 'req_1' }), expect.anything());
    expect(result.result).toMatchObject({ success: false, errorKind: 'timeout', requestId: 'req_1' });
  });

  it('reads operation status from the backend', async () => {
    mockInstance.get.mockResolvedValue({
      data: { status: 'completed', result: { success: true, data: 'Swapped', transactionHash: 'tx1' } },
    });

    const status = await agentService.getOperationStatus('req 1');

    expect(mockInstance.get).toHaveBeenCalledWith('/query/req%201/status', expect.any(Object));
    expect(status).toMatchObject({ status: 'completed', result: { transactionHash: 'tx1' } });
  });

  it('resolves unknown when status cannot be determined', async () => {
    mockInstance.get.mockRejectedValueOnce({ message: 'Not Found', response: { status: 404 } });
    await expect(agentService.getOperationStatus('r')).resolves.toMatchObject({ status: 'unknown' });

    mockInstance.get.mockResolvedValueOnce({ data: '<html>' });
    await expect(agentService.getOperationStatus('r')).resolves.toMatchObject({ status: 'unknown' });
  });

  it('checks status before retrying state-changing prompts only', async () => {
    await expect(agentService.checkBeforeRetry('r', false)).resolves.toEqual({ action: 'retry' });
    expect(mockInstance.get).not.toHaveBeenCalled();

    mockInstance.get.mockResolvedValue({ data: { status: 'pending' } });
    await expect(agentService.checkBeforeRetry('r', true)).resolves.toEqual({ action: 'pending' });
    expect(mockInstance.get).toHaveBeenCalledTimes(1);
  });
});
