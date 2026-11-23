// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocketConnectionState } from '@/types/socket';
import { SocketProvider, useSocket } from './SocketProvider';

type StateListener = (state: SocketConnectionState, attempt: number) => void;

const { manager, listeners } = vi.hoisted(() => {
  const listeners: StateListener[] = [];
  return {
    listeners,
    manager: {
      onStateChange: vi.fn((listener: StateListener) => {
        listeners.push(listener);
        return () => {
          listeners.splice(listeners.indexOf(listener), 1);
        };
      }),
      connect: vi.fn(() => ({ connected: false })),
      disconnect: vi.fn(),
      retry: vi.fn(),
      getSocket: vi.fn(() => null),
      getMaxReconnectAttempts: vi.fn(() => 5),
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
    },
  };
});

vi.mock('@/services/socketManager', () => ({
  initializeSocketManager: () => manager,
}));

const config = { url: 'http://localhost:3001' };

function StateProbe() {
  const { connectionState, isConnected, reconnectAttempt, maxReconnectAttempts } = useSocket();
  return (
    <p data-testid="probe">
      {connectionState}|{String(isConnected)}|{reconnectAttempt}|{maxReconnectAttempts}
    </p>
  );
}

function emit(state: SocketConnectionState, attempt = 0) {
  act(() => {
    for (const listener of [...listeners]) listener(state, attempt);
  });
}

const probe = () => screen.getByTestId('probe').textContent;

describe('SocketProvider connection state', () => {
  beforeEach(() => {
    listeners.length = 0;
    vi.clearAllMocks();
  });

  it('exposes the unknown (idle) state before any transition', () => {
    render(
      <SocketProvider config={config} autoConnect={false}>
        <StateProbe />
      </SocketProvider>,
    );
    expect(probe()).toBe('idle|false|0|5');
  });

  it('follows the manager through connect, reconnect, failure and disconnect', () => {
    render(
      <SocketProvider config={config}>
        <StateProbe />
      </SocketProvider>,
    );

    emit('connecting');
    expect(probe()).toBe('connecting|false|0|5');

    emit('connected');
    expect(probe()).toBe('connected|true|0|5');

    emit('reconnecting', 2);
    expect(probe()).toBe('reconnecting|false|2|5');

    emit('exhausted', 5);
    expect(probe()).toBe('exhausted|false|5|5');

    emit('connecting', 0);
    emit('connected', 0);
    expect(probe()).toBe('connected|true|0|5');

    emit('disconnected');
    expect(probe()).toBe('disconnected|false|0|5');
  });

  it('derives isConnected from the state alone', () => {
    render(
      <SocketProvider config={config}>
        <StateProbe />
      </SocketProvider>,
    );
    emit('connected');
    expect(probe()?.split('|')[1]).toBe('true');
    emit('reconnecting', 1);
    expect(probe()?.split('|')[1]).toBe('false');
  });

  it('unsubscribes from state changes on unmount', () => {
    const view = render(
      <SocketProvider config={config}>
        <StateProbe />
      </SocketProvider>,
    );
    expect(listeners).toHaveLength(1);
    view.unmount();
    expect(listeners).toHaveLength(0);
    expect(manager.disconnect).toHaveBeenCalled();
  });
});
