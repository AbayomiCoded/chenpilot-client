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

import agentService, {
  summarizeAgentQuery,
  summarizeAgentResponse,
  describeAgentError,
  redactAgentUrl,
} from '../agentService';
import { logger } from '@/utils/logger';

const PRIVATE_PROMPT = 'Send 500 XLM from my wallet GABC...XYZ to my landlord';
const PRIVATE_REPLY = 'Your balance is 12,345 XLM across 3 accounts';

function loggedText(spy: ReturnType<typeof vi.spyOn>): string {
  return JSON.stringify(spy.mock.calls);
}

describe('AgentService log redaction (#273)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.NEXT_PUBLIC_LOG_AGENT_CONTENT;
    mockInstance.post.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('summary helpers', () => {
    it('summarizes a query without the prompt text or raw user id', () => {
      const summary = summarizeAgentQuery({ userId: 'user-42', query: PRIVATE_PROMPT }, 'agent_query_1_abc');

      expect(summary.correlationId).toBe('agent_query_1_abc');
      expect(summary.queryLength).toBe(PRIVATE_PROMPT.length);
      expect(summary.queryHash).toMatch(/^hash_[0-9a-f]{8}$/);
      expect(summary.userHash).toMatch(/^hash_[0-9a-f]{8}$/);
      expect(JSON.stringify(summary)).not.toContain(PRIVATE_PROMPT);
      expect(JSON.stringify(summary)).not.toContain('user-42');
    });

    it('summarizes a response without the payload', () => {
      const data = { result: { success: true, data: PRIVATE_REPLY } };
      const summary = summarizeAgentResponse('agent_query_1_abc', 200, data, Date.now());

      expect(summary).toMatchObject({ correlationId: 'agent_query_1_abc', status: 200, success: true });
      expect(summary.responseHash).toMatch(/^hash_[0-9a-f]{8}$/);
      expect(JSON.stringify(summary)).not.toContain(PRIVATE_REPLY);
    });

    it('strips request and response bodies from axios errors', () => {
      const error = {
        message: 'Request failed with status code 500',
        code: 'ERR_BAD_RESPONSE',
        config: { method: 'post', url: '/query', data: JSON.stringify({ query: PRIVATE_PROMPT }) },
        response: { status: 500, data: { echo: PRIVATE_PROMPT } },
      };
      const described = describeAgentError(error);

      expect(described).toEqual({
        message: 'Request failed with status code 500',
        code: 'ERR_BAD_RESPONSE',
        status: 500,
        method: 'POST',
        url: '/query',
      });
      expect(JSON.stringify(described)).not.toContain(PRIVATE_PROMPT);
    });

    it('masks user ids in memory urls', () => {
      expect(redactAgentUrl('/memory/user-42')).toBe('/memory/[user]');
      expect(redactAgentUrl('/tools')).toBe('/tools');
      expect(redactAgentUrl(undefined)).toBeUndefined();
    });
  });

  describe('queryAgent', () => {
    it('logs correlation metadata but not prompt or response content by default', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      mockInstance.post.mockResolvedValue({ status: 200, data: { result: { success: true, data: PRIVATE_REPLY } } });

      await agentService.queryAgent({ userId: 'user-42', query: PRIVATE_PROMPT });

      const text = loggedText(debugSpy);
      expect(text).not.toContain(PRIVATE_PROMPT);
      expect(text).not.toContain(PRIVATE_REPLY);
      expect(text).toMatch(/agent_query_\d+_[a-z0-9]+/);

      const [, sent] = debugSpy.mock.calls.find(([msg]) => msg === '[AgentService] Sending query:')!;
      const [, received] = debugSpy.mock.calls.find(([msg]) => msg === '[AgentService] Query response:')!;
      expect((sent as { correlationId: string }).correlationId).toBe(
        (received as { correlationId: string }).correlationId
      );
    });

    it('does not leak the prompt when the request fails', async () => {
      const errorSpy = vi.spyOn(logger, 'error');
      mockInstance.post.mockRejectedValue({
        message: 'timeout of 30000ms exceeded',
        config: { method: 'post', url: '/query', data: JSON.stringify({ query: PRIVATE_PROMPT }) },
      });

      const result = await agentService.queryAgent({ userId: 'user-42', query: PRIVATE_PROMPT });

      expect(result.result.success).toBe(false);
      const text = loggedText(errorSpy);
      expect(text).toContain('correlationId');
      expect(text).not.toContain(PRIVATE_PROMPT);
    });

    it('logs content only when explicitly opted in outside production', async () => {
      process.env.NEXT_PUBLIC_LOG_AGENT_CONTENT = 'true';
      const debugSpy = vi.spyOn(logger, 'debug');
      mockInstance.post.mockResolvedValue({ status: 200, data: { result: { success: true, data: PRIVATE_REPLY } } });

      await agentService.queryAgent({ userId: 'user-42', query: PRIVATE_PROMPT });

      expect(debugSpy).toHaveBeenCalledWith(
        '[AgentService] Query content:',
        expect.objectContaining({ query: PRIVATE_PROMPT })
      );
    });
  });
});
