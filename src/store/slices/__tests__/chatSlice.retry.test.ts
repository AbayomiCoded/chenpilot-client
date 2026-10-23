import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer, { sendMessage, removeMessage } from '../chatSlice';
import authReducer from '../authSlice';
import apiService from '@/services/api';

vi.mock('@/services/api', () => ({
  default: { queryAgent: vi.fn() },
}));

const createStore = () =>
  configureStore({
    reducer: { chat: chatReducer, auth: authReducer },
    preloadedState: { auth: { user: { id: 'user_1' }, isAuthenticated: true } as never },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

describe('sendMessage retry metadata (#262)', () => {
  beforeEach(() => {
    vi.mocked(apiService.queryAgent).mockReset();
  });

  it('marks transient failures retryable and preserves the original prompt and request id', async () => {
    const store = createStore();
    vi.mocked(apiService.queryAgent).mockResolvedValue({
      result: { success: false, data: "I'm having trouble connecting.", error: 'Network Error', errorKind: 'network' },
    } as never);

    await store.dispatch(sendMessage('  send 20 XLM to GABC'));

    const sentRequest = vi.mocked(apiService.queryAgent).mock.calls[0][0];
    const reply = store.getState().chat.messages.find((m) => m.type === 'agent')!;
    expect(reply.metadata).toMatchObject({
      retryable: true,
      retryPrompt: '  send 20 XLM to GABC',
      requestId: sentRequest.clientRequestId,
      stateChanging: true,
      errorKind: 'network',
    });
    expect(reply.metadata?.retryTempId).toMatch(/^msg_optimistic_/);
  });

  it('does not offer retry for rejected input', async () => {
    const store = createStore();
    vi.mocked(apiService.queryAgent).mockResolvedValue({
      result: { success: false, data: "I didn't understand that.", error: 'invalid query', errorKind: 'invalid_query' },
    } as never);

    await store.dispatch(sendMessage('asdf'));

    const reply = store.getState().chat.messages.find((m) => m.type === 'agent')!;
    expect(reply.metadata?.retryable).toBe(false);
  });

  it('does not offer retry on successful replies', async () => {
    const store = createStore();
    vi.mocked(apiService.queryAgent).mockResolvedValue({ result: { success: true, data: 'ok' } } as never);

    await store.dispatch(sendMessage('balance?'));

    const reply = store.getState().chat.messages.find((m) => m.type === 'agent')!;
    expect(reply.metadata?.retryable).toBeUndefined();
  });

  it('adds retry metadata to thrown failures, but not for auth errors', async () => {
    const store = createStore();
    vi.mocked(apiService.queryAgent).mockRejectedValueOnce(new Error('Network error: connection lost'));
    await store.dispatch(sendMessage('balance?'));
    const reply = store.getState().chat.messages.find((m) => m.type === 'agent')!;
    // The message never reached the service, so the retry lives on the user bubble (#266),
    // not on this error reply; the prompt is still preserved for reference (#262)
    expect(reply.metadata).toMatchObject({ retryable: false, retryPrompt: 'balance?' });
    expect(store.getState().chat.messages.find((m) => m.type === 'user')?.metadata?.delivery).toBe('failed');

    const anonymous = configureStore({
      reducer: { chat: chatReducer, auth: authReducer },
      middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
    });
    await anonymous.dispatch(sendMessage('balance?'));
    const authReply = anonymous.getState().chat.messages.find((m) => m.type === 'agent')!;
    expect(authReply.metadata?.retryable).toBe(false);
  });

  it('retry reuses the original user bubble and request id', async () => {
    const store = createStore();
    vi.mocked(apiService.queryAgent).mockResolvedValueOnce({
      result: { success: false, data: 'timeout', error: 'timeout', errorKind: 'timeout' },
    } as never);
    await store.dispatch(sendMessage('swap 5 XLM for USDC'));
    const failed = store.getState().chat.messages.find((m) => m.type === 'agent')!;

    vi.mocked(apiService.queryAgent).mockResolvedValueOnce({ result: { success: true, data: 'Swapped' } } as never);
    store.dispatch(removeMessage(failed.id));
    await store.dispatch(sendMessage({
      query: failed.metadata!.retryPrompt!,
      tempId: failed.metadata!.retryTempId,
      clientRequestId: failed.metadata!.requestId,
    }));

    const [first, second] = vi.mocked(apiService.queryAgent).mock.calls.map(([req]) => req);
    expect(second.clientRequestId).toBe(first.clientRequestId);
    expect(second.query).toBe('swap 5 XLM for USDC');

    const messages = store.getState().chat.messages;
    expect(messages.filter((m) => m.type === 'user')).toHaveLength(1);
    expect(messages.filter((m) => m.type === 'agent').map((m) => m.content)).toEqual(['Swapped']);
  });
});
