import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer, { sendMessage, streamingDelta } from '../chatSlice';
import authReducer from '../authSlice';
import apiService from '@/services/api';

vi.mock('@/services/api', () => ({
  default: { queryAgent: vi.fn() },
}));

type QueryOptions = { onDelta?: (text: string) => void; signal?: AbortSignal };

const createStore = () =>
  configureStore({
    reducer: { chat: chatReducer, auth: authReducer },
    preloadedState: {
      auth: { user: { id: 'user_1' }, isAuthenticated: true } as never,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

const agentMessages = (store: ReturnType<typeof createStore>) =>
  store.getState().chat.messages.filter((m) => m.type === 'agent');

describe('sendMessage streaming (#261)', () => {
  beforeEach(() => {
    vi.mocked(apiService.queryAgent).mockReset();
  });

  it('exposes partial text while streaming and replaces it with a single final message', async () => {
    const store = createStore();
    let release: () => void = () => {};
    vi.mocked(apiService.queryAgent).mockImplementation((async (_req: unknown, opts: QueryOptions) => {
      opts.onDelta?.('Swapping');
      opts.onDelta?.('Swapping 10 XLM');
      await new Promise<void>((resolve) => { release = resolve; });
      return { result: { success: true, data: 'Swapped 10 XLM for 1.2 USDC' } };
    }) as never);

    const pending = store.dispatch(sendMessage('swap 10 XLM'));
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().chat.streamingResponse?.text).toBe('Swapping 10 XLM');
    expect(agentMessages(store)).toHaveLength(0);

    release();
    await pending;

    expect(store.getState().chat.streamingResponse).toBeNull();
    const agents = agentMessages(store);
    expect(agents).toHaveLength(1);
    expect(agents[0].content).toBe('Swapped 10 XLM for 1.2 USDC');
  });

  it('ignores deltas for a request that is not in flight', () => {
    const store = createStore();
    store.dispatch(streamingDelta({ requestId: 'other', text: 'stale' }));
    expect(store.getState().chat.streamingResponse).toBeNull();
  });

  it('cancels cleanly: no partial text, no error bubble, and late deltas are dropped', async () => {
    const store = createStore();
    let lateDelta: (text: string) => void = () => {};
    vi.mocked(apiService.queryAgent).mockImplementation(((_req: unknown, opts: QueryOptions) => {
      opts.onDelta?.('Partial');
      lateDelta = (text) => opts.onDelta?.(text);
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }) as never);

    const request = store.dispatch(sendMessage('send 5 XLM'));
    await Promise.resolve();
    expect(store.getState().chat.streamingResponse?.text).toBe('Partial');

    request.abort('route-change');
    await request;
    lateDelta('Partial and more');

    const chat = store.getState().chat;
    expect(chat.streamingResponse).toBeNull();
    expect(chat.isTyping).toBe(false);
    expect(agentMessages(store)).toHaveLength(0);
    expect(chat.messages.find((m) => m.type === 'user')?.metadata).toMatchObject({ status: 'cancelled' });
  });

  it('passes an abort signal to the API call', async () => {
    const store = createStore();
    vi.mocked(apiService.queryAgent).mockResolvedValue({ result: { success: true, data: 'ok' } } as never);

    await store.dispatch(sendMessage('hi'));

    const opts = vi.mocked(apiService.queryAgent).mock.calls[0][1] as QueryOptions;
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(typeof opts.onDelta).toBe('function');
  });
});
