// @vitest-environment node
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

vi.mock('@/config/agent', () => ({
  default: { baseURL: 'http://agent.test', timeout: 30000, enableLogging: false, enableStreaming: true },
  agentConfig: { baseURL: 'http://agent.test', timeout: 30000, enableLogging: false, enableStreaming: true },
}));

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Fake fetch Response whose body yields the given chunks; `hold` keeps the stream open. */
function streamResponse(chunks: string[], opts: { status?: number; contentType?: string; hold?: boolean } = {}) {
  const encoder = new TextEncoder();
  const queue = [...chunks];
  const reader = {
    read: vi.fn(async () => {
      if (queue.length) return { done: false, value: encoder.encode(queue.shift()!) };
      if (opts.hold) return new Promise(() => {});
      return { done: true, value: undefined };
    }),
    cancel: vi.fn(async () => undefined),
  };
  const status = opts.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? opts.contentType ?? 'text/event-stream' : null) },
    body: { getReader: () => reader },
    reader,
  };
}

async function freshService() {
  vi.resetModules();
  return (await import('../agentService')).default;
}

describe('AgentService streaming (#261)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    mockInstance.post.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports partial text as it arrives and resolves with the final result', async () => {
    const service = await freshService();
    fetchMock.mockResolvedValue(streamResponse([
      sse('delta', { seq: 0, text: 'Checking ' }),
      sse('delta', { seq: 1, text: 'your bal' }).slice(0, 20),
      sse('delta', { seq: 1, text: 'your bal' }).slice(20),
      sse('delta', { seq: 2, text: 'ance…' }),
      sse('final', { result: { success: true, data: 'Your balance is 100 XLM' } }),
    ]));
    const onDelta = vi.fn();

    const response = await service.queryAgentStreaming({ userId: 'u1', query: 'balance?' }, { onDelta });

    expect(fetchMock).toHaveBeenCalledWith('http://agent.test/query/stream', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Accept: 'text/event-stream' }),
    }));
    expect(onDelta.mock.calls.map(([t]) => t)).toEqual(['Checking ', 'Checking your bal', 'Checking your balance…']);
    expect(response.result).toEqual({ success: true, data: 'Your balance is 100 XLM' });
    expect(mockInstance.post).not.toHaveBeenCalled();
  });

  it('ignores duplicated delta events', async () => {
    const service = await freshService();
    fetchMock.mockResolvedValue(streamResponse([
      sse('delta', { seq: 0, text: 'A' }),
      sse('delta', { seq: 0, text: 'A' }),
      sse('delta', { seq: 1, text: 'B' }),
      sse('final', { result: { success: true, data: 'AB' } }),
    ]));
    const onDelta = vi.fn();

    await service.queryAgentStreaming({ userId: 'u1', query: 'q' }, { onDelta });

    expect(onDelta.mock.calls.map(([t]) => t)).toEqual(['A', 'AB']);
  });

  it('falls back to POST /query when the backend has no streaming endpoint, and remembers it', async () => {
    const service = await freshService();
    fetchMock.mockResolvedValue(streamResponse([], { status: 404, contentType: 'application/json' }));
    mockInstance.post.mockResolvedValue({ status: 200, data: { result: { success: true, data: 'ok' } } });

    const first = await service.queryAgentStreaming({ userId: 'u1', query: 'q' });
    const second = await service.queryAgentStreaming({ userId: 'u1', query: 'q' });

    expect(first.result.data).toBe('ok');
    expect(second.result.data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockInstance.post).toHaveBeenCalledTimes(2);
  });

  it('treats a non-SSE success response as unsupported', async () => {
    const service = await freshService();
    fetchMock.mockResolvedValue(streamResponse([], { contentType: 'application/json' }));
    mockInstance.post.mockResolvedValue({ status: 200, data: { result: { success: true, data: 'ok' } } });

    await service.queryAgentStreaming({ userId: 'u1', query: 'q' });

    expect(mockInstance.post).toHaveBeenCalledTimes(1);
  });

  it('returns the backend error event as a failed result', async () => {
    const service = await freshService();
    fetchMock.mockResolvedValue(streamResponse([sse('delta', { seq: 0, text: 'Work' }), sse('error', { message: 'tool crashed' })]));

    const response = await service.queryAgentStreaming({ userId: 'u1', query: 'q' }, { onDelta: vi.fn() });

    expect(response.result.success).toBe(false);
    expect(response.result.error).toBe('tool crashed');
  });

  it('does not treat partial text as final when the stream ends early', async () => {
    const service = await freshService();
    fetchMock.mockResolvedValue(streamResponse([sse('delta', { seq: 0, text: 'Half an ans' })]));

    const response = await service.queryAgentStreaming({ userId: 'u1', query: 'q' });

    expect(response.result).toMatchObject({ success: false, error: 'stream_incomplete' });
    expect(mockInstance.post).not.toHaveBeenCalled();
  });

  it('rejects with AbortError and stops reading when the signal is aborted', async () => {
    const service = await freshService();
    const controller = new AbortController();
    const res = streamResponse([sse('delta', { seq: 0, text: 'Partial' })], { hold: true });
    fetchMock.mockResolvedValue(res);
    const onDelta = vi.fn((text: string) => {
      if (text === 'Partial') controller.abort();
    });
    // Abort after the first chunk; the next read returns more data that must not be delivered
    res.reader.read
      .mockImplementationOnce(async () => ({ done: false, value: new TextEncoder().encode(sse('delta', { seq: 0, text: 'Partial' })) }))
      .mockImplementationOnce(async () => ({ done: false, value: new TextEncoder().encode(sse('delta', { seq: 1, text: ' more' })) }));

    await expect(
      service.queryAgentStreaming({ userId: 'u1', query: 'q' }, { onDelta, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(res.reader.cancel).toHaveBeenCalled();
    expect(mockInstance.post).not.toHaveBeenCalled();
  });
});
