import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import agentService from '../agentService';
import { mockAxios, resetAxiosMocks } from '@/test/mocks/axios';

vi.mock('axios', () => mockAxios);

describe('AgentService', () => {
  beforeEach(() => {
    resetAxiosMocks();
  });

  afterEach(() => {
    resetAxiosMocks();
  });

  describe('healthCheck', () => {
    it('returns healthy status when request succeeds', async () => {
      mockAxios.create.mockReturnValue({
        request: vi.fn().mockResolvedValue({ status: 200 }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      const result = await agentService.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.services.agent.status).toBe('up');
    });

    it('returns unhealthy status when request fails', async () => {
      mockAxios.create.mockReturnValue({
        request: vi.fn().mockRejectedValue(new Error('Network error')),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      const result = await agentService.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.services.agent.status).toBe('down');
    });
  });

  describe('queryAgent', () => {
    it('sends query request and returns response', async () => {
      const mockResponse = {
        result: {
          success: true,
          data: 'Mock response data',
          error: null,
        },
      };

      mockAxios.create.mockReturnValue({
        post: vi.fn().mockResolvedValue({ data: mockResponse }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      const result = await agentService.queryAgent({ query: 'test query' });

      expect(result.result.success).toBe(true);
      expect(result.result.data).toBe('Mock response data');
    });

    it('handles network errors gracefully', async () => {
      mockAxios.create.mockReturnValue({
        post: vi.fn().mockRejectedValue(new Error('Network error')),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      const result = await agentService.queryAgent({ query: 'test query' });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBeDefined();
    });

    it('provides user-friendly error messages', async () => {
      mockAxios.create.mockReturnValue({
        post: vi.fn().mockRejectedValue({
          response: { data: { message: 'invalid query' } },
        }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      const result = await agentService.queryAgent({ query: 'test query' });

      expect(result.result.success).toBe(false);
      expect(result.result.data).toContain("didn't understand");
    });
  });

  describe('getMemory', () => {
    it('returns memory entries for user', async () => {
      const mockMemory = ['memory1', 'memory2'];

      mockAxios.create.mockReturnValue({
        get: vi.fn().mockResolvedValue({ data: mockMemory }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      const result = await agentService.getMemory('user123');

      expect(result).toEqual(mockMemory);
    });

    it('returns empty array on error', async () => {
      mockAxios.create.mockReturnValue({
        get: vi.fn().mockRejectedValue(new Error('Error')),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      const result = await agentService.getMemory('user123');

      expect(result).toEqual([]);
    });
  });

  describe('clearMemory', () => {
    it('clears memory successfully', async () => {
      mockAxios.create.mockReturnValue({
        delete: vi.fn().mockResolvedValue({}),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      await expect(agentService.clearMemory('user123')).resolves.not.toThrow();
    });

    it('throws error on failure', async () => {
      mockAxios.create.mockReturnValue({
        delete: vi.fn().mockRejectedValue(new Error('Error')),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      await expect(agentService.clearMemory('user123')).rejects.toThrow(
        'Failed to clear agent memory'
      );
    });
  });

  describe('getTools', () => {
    it('returns list of tools', async () => {
      const mockTools = [
        { name: 'tool1', description: 'Tool 1' },
        { name: 'tool2', description: 'Tool 2' },
      ];

      mockAxios.create.mockReturnValue({
        get: vi.fn().mockResolvedValue({ data: mockTools }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      const result = await agentService.getTools();

      expect(result).toEqual(mockTools);
    });

    it('returns empty array on error', async () => {
      mockAxios.create.mockReturnValue({
        get: vi.fn().mockRejectedValue(new Error('Error')),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      const result = await agentService.getTools();

      expect(result).toEqual([]);
    });
  });

  describe('executeTool', () => {
    it('executes tool and returns result', async () => {
      const mockResult = { success: true, data: 'tool result' };

      mockAxios.create.mockReturnValue({
        post: vi.fn().mockResolvedValue({ data: mockResult }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      const result = await agentService.executeTool('tool1', { param: 'value' });

      expect(result).toEqual(mockResult);
    });

    it('throws error on failure', async () => {
      mockAxios.create.mockReturnValue({
        post: vi.fn().mockRejectedValue(new Error('Error')),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      await expect(
        agentService.executeTool('tool1', { param: 'value' })
      ).rejects.toThrow('Failed to execute tool: tool1');
    });
  });

  describe('initialize', () => {
    it('initializes service with health check', async () => {
      mockAxios.create.mockReturnValue({
        request: vi.fn().mockResolvedValue({ status: 200 }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      await expect(agentService.initialize()).resolves.not.toThrow();
    });

    it('handles initialization failure gracefully', async () => {
      mockAxios.create.mockReturnValue({
        request: vi.fn().mockRejectedValue(new Error('Error')),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      });

      await expect(agentService.initialize()).resolves.not.toThrow();
    });
  });
});
