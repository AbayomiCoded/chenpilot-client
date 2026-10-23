import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockInstance } = vi.hoisted(() => ({
  mockInstance: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

vi.mock('axios', () => ({
  default: { create: vi.fn(() => mockInstance) },
  create: vi.fn(() => mockInstance),
}));

import agentService, { classifyAgentError, isStateChangingQuery } from '../agentService';

const axiosTimeout = () => ({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' });

describe('AgentService timeout handling (#274)', () => {
  beforeEach(() => {
    mockInstance.post.mockReset();
    mockInstance.get.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('classifyAgentError', () => {
    it('separates timeouts from connectivity failures', () => {
      expect(classifyAgentError(axiosTimeout())).toBe('timeout');
      expect(classifyAgentError({ code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' })).toBe('timeout');
      expect(classifyAgentError({ message: 'Request failed', response: { status: 504 } })).toBe('timeout');
      expect(classifyAgentError({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe('network');
      expect(classifyAgentError({ message: 'Request failed', response: { status: 500 } })).toBe('server');
      expect(classifyAgentError({ response: { status: 400, data: { message: 'invalid query' } } })).toBe('invalid_query');
      expect(classifyAgentError(new Error('boom'))).toBe('unknown');
    });
  });

  describe('isStateChangingQuery', () => {
    it('flags actions that change state and leaves reads alone', () => {
      expect(isStateChangingQuery('Send 50 XLM to GABC')).toBe(true);
      expect(isStateChangingQuery('swap 10 XLM for USDC')).toBe(true);
      expect(isStateChangingQuery('add liquidity to the XLM/USDC pool')).toBe(true);
      expect(isStateChangingQuery('What is my XLM balance?')).toBe(false);
      expect(isStateChangingQuery('show me the current APY on Blend')).toBe(false);
    });
  });

  describe('queryAgent', () => {
    it('sends a client request id with the query', async () => {
      mockInstance.post.mockResolvedValue({ status: 200, data: { result: { success: true, data: 'ok' } } });

      const result = await agentService.queryAgent({ userId: 'u1', query: 'balance?', clientRequestId: 'req_1' });

      expect(mockInstance.post).toHaveBeenCalledWith('/query', expect.objectContaining({ clientRequestId: 'req_1' }), expect.anything());
      expect(result.result.requestId).toBe('req_1');
    });

    it('reports a timeout on a state-changing action as possibly still running', async () => {
      mockInstance.post.mockRejectedValue(axiosTimeout());

      const result = await agentService.queryAgent({ userId: 'u1', query: 'Send 50 XLM to GABC' });

      expect(result.result.success).toBe(false);
      expect(result.result.errorKind).toBe('timeout');
      expect(result.result.stateChanging).toBe(true);
      expect(result.result.requestId).toMatch(/^agent_query_\d+_[a-z0-9]+$/);
      expect(result.result.data).toContain('may still be running');
      expect(result.result.data).not.toContain('internet connection');
    });

    it('reports a timeout on a read-only query as safe to retry', async () => {
      mockInstance.post.mockRejectedValue(axiosTimeout());

      const result = await agentService.queryAgent({ userId: 'u1', query: 'What is my balance?' });

      expect(result.result.errorKind).toBe('timeout');
      expect(result.result.stateChanging).toBe(false);
      expect(result.result.data).toContain('Please try again');
    });

    it('reports network failures as network, not timeout', async () => {
      mockInstance.post.mockRejectedValue({ code: 'ERR_NETWORK', message: 'Network Error' });

      const result = await agentService.queryAgent({ userId: 'u1', query: 'Send 50 XLM to GABC' });

      expect(result.result.errorKind).toBe('network');
      expect(result.result.data).toContain('internet connection');
    });
  });

  describe('getActionStatus', () => {
    it('returns the late result when the action completed after the client timed out', async () => {
      mockInstance.post.mockRejectedValue(axiosTimeout());
      const timedOut = await agentService.queryAgent({ userId: 'u1', query: 'swap 10 XLM for USDC' });
      const requestId = timedOut.result.requestId!;

      mockInstance.get.mockResolvedValue({
        status: 200,
        data: { status: 'completed', result: { success: true, data: 'Swapped 10 XLM for 1.2 USDC', transactionHash: 'abc123' } },
      });

      const status = await agentService.getActionStatus(requestId);

      expect(mockInstance.get).toHaveBeenCalledWith(`/query/${requestId}/status`, expect.any(Object));
      expect(status.status).toBe('completed');
      expect(status.result).toMatchObject({ success: true, transactionHash: 'abc123', requestId });
    });

    it('reports pending while the action is still running', async () => {
      mockInstance.get.mockResolvedValue({ status: 200, data: { status: 'pending' } });

      const status = await agentService.getActionStatus('req_2');

      expect(status).toMatchObject({ requestId: 'req_2', status: 'pending' });
      expect(status.result).toBeUndefined();
    });

    it('reports failed with the backend error', async () => {
      mockInstance.get.mockResolvedValue({
        status: 200,
        data: { status: 'failed', result: { success: false, data: 'Insufficient balance', error: 'insufficient_funds' } },
      });

      const status = await agentService.getActionStatus('req_3');

      expect(status.status).toBe('failed');
      expect(status.result?.error).toBe('insufficient_funds');
    });

    it('resolves unknown when the backend does not support status checks', async () => {
      mockInstance.get.mockRejectedValue({ message: 'Request failed with status code 404', response: { status: 404 } });
      await expect(agentService.getActionStatus('req_4')).resolves.toMatchObject({ status: 'unknown' });

      mockInstance.get.mockResolvedValue({ status: 200, data: '<html>' });
      await expect(agentService.getActionStatus('req_4')).resolves.toMatchObject({ status: 'unknown' });
    });

    it('url-encodes the request id', async () => {
      mockInstance.get.mockResolvedValue({ status: 200, data: { status: 'pending' } });
      await agentService.getActionStatus('a/b');
      expect(mockInstance.get).toHaveBeenCalledWith('/query/a%2Fb/status', expect.any(Object));
    });
  });
});
