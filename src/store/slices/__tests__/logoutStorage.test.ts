import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { login, logout } from '../authSlice';
import chatReducer, { addMessage } from '../chatSlice';
import { USER_SCOPED_STORAGE_KEYS } from '@/services/storageInventory';

vi.mock('@/services/api', () => ({
  default: { logout: vi.fn().mockResolvedValue(undefined), queryAgent: vi.fn() },
}));

const createStore = () =>
  configureStore({
    reducer: { auth: authReducer, chat: chatReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

describe('logout clears user-scoped storage (#256)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('removes every user-scoped key and chat state, keeping preferences', async () => {
    const store = createStore();
    await store.dispatch(login({ email: 'ada@example.test', password: 'Secret123' }));
    store.dispatch(addMessage({ id: 'm1', type: 'user', content: 'send 50 XLM to GABC', timestamp: '2026-01-01T00:00:00Z' }));

    localStorage.setItem('chat_history', JSON.stringify({ c1: [{ content: 'send 50 XLM to GABC' }] }));
    localStorage.setItem('conversations', '[]');
    localStorage.setItem('messageQueue', '[{"query":"swap"}]');
    localStorage.setItem('session_expiration', '123');
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('language', 'en');
    sessionStorage.setItem('draft', 'x');

    await store.dispatch(logout());

    for (const key of USER_SCOPED_STORAGE_KEYS) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('language')).toBe('en');

    const state = store.getState();
    expect(state.auth.isAuthenticated).toBe(false);
    expect(state.chat.messages).toEqual([]);
    expect(state.chat.chatHistory).toEqual({});
  });

  it('does not persist wallet identifiers in user_data on login', async () => {
    const store = createStore();
    await store.dispatch(login({ email: 'ada@example.test', password: 'Secret123' }));

    const stored = JSON.parse(localStorage.getItem('user_data')!);
    expect(stored.email).toBe('ada@example.test');
    expect(stored).not.toHaveProperty('address');
    expect(stored).not.toHaveProperty('publicKey');
  });
});
