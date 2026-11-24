import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer, { fetchChatHistory, mergeSyncedMessages, setOnlineStatus, addMessage } from '../chatSlice';
import apiService from '@/services/api';
import { describeLastSynced } from '@/components/chat/OfflineIndicator';

vi.mock('@/services/api', () => ({ default: { getChatHistory: vi.fn(), queryAgent: vi.fn() } }));

const createStore = () =>
  configureStore({
    reducer: { chat: chatReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

const msg = (id: string) => ({ id, type: 'user' as const, content: id, timestamp: '2026-11-01T10:00:00Z' });

describe('offline conversation provenance (#289)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(apiService.getChatHistory).mockReset();
  });

  it('marks conversation state cached when going offline', () => {
    const store = createStore();
    store.dispatch(mergeSyncedMessages([msg('m1')]));
    expect(store.getState().chat.dataSource).toBe('live');

    store.dispatch(setOnlineStatus(false));
    expect(store.getState().chat.dataSource).toBe('cached');
  });

  it('records and persists the last synchronization time on live data', () => {
    const store = createStore();
    store.dispatch(mergeSyncedMessages([msg('m1')]));
    const { lastSyncedAt } = store.getState().chat;
    expect(lastSyncedAt).not.toBeNull();
    expect(localStorage.getItem('chat_last_synced_at')).toBe(lastSyncedAt);
  });

  it('reconciles on reconnect without duplicating cached messages', async () => {
    const store = createStore();
    store.dispatch(addMessage(msg('m1')));
    store.dispatch(setOnlineStatus(false));
    store.dispatch(setOnlineStatus(true));
    expect(store.getState().chat.dataSource).toBe('cached');

    vi.mocked(apiService.getChatHistory).mockResolvedValue({ messages: [msg('m1'), msg('m2')], nextCursor: null, hasMore: false } as never);
    await store.dispatch(fetchChatHistory());

    const chat = store.getState().chat;
    expect(chat.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(chat.dataSource).toBe('live');
  });

  it('describes the last sync time', () => {
    expect(describeLastSynced(null)).toBe('not synced yet');
    expect(describeLastSynced('2026-11-01T10:00:00Z', new Date('2026-11-01T12:00:00Z'))).toMatch(/^last synced /);
  });
});
