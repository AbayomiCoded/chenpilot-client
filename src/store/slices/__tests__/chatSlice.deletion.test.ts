import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer, { deleteConversation, sendMessage, setCurrentConversation } from '../chatSlice';
import authReducer from '../authSlice';
import apiService from '@/services/api';
import { CONVERSATION_DELETED, resetConversationRequests } from '@/store/conversationRequests';
import { Conversation } from '@/types';

vi.mock('@/services/api', () => ({ default: { queryAgent: vi.fn() } }));

const conversation = (id: string): Conversation => ({
  id,
  title: `Chat ${id}`,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  userId: 'user_1',
  messageCount: 0,
} as Conversation);

const createStore = () =>
  configureStore({
    reducer: { chat: chatReducer, auth: authReducer },
    preloadedState: { auth: { user: { id: 'user_1' }, isAuthenticated: true } as never },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

/** Make the next queryAgent call hang until `resolve` is called; exposes the signal it received. */
function pendingQuery() {
  const handle: { resolve: (value: unknown) => void; signal?: AbortSignal } = { resolve: () => {} };
  vi.mocked(apiService.queryAgent).mockImplementationOnce(((_req: unknown, opts: { signal?: AbortSignal }) => {
    handle.signal = opts?.signal;
    return new Promise((resolve) => {
      handle.resolve = resolve;
    });
  }) as never);
  return handle;
}

describe('deleting a conversation with a pending request (#269)', () => {
  beforeEach(() => {
    vi.mocked(apiService.queryAgent).mockReset();
    resetConversationRequests();
    localStorage.clear();
  });

  it('aborts the request, clears the view and ignores the late response', async () => {
    const store = createStore();
    store.dispatch(setCurrentConversation(conversation('c1')));
    const query = pendingQuery();

    const request = store.dispatch(sendMessage('send 10 XLM to GABC'));
    expect(store.getState().chat.isTyping).toBe(true);

    await store.dispatch(deleteConversation('c1'));

    expect(query.signal?.aborted).toBe(true);
    let chat = store.getState().chat;
    expect(chat.currentConversation).toBeNull();
    expect(chat.messages).toEqual([]);
    expect(chat.isTyping).toBe(false);

    // The backend answers anyway
    query.resolve({ result: { success: true, data: 'Sent 10 XLM' } });
    const action = await request;

    expect(action.payload).toBe(CONVERSATION_DELETED);
    chat = store.getState().chat;
    expect(chat.messages).toEqual([]);
    expect(chat.currentConversation).toBeNull();
    expect(chat.chatHistory.c1).toBeUndefined();
    expect(chat.error).toBeNull();
  });

  it('leaves requests for other conversations alone', async () => {
    const store = createStore();
    store.dispatch(setCurrentConversation(conversation('c1')));
    const query = pendingQuery();

    const request = store.dispatch(sendMessage('balance?'));
    await store.dispatch(deleteConversation('c2'));
    expect(query.signal?.aborted).toBe(false);

    query.resolve({ result: { success: true, data: 'You have 5 XLM' } });
    await request;

    const agent = store.getState().chat.messages.filter((m) => m.type === 'agent');
    expect(agent.map((m) => m.content)).toEqual(['You have 5 XLM']);
  });

  it('reports how many requests were cancelled', async () => {
    const store = createStore();
    store.dispatch(setCurrentConversation(conversation('c1')));
    pendingQuery();
    store.dispatch(sendMessage('swap 5 XLM'));

    const result = await store.dispatch(deleteConversation('c1'));
    expect(result.payload).toEqual({ conversationId: 'c1', cancelled: 1 });
  });
});
