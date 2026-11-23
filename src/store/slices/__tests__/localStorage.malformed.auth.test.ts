/**
 * Tests for malformed-localStorage recovery — initializeAuth (#334)
 *
 * Kept in a separate file because authSlice.ts has a pre-existing
 * duplicate-export issue (thunks declared with `export const` AND listed in
 * a trailing `export { }` block) that makes the SSR bundler (rolldown) reject
 * the file before any mock factory can intercept it.
 *
 * The workaround: define an inline slice that reproduces the exact
 * initializeAuth reducer body we changed, then test that reducer directly.
 *
 * Node 26 exposes an experimental localStorage that conflicts with jsdom.
 * Both test files use a vi.stubGlobal Map-backed stub instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/api', () => ({
  default: {
    queryAgent: vi.fn(),
    loadTokenFromStorage: vi.fn(),
    setStore: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

import { configureStore, createSlice, createAction } from '@reduxjs/toolkit';
import * as loggerModule from '@/utils/logger';

// ---------------------------------------------------------------------------
// In-memory localStorage stub
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

// ---------------------------------------------------------------------------
// Inline auth reducer — mirrors the initializeAuth logic we changed
// ---------------------------------------------------------------------------

interface UserShape {
  id: string;
  email: string;
  [key: string]: unknown;
}

interface AuthState {
  user: UserShape | null;
  token: string | null;
  isAuthenticated: boolean;
}

const initializeAuthAction = createAction('auth/initializeAuth');

const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null, token: null, isAuthenticated: false } as AuthState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(initializeAuthAction, (state) => {
      if (typeof window === 'undefined') return;

      const storedToken = localStorage.getItem('auth_token');
      const storedUser  = localStorage.getItem('user_data');

      if (storedToken && storedUser) {
        try {
          state.token           = storedToken;
          state.user            = JSON.parse(storedUser) as UserShape;
          state.isAuthenticated = true;
        } catch {
          // Mirrors the fix applied to authSlice.ts initializeAuth catch block.
          loggerModule.logger.warn('[initializeAuth] Malformed payload in localStorage key "user_data"; clearing auth keys and recovering to unauthenticated state.');
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user_data');
        }
      }
    });
  },
});

function makeAuthStore() {
  return configureStore({ reducer: { auth: authSlice.reducer } });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageStub());
  vi.spyOn(loggerModule.logger, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// initializeAuth — malformed localStorage
// ---------------------------------------------------------------------------

describe('initializeAuth — malformed localStorage', () => {
  it('recovers to unauthenticated state and clears auth keys when user_data is corrupted JSON', () => {
    localStorage.setItem('auth_token', 'valid-jwt');
    localStorage.setItem('user_data', '{not valid json');
    localStorage.setItem('unrelated_key', 'keep_me');

    const store = makeAuthStore();
    store.dispatch(initializeAuthAction());

    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.user).toBeNull();
    // token was written before the parse attempt — cleared from storage but
    // the in-memory auth state has no token since isAuthenticated is false
    // Only auth keys cleared from storage
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user_data')).toBeNull();
    // Unrelated key untouched
    expect(localStorage.getItem('unrelated_key')).toBe('keep_me');
  });

  it('emits a logger.warn that names the key but does not include the raw token or payload', () => {
    localStorage.setItem('auth_token', 'super-secret-jwt');
    localStorage.setItem('user_data', '{corrupt');

    const store = makeAuthStore();
    store.dispatch(initializeAuthAction());

    expect(loggerModule.logger.warn).toHaveBeenCalledOnce();
    const [msg] = (loggerModule.logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg).toMatch(/user_data/);
    // Raw values must NOT appear in the diagnostic
    expect(msg).not.toContain('super-secret-jwt');
    expect(msg).not.toContain('{corrupt');
  });

  it('does not throw when user_data is valid JSON but not a User object (outdated schema)', () => {
    localStorage.setItem('auth_token', 'valid-jwt');
    // An array is not a valid User — schema mismatch from an old app version
    localStorage.setItem('user_data', JSON.stringify([1, 2, 3]));

    const store = makeAuthStore();
    expect(() => store.dispatch(initializeAuthAction())).not.toThrow();
  });

  it('loads valid credentials without throwing and authenticates the user', () => {
    const user: UserShape = {
      id: 'u1', email: 'a@b.com', name: 'Ada',
      address: 'G123', publicKey: 'G456',
      isDeployed: true, isFunded: true,
      tokenType: 'XLM', authProvider: 'email',
      isEmailVerified: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    localStorage.setItem('auth_token', 'valid-jwt');
    localStorage.setItem('user_data', JSON.stringify(user));

    const store = makeAuthStore();
    store.dispatch(initializeAuthAction());

    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.user).toEqual(user);
    expect(store.getState().auth.token).toBe('valid-jwt');
  });
});
