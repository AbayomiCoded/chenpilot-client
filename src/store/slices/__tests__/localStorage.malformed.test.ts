/**
 * Tests for malformed-localStorage recovery — chatSlice reducers (#334)
 *
 * Each test seeds localStorage with a corrupted, wrong-type, or outdated
 * payload, dispatches the relevant action, and asserts that:
 *   1. The reducer does NOT throw.
 *   2. State recovers to a safe default (empty object / empty array).
 *   3. Only the bad key is cleared from localStorage; other keys are untouched.
 *   4. A redacted diagnostic is emitted via logger.warn (not console.error).
 *
 * Auth reducer tests are in localStorage.malformed.auth.test.ts.
 *
 * Note: Node 26 exposes an experimental localStorage that conflicts with the
 * jsdom one. Both test files stub globalThis.localStorage with an in-memory
 * Map-backed implementation so tests run correctly in any Node version.
 */

// vi.mock calls are hoisted — must appear before any slice imports.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/api', () => ({
  default: {
    queryAgent: vi.fn(),
    loadTokenFromStorage: vi.fn(),
    setStore: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

import { configureStore } from '@reduxjs/toolkit';
import chatReducer, {
  initializeChatHistory,
  loadConversationsLocally,
  saveConversationLocally,
  deleteConversationLocally,
  addTag,
  removeTag,
  loadMessageQueue,
} from '../chatSlice';
import * as loggerModule from '@/utils/logger';

// ---------------------------------------------------------------------------
// In-memory localStorage stub (Map-backed, localStorage-API-compatible)
// Needed because Node 26 exposes an experimental localStorage that is
// undefined/broken unless --localstorage-file is passed to Node.
// ---------------------------------------------------------------------------

function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
}

let lsMock: ReturnType<typeof makeLocalStorageStub>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChatStore() {
  return configureStore({ reducer: { chat: chatReducer } });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  lsMock = makeLocalStorageStub();
  vi.stubGlobal('localStorage', lsMock);
  vi.spyOn(loggerModule.logger, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// initializeChatHistory
// ---------------------------------------------------------------------------

describe('initializeChatHistory — malformed localStorage', () => {
  it('recovers to empty object and clears key when JSON is corrupted', () => {
    localStorage.setItem('chat_history', '{not valid json');
    localStorage.setItem('unrelated_key', 'keep_me');

    const store = makeChatStore();
    store.dispatch(initializeChatHistory());

    expect(store.getState().chat.chatHistory).toEqual({});
    // Only the bad key is cleared
    expect(localStorage.getItem('chat_history')).toBeNull();
    // Unrelated key is untouched
    expect(localStorage.getItem('unrelated_key')).toBe('keep_me');
  });

  it('recovers to empty object and clears key when value is an array (wrong schema)', () => {
    localStorage.setItem('chat_history', JSON.stringify([{ id: 'c1' }]));

    const store = makeChatStore();
    store.dispatch(initializeChatHistory());

    expect(store.getState().chat.chatHistory).toEqual({});
    expect(localStorage.getItem('chat_history')).toBeNull();
  });

  it('recovers to empty object when value is a primitive (wrong schema)', () => {
    localStorage.setItem('chat_history', JSON.stringify(42));

    const store = makeChatStore();
    store.dispatch(initializeChatHistory());

    expect(store.getState().chat.chatHistory).toEqual({});
    expect(localStorage.getItem('chat_history')).toBeNull();
  });

  it('loads valid chat history without throwing', () => {
    const history = { conv1: [{ id: 'm1', type: 'user', content: 'hi', timestamp: '' }] };
    localStorage.setItem('chat_history', JSON.stringify(history));

    const store = makeChatStore();
    store.dispatch(initializeChatHistory());

    expect(store.getState().chat.chatHistory).toEqual(history);
    // Key is preserved when value is valid
    expect(localStorage.getItem('chat_history')).toBe(JSON.stringify(history));
  });

  it('emits a logger.warn (not console.error) on malformed JSON', () => {
    localStorage.setItem('chat_history', '<<bad>>');

    const store = makeChatStore();
    store.dispatch(initializeChatHistory());

    expect(loggerModule.logger.warn).toHaveBeenCalledOnce();
    const [msg] = (loggerModule.logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg).toMatch(/chat_history/);
    // Must NOT contain the raw storage value
    expect(msg).not.toContain('<<bad>>');
  });
});

// ---------------------------------------------------------------------------
// loadMessageQueue
// ---------------------------------------------------------------------------

describe('loadMessageQueue — malformed localStorage', () => {
  it('recovers to empty array and clears key when JSON is corrupted', () => {
    localStorage.setItem('messageQueue', '[[broken');
    localStorage.setItem('unrelated_key', 'keep_me');

    const store = makeChatStore();
    store.dispatch(loadMessageQueue());

    expect(store.getState().chat.messageQueue).toEqual([]);
    expect(localStorage.getItem('messageQueue')).toBeNull();
    expect(localStorage.getItem('unrelated_key')).toBe('keep_me');
  });

  it('recovers to empty array and clears key when value is a plain object (wrong schema)', () => {
    localStorage.setItem('messageQueue', JSON.stringify({ id: 'q1' }));

    const store = makeChatStore();
    store.dispatch(loadMessageQueue());

    expect(store.getState().chat.messageQueue).toEqual([]);
    expect(localStorage.getItem('messageQueue')).toBeNull();
  });

  it('recovers to empty array when value is a string (wrong schema)', () => {
    localStorage.setItem('messageQueue', JSON.stringify('old-format'));

    const store = makeChatStore();
    store.dispatch(loadMessageQueue());

    expect(store.getState().chat.messageQueue).toEqual([]);
    expect(localStorage.getItem('messageQueue')).toBeNull();
  });

  it('loads a valid queue without throwing', () => {
    const queue = [{ id: 'q1', query: 'hello', timestamp: '2026-01-01T00:00:00Z' }];
    localStorage.setItem('messageQueue', JSON.stringify(queue));

    const store = makeChatStore();
    store.dispatch(loadMessageQueue());

    expect(store.getState().chat.messageQueue).toEqual(queue);
  });

  it('emits a logger.warn with the key name and no raw value on schema mismatch', () => {
    localStorage.setItem('messageQueue', JSON.stringify({ stale: true }));

    const store = makeChatStore();
    store.dispatch(loadMessageQueue());

    expect(loggerModule.logger.warn).toHaveBeenCalledOnce();
    const [msg] = (loggerModule.logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg).toMatch(/messageQueue/);
    // Must not contain the raw value
    expect(msg).not.toContain('stale');
  });
});

// ---------------------------------------------------------------------------
// loadConversationsLocally
// ---------------------------------------------------------------------------

describe('loadConversationsLocally — malformed localStorage', () => {
  it('recovers to empty array and clears key when JSON is corrupted', () => {
    localStorage.setItem('conversations', 'not-json!');
    localStorage.setItem('unrelated_key', 'keep_me');

    const store = makeChatStore();
    store.dispatch(loadConversationsLocally());

    expect(store.getState().chat.conversations).toEqual([]);
    expect(localStorage.getItem('conversations')).toBeNull();
    expect(localStorage.getItem('unrelated_key')).toBe('keep_me');
  });

  it('recovers to empty array and clears key when value is a plain object (wrong schema)', () => {
    localStorage.setItem('conversations', JSON.stringify({ id: 'c1' }));

    const store = makeChatStore();
    store.dispatch(loadConversationsLocally());

    expect(store.getState().chat.conversations).toEqual([]);
    expect(localStorage.getItem('conversations')).toBeNull();
  });

  it('loads valid conversations without throwing', () => {
    const convs = [{ id: 'c1', title: 'Chat 1' }];
    localStorage.setItem('conversations', JSON.stringify(convs));

    const store = makeChatStore();
    store.dispatch(loadConversationsLocally());

    expect(store.getState().chat.conversations).toEqual(convs);
  });

  it('emits a logger.warn and does not expose the raw payload', () => {
    localStorage.setItem('conversations', '{corrupt');

    const store = makeChatStore();
    store.dispatch(loadConversationsLocally());

    expect(loggerModule.logger.warn).toHaveBeenCalledOnce();
    const [msg] = (loggerModule.logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg).toMatch(/conversations/);
    expect(msg).not.toContain('{corrupt');
  });
});

// ---------------------------------------------------------------------------
// saveConversationLocally
// ---------------------------------------------------------------------------

describe('saveConversationLocally — malformed localStorage', () => {
  const conv = {
    id: 'c1', title: 'New', description: '', isActive: true,
    createdAt: '', updatedAt: '', userId: 'u1', messageCount: 0,
  };

  it('does not throw when "conversations" key contains corrupted JSON', () => {
    localStorage.setItem('conversations', 'CORRUPT_DATA');

    const store = makeChatStore();
    expect(() => store.dispatch(saveConversationLocally(conv))).not.toThrow();
    // Bad key is cleared then replaced with the new single-item list
    const written = JSON.parse(localStorage.getItem('conversations') || '[]');
    expect(Array.isArray(written)).toBe(true);
  });

  it('does not throw when "conversations" key holds a wrong-type JSON value', () => {
    localStorage.setItem('conversations', JSON.stringify('old-string-format'));

    const store = makeChatStore();
    expect(() => store.dispatch(saveConversationLocally({ ...conv, id: 'c2' }))).not.toThrow();
    expect(loggerModule.logger.warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteConversationLocally
// ---------------------------------------------------------------------------

describe('deleteConversationLocally — malformed localStorage', () => {
  it('does not throw when "conversations" key is corrupted', () => {
    localStorage.setItem('conversations', '<<bad>>');
    localStorage.setItem('chat_history', JSON.stringify({}));

    const store = makeChatStore();
    expect(() => store.dispatch(deleteConversationLocally('c1'))).not.toThrow();
    // Bad key is cleared then re-written with the filtered (empty) list
    const written = localStorage.getItem('conversations');
    expect(written).not.toBe('<<bad>>');
    expect(JSON.parse(written ?? '[]')).toEqual([]);
  });

  it('does not throw when "chat_history" key is corrupted', () => {
    localStorage.setItem('conversations', JSON.stringify([]));
    localStorage.setItem('chat_history', '<<bad>>');

    const store = makeChatStore();
    expect(() => store.dispatch(deleteConversationLocally('c1'))).not.toThrow();
    // Bad key is cleared then re-written with the cleaned history object
    const written = localStorage.getItem('chat_history');
    expect(written).not.toBe('<<bad>>');
    // The value should be a valid JSON object (the conversation was deleted from it)
    expect(() => JSON.parse(written ?? '{}')).not.toThrow();
  });

  it('does not throw and emits two warnings when both keys are corrupted', () => {
    localStorage.setItem('conversations', '!!');
    localStorage.setItem('chat_history', '!!');

    const store = makeChatStore();
    expect(() => store.dispatch(deleteConversationLocally('c1'))).not.toThrow();
    expect(loggerModule.logger.warn).toHaveBeenCalledTimes(2);
  });

  it('does not throw when "chat_history" is an array (wrong schema)', () => {
    localStorage.setItem('conversations', JSON.stringify([]));
    localStorage.setItem('chat_history', JSON.stringify([1, 2, 3]));

    const store = makeChatStore();
    expect(() => store.dispatch(deleteConversationLocally('c1'))).not.toThrow();
    // Bad key is cleared then re-written with an empty object (the conversation was removed)
    const written = localStorage.getItem('chat_history');
    expect(written).not.toBe(JSON.stringify([1, 2, 3]));
    expect(() => JSON.parse(written ?? '{}')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// addTag
// ---------------------------------------------------------------------------

describe('addTag — malformed localStorage', () => {
  const preloadedConversations = [
    { id: 'c1', title: 'Chat', description: '', isActive: true, createdAt: '', updatedAt: '', userId: 'u1', messageCount: 0 },
  ];

  it('does not throw when "conversations" key is corrupted', () => {
    localStorage.setItem('conversations', 'NOT_JSON');

    const store = configureStore({
      reducer: { chat: chatReducer },
      preloadedState: { chat: { conversations: preloadedConversations } as Parameters<typeof chatReducer>[0] },
    });

    expect(() => store.dispatch(addTag({ conversationId: 'c1', tag: 'work' }))).not.toThrow();
    expect(localStorage.getItem('conversations')).toBeNull();
    expect(loggerModule.logger.warn).toHaveBeenCalled();
  });

  it('does not throw when "conversations" holds a non-array JSON value', () => {
    localStorage.setItem('conversations', JSON.stringify({ id: 'c1' }));

    const store = configureStore({
      reducer: { chat: chatReducer },
      preloadedState: { chat: { conversations: preloadedConversations } as Parameters<typeof chatReducer>[0] },
    });

    expect(() => store.dispatch(addTag({ conversationId: 'c1', tag: 'work' }))).not.toThrow();
    expect(loggerModule.logger.warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeTag
// ---------------------------------------------------------------------------

describe('removeTag — malformed localStorage', () => {
  it('does not throw when "conversations" key is corrupted', () => {
    localStorage.setItem('conversations', 'NOT_JSON');

    const store = configureStore({
      reducer: { chat: chatReducer },
      preloadedState: {
        chat: {
          conversations: [
            { id: 'c1', title: 'Chat', description: '', isActive: true, createdAt: '', updatedAt: '', userId: 'u1', messageCount: 0, tags: ['work'] },
          ],
        } as Parameters<typeof chatReducer>[0],
      },
    });

    expect(() => store.dispatch(removeTag({ conversationId: 'c1', tag: 'work' }))).not.toThrow();
    expect(localStorage.getItem('conversations')).toBeNull();
    expect(loggerModule.logger.warn).toHaveBeenCalled();
  });
});
