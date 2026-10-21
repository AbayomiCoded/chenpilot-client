import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer, { addMessage, fetchChatHistory } from '../chatSlice';
import apiService from '@/services/api';
import { ChatMessage } from '@/types';

vi.mock('@/services/api', () => ({
  default: {
    getChatHistory: vi.fn(),
  },
}));

const msg = (id: string, ts: string, content = id): ChatMessage => ({
  id,
  type: 'user',
  content,
  timestamp: ts,
});

const createStore = () =>
  configureStore({
    reducer: { chat: chatReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

describe('fetchChatHistory (#265)', () => {
  beforeEach(() => {
    vi.mocked(apiService.getChatHistory).mockReset();
  });

  it('starts idle and moves to loading', () => {
    const store = createStore();
    expect(store.getState().chat.historyStatus).toBe('idle');

    vi.mocked(apiService.getChatHistory).mockReturnValue(new Promise(() => {}));
    store.dispatch(fetchChatHistory());

    expect(store.getState().chat.historyStatus).toBe('loading');
    expect(store.getState().chat.historyError).toBeNull();
  });

  it('merges loaded messages with cached ones by id', async () => {
    const store = createStore();
    store.dispatch(addMessage(msg('m1', '2024-01-01T12:00:01Z', 'cached')));
    vi.mocked(apiService.getChatHistory).mockResolvedValue({
      messages: [msg('m1', '2024-01-01T12:00:01Z', 'server'), msg('m0', '2024-01-01T12:00:00Z')],
    });

    await store.dispatch(fetchChatHistory());

    const { messages, historyStatus } = store.getState().chat;
    expect(historyStatus).toBe('succeeded');
    expect(messages.map((m) => m.id)).toEqual(['m0', 'm1']);
    expect(messages[1].content).toBe('server');
  });

  it('records a failure without clearing cached messages', async () => {
    const store = createStore();
    store.dispatch(addMessage(msg('m1', '2024-01-01T12:00:01Z')));
    vi.mocked(apiService.getChatHistory).mockRejectedValue({
      message: 'Request failed with status code 500',
      response: { status: 500 },
    });

    await store.dispatch(fetchChatHistory());

    const { messages, historyStatus, historyError } = store.getState().chat;
    expect(historyStatus).toBe('failed');
    expect(historyError).toBe('Request failed with status code 500');
    expect(messages.map((m) => m.id)).toEqual(['m1']);
  });

  it('treats a missing history endpoint as no server history, not an error', async () => {
    const store = createStore();
    vi.mocked(apiService.getChatHistory).mockRejectedValue({ message: 'Not Found', response: { status: 404 } });

    await store.dispatch(fetchChatHistory());

    expect(store.getState().chat.historyStatus).toBe('succeeded');
    expect(store.getState().chat.historyError).toBeNull();
  });

  it('clears the previous error when retrying', async () => {
    const store = createStore();
    vi.mocked(apiService.getChatHistory).mockRejectedValueOnce(new Error('timeout of 10000ms exceeded'));
    await store.dispatch(fetchChatHistory());
    expect(store.getState().chat.historyStatus).toBe('failed');

    vi.mocked(apiService.getChatHistory).mockResolvedValueOnce({ messages: [msg('m1', '2024-01-01T12:00:01Z')] });
    await store.dispatch(fetchChatHistory());

    expect(store.getState().chat.historyStatus).toBe('succeeded');
    expect(store.getState().chat.historyError).toBeNull();
  });
});
