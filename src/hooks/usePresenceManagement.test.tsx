import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import presenceReducer from '@/store/slices/presenceSlice';
import { ActiveUsersPanel } from '@/components/presence/ActiveUsersPanel';
import { usePresenceManagement } from './usePresenceManagement';
import { presenceService } from '@/services/presenceService';
import type { SocketConnectionState } from '@/types/socket';

vi.mock('@/store', () => ({
  useAppDispatch: () => useDispatch(),
  useAppSelector: (selector: (state: unknown) => unknown) => useSelector(selector),
}));

type SocketHandler = (...args: unknown[]) => void;

const listeners = new Map<string, Set<SocketHandler>>();
const emitMock = vi.fn(() => true);
let mockConnectionState: SocketConnectionState = 'connected';

vi.mock('@/components/providers/SocketProvider', () => ({
  useSocket: () => ({
    socket: null,
    socketManager: null,
    isConnected: mockConnectionState === 'connected',
    connectionState: mockConnectionState,
    reconnectAttempt: 0,
    maxReconnectAttempts: 5,
    retry: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: emitMock,
    on: (event: string, cb: SocketHandler) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(cb);
    },
    off: (event: string, cb?: SocketHandler) => {
      if (!cb) {
        listeners.delete(event);
      } else {
        listeners.get(event)?.delete(cb);
      }
    },
    once: vi.fn(),
  }),
}));

function triggerSocketEvent(event: string, ...args: unknown[]) {
  const handlers = listeners.get(event);
  if (!handlers) return;
  handlers.forEach((handler) => handler(...args));
}

function createTestStore(user: { id: string; name: string } | null = { id: 'me', name: 'Current User' }) {
  return configureStore({
    reducer: {
      presence: presenceReducer,
      auth: (state = { user, isAuthenticated: Boolean(user) }) => state,
    },
  });
}

function PresenceTestHarness({
  leaseTimeout = 30_000,
  sweepInterval = 5_000,
}: {
  leaseTimeout?: number;
  sweepInterval?: number;
}) {
  usePresenceManagement({ leaseTimeout, sweepInterval });
  return <ActiveUsersPanel />;
}

describe('usePresenceManagement stale presence detection and recovery (#287)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listeners.clear();
    emitMock.mockClear();
    presenceService.clear();
    mockConnectionState = 'connected';
  });

  afterEach(() => {
    presenceService.clear();
    listeners.clear();
    vi.useRealTimers();
  });

  it('filters expired records from presence:list and renders only active users in ActiveUsersPanel', () => {
    // Skew client wall clock far into the future to confirm server timestamps govern expiry
    vi.setSystemTime(new Date('2032-01-01T00:00:00.000Z'));

    const store = createTestStore();
    render(
      <Provider store={store}>
        <PresenceTestHarness />
      </Provider>,
    );

    expect(emitMock).toHaveBeenCalledWith('presence:join', {
      userId: 'me',
      userName: 'Current User',
    });

    act(() => {
      triggerSocketEvent('presence:list', {
        serverTime: '2026-10-19T12:00:00.000Z',
        users: [
          {
            userId: 'alice',
            userName: 'Alice Active',
            status: 'online',
            lastSeen: '2026-10-19T11:59:55.000Z',
            expiresAt: '2026-10-19T12:01:00.000Z',
          },
          {
            userId: 'bob',
            userName: 'Bob Expired',
            status: 'online',
            lastSeen: '2026-10-19T11:50:00.000Z',
            expiresAt: '2026-10-19T11:59:00.000Z',
          },
          {
            userId: 'carol',
            userName: 'Carol Offline',
            status: 'offline',
            lastSeen: '2026-10-19T11:59:59.000Z',
            expiresAt: '2026-10-19T12:05:00.000Z',
          },
        ],
      });
    });

    expect(screen.getByText('Alice Active')).toBeInTheDocument();
    expect(screen.queryByText('Bob Expired')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol Offline')).not.toBeInTheDocument();
    expect(store.getState().presence.onlineCount).toBe(1);
  });

  it('removes stale user from ActiveUsersPanel after abrupt remote disconnect when lease expires', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <PresenceTestHarness sweepInterval={5_000} />
      </Provider>,
    );

    act(() => {
      triggerSocketEvent('presence:join', {
        userId: 'remote-1',
        userName: 'Abrupt User',
        status: 'online',
        lastSeen: '2026-10-19T12:00:00.000Z',
        leaseTtlMs: 10_000,
      });
    });

    expect(screen.getByText('Abrupt User')).toBeInTheDocument();

    // Advance 5s — lease still valid
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('Abrupt User')).toBeInTheDocument();

    // Advance another 5s (total 10s) — lease expired without presence:leave
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryByText('Abrupt User')).not.toBeInTheDocument();
    expect(screen.getByText('No active users')).toBeInTheDocument();
    expect(store.getState().presence.onlineCount).toBe(0);
  });

  it('keeps user active when presence:heartbeat renews lease before expiry', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <PresenceTestHarness sweepInterval={5_000} />
      </Provider>,
    );

    act(() => {
      triggerSocketEvent('presence:join', {
        userId: 'remote-hb',
        userName: 'Steady User',
        status: 'online',
        lastSeen: '2026-10-19T12:00:00.000Z',
        leaseTtlMs: 10_000,
      });
    });

    act(() => {
      vi.advanceTimersByTime(7_000);
      triggerSocketEvent('presence:heartbeat', {
        userId: 'remote-hb',
        lastSeen: '2026-10-19T12:00:07.000Z',
        leaseTtlMs: 10_000,
      });
      vi.advanceTimersByTime(5_000); // 12s total, 5s since heartbeat
    });

    expect(screen.getByText('Steady User')).toBeInTheDocument();
  });

  it('re-announces presence:join on reconnect and reconciles stale users from fresh presence:list', () => {
    const store = createTestStore();
    const { rerender } = render(
      <Provider store={store}>
        <PresenceTestHarness sweepInterval={5_000} />
      </Provider>,
    );

    act(() => {
      triggerSocketEvent('presence:list', [
        {
          userId: 'alice',
          userName: 'Alice Stays',
          status: 'online',
          lastSeen: '2026-10-19T12:00:00.000Z',
          leaseTtlMs: 60_000,
        },
        {
          userId: 'ghost',
          userName: 'Ghost Left Offline',
          status: 'online',
          lastSeen: '2026-10-19T12:00:00.000Z',
          leaseTtlMs: 60_000,
        },
      ]);
    });

    expect(screen.getByText('Alice Stays')).toBeInTheDocument();
    expect(screen.getByText('Ghost Left Offline')).toBeInTheDocument();

    // Simulate network drop -> reconnecting
    emitMock.mockClear();
    mockConnectionState = 'reconnecting';
    rerender(
      <Provider store={store}>
        <PresenceTestHarness sweepInterval={5_000} />
      </Provider>,
    );

    // Simulate reconnect -> connected
    mockConnectionState = 'connected';
    rerender(
      <Provider store={store}>
        <PresenceTestHarness sweepInterval={5_000} />
      </Provider>,
    );

    expect(emitMock).toHaveBeenCalledWith('presence:join', {
      userId: 'me',
      userName: 'Current User',
    });

    // Server sends reconciled list without 'ghost'
    act(() => {
      triggerSocketEvent('presence:list', {
        serverTime: '2026-10-19T12:00:20.000Z',
        users: [
          {
            userId: 'alice',
            userName: 'Alice Stays',
            status: 'online',
            lastSeen: '2026-10-19T12:00:19.000Z',
            expiresAt: '2026-10-19T12:01:20.000Z',
          },
        ],
      });
    });

    expect(screen.getByText('Alice Stays')).toBeInTheDocument();
    expect(screen.queryByText('Ghost Left Offline')).not.toBeInTheDocument();
    expect(store.getState().presence.onlineCount).toBe(1);
  });

  it('clears stale presence records when socket enters exhausted or disconnected state', () => {
    const store = createTestStore();
    const { rerender } = render(
      <Provider store={store}>
        <PresenceTestHarness />
      </Provider>,
    );

    act(() => {
      triggerSocketEvent('presence:join', {
        userId: 'alice',
        userName: 'Alice Online',
        status: 'online',
        lastSeen: '2026-10-19T12:00:00.000Z',
        leaseTtlMs: 60_000,
      });
    });

    expect(screen.getByText('Alice Online')).toBeInTheDocument();

    mockConnectionState = 'exhausted';
    rerender(
      <Provider store={store}>
        <PresenceTestHarness />
      </Provider>,
    );

    expect(screen.queryByText('Alice Online')).not.toBeInTheDocument();
    expect(screen.getByText('No active users')).toBeInTheDocument();
    expect(store.getState().presence.onlineCount).toBe(0);
  });

  it('handles presence:leave payloads as both string and object and emits leave on pagehide', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <PresenceTestHarness />
      </Provider>,
    );

    act(() => {
      triggerSocketEvent('presence:list', [
        {
          userId: 'u1',
          userName: 'User One',
          status: 'online',
          lastSeen: '2026-10-19T12:00:00.000Z',
          leaseTtlMs: 60_000,
        },
        {
          userId: 'u2',
          userName: 'User Two',
          status: 'away',
          lastSeen: '2026-10-19T12:00:00.000Z',
          leaseTtlMs: 60_000,
        },
      ]);
    });

    act(() => {
      triggerSocketEvent('presence:leave', 'u1');
      triggerSocketEvent('presence:leave', { userId: 'u2' });
    });

    expect(screen.queryByText('User One')).not.toBeInTheDocument();
    expect(screen.queryByText('User Two')).not.toBeInTheDocument();

    emitMock.mockClear();
    window.dispatchEvent(new Event('pagehide'));
    expect(emitMock).toHaveBeenCalledWith('presence:leave', { userId: 'me' });
  });
});
