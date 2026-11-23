import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer, { addMessage, fetchChatHistory, loadOlderHistory } from '../chatSlice';
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
      nextCursor: null,
      hasMore: false,
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

    vi.mocked(apiService.getChatHistory).mockResolvedValueOnce({
      messages: [msg('m1', '2024-01-01T12:00:01Z')],
      nextCursor: null,
      hasMore: false,
    });
    await store.dispatch(fetchChatHistory());

    expect(store.getState().chat.historyStatus).toBe('succeeded');
    expect(store.getState().chat.historyError).toBeNull();
  });
});

describe('loadOlderHistory pagination (#264)', () => {
  const page = (ids: Array<[string, string]>, nextCursor: string | null, hasMore = nextCursor !== null) => ({
    messages: ids.map(([id, ts]) => msg(id, ts)),
    nextCursor,
    hasMore,
  });

  const loadFirstPage = async (store: ReturnType<typeof createStore>) => {
    vi.mocked(apiService.getChatHistory).mockResolvedValueOnce(
      page([['m5', '2024-01-01T12:00:05Z'], ['m6', '2024-01-01T12:00:06Z']], 'cur_5'),
    );
    await store.dispatch(fetchChatHistory());
  };

  beforeEach(() => {
    vi.mocked(apiService.getChatHistory).mockReset();
  });

  it('stores the cursor from the first page and requests older pages with it', async () => {
    const store = createStore();
    await loadFirstPage(store);
    expect(store.getState().chat.historyCursor).toBe('cur_5');
    expect(store.getState().chat.historyHasMore).toBe(true);

    vi.mocked(apiService.getChatHistory).mockResolvedValueOnce(
      page([['m3', '2024-01-01T12:00:03Z'], ['m4', '2024-01-01T12:00:04Z']], 'cur_3'),
    );
    await store.dispatch(loadOlderHistory());

    expect(apiService.getChatHistory).toHaveBeenLastCalledWith({ before: 'cur_5', limit: 50 });
    expect(store.getState().chat.messages.map((m) => m.id)).toEqual(['m3', 'm4', 'm5', 'm6']);
    expect(store.getState().chat.historyCursor).toBe('cur_3');
  });

  it('does not create duplicate rows when pages overlap or repeat', async () => {
    const store = createStore();
    await loadFirstPage(store);

    // Overlapping page: m5 was already loaded
    vi.mocked(apiService.getChatHistory).mockResolvedValueOnce(
      page([['m4', '2024-01-01T12:00:04Z'], ['m5', '2024-01-01T12:00:05Z']], 'cur_4'),
    );
    await store.dispatch(loadOlderHistory());
    // Same page delivered again
    vi.mocked(apiService.getChatHistory).mockResolvedValueOnce(
      page([['m4', '2024-01-01T12:00:04Z']], 'cur_3'),
    );
    await store.dispatch(loadOlderHistory());

    const ids = store.getState().chat.messages.map((m) => m.id);
    expect(ids).toEqual(['m4', 'm5', 'm6']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts messages from an out-of-order page back in chronological order', async () => {
    const store = createStore();
    await loadFirstPage(store);

    vi.mocked(apiService.getChatHistory).mockResolvedValueOnce(
      page([['m4', '2024-01-01T12:00:04Z'], ['m2', '2024-01-01T12:00:02Z'], ['m3', '2024-01-01T12:00:03Z']], 'cur_2'),
    );
    await store.dispatch(loadOlderHistory());

    expect(store.getState().chat.messages.map((m) => m.id)).toEqual(['m2', 'm3', 'm4', 'm5', 'm6']);
  });

  it('ignores a late page for a stale cursor when advancing', async () => {
    const store = createStore();
    await loadFirstPage(store);

    let resolveOlder: (value: unknown) => void = () => {};
    vi.mocked(apiService.getChatHistory).mockReturnValueOnce(
      new Promise((resolve) => { resolveOlder = resolve; }) as never,
    );
    const pending = store.dispatch(loadOlderHistory());

    // A refresh lands first and resets the cursor
    vi.mocked(apiService.getChatHistory).mockResolvedValueOnce(
      page([['m6', '2024-01-01T12:00:06Z'], ['m7', '2024-01-01T12:00:07Z']], 'cur_6'),
    );
    await store.dispatch(fetchChatHistory());

    resolveOlder(page([['m3', '2024-01-01T12:00:03Z']], 'cur_3'));
    await pending;

    const chat = store.getState().chat;
    expect(chat.messages.map((m) => m.id)).toContain('m3');
    expect(chat.historyCursor).toBe('cur_6');
  });

  it('stops when the last page is reached', async () => {
    const store = createStore();
    await loadFirstPage(store);

    vi.mocked(apiService.getChatHistory).mockResolvedValueOnce(page([['m1', '2024-01-01T12:00:01Z']], null, false));
    await store.dispatch(loadOlderHistory());
    expect(store.getState().chat.historyHasMore).toBe(false);

    await store.dispatch(loadOlderHistory());
    expect(apiService.getChatHistory).toHaveBeenCalledTimes(2);
  });

  it('treats a repeated cursor as the end to avoid looping', async () => {
    const store = createStore();
    await loadFirstPage(store);

    vi.mocked(apiService.getChatHistory).mockResolvedValueOnce(page([['m4', '2024-01-01T12:00:04Z']], 'cur_5', true));
    await store.dispatch(loadOlderHistory());

    expect(store.getState().chat.historyHasMore).toBe(false);
    expect(store.getState().chat.historyCursor).toBeNull();
  });

  it('skips a second request while one is in flight', async () => {
    const store = createStore();
    await loadFirstPage(store);
    vi.mocked(apiService.getChatHistory).mockReturnValueOnce(new Promise(() => {}) as never);

    store.dispatch(loadOlderHistory());
    store.dispatch(loadOlderHistory());

    expect(apiService.getChatHistory).toHaveBeenCalledTimes(2); // first page + one older page
    expect(store.getState().chat.isLoadingOlderHistory).toBe(true);
  });

  it('keeps the cursor and loaded messages when an older page fails', async () => {
    const store = createStore();
    await loadFirstPage(store);
    vi.mocked(apiService.getChatHistory).mockRejectedValueOnce(new Error('Network Error'));

    await store.dispatch(loadOlderHistory());

    const chat = store.getState().chat;
    expect(chat.olderHistoryError).toBe('Network Error');
    expect(chat.historyCursor).toBe('cur_5');
    expect(chat.historyHasMore).toBe(true);
    expect(chat.messages.map((m) => m.id)).toEqual(['m5', 'm6']);
  });
});
