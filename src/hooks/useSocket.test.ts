// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSocketEvent, useSocketConnection } from './useSocket';

type SocketClient = {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  connected: boolean;
};

interface MockContext {
  socket: SocketClient | null;
  isConnected: boolean;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
}

const createMockContext = (opts?: {
  socket?: SocketClient | null;
  on?: ReturnType<typeof vi.fn>;
  off?: ReturnType<typeof vi.fn>;
  isConnected?: boolean;
  connect?: ReturnType<typeof vi.fn>;
  disconnect?: ReturnType<typeof vi.fn>;
}): MockContext => {
  const isConnected = opts?.isConnected !== undefined ? opts.isConnected : opts?.socket?.connected || false;

  return {
    socket: opts?.socket || null,
    connect: opts?.connect || opts?.socket?.connect || vi.fn(),
    disconnect: opts?.disconnect || opts?.socket?.disconnect || vi.fn(),
    emit: vi.fn(),
    on: opts?.on || vi.fn(),
    off: opts?.off || vi.fn(),
    once: vi.fn(),
    isConnected,
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedSocketContext: any;

vi.mock('@/components/providers/SocketProvider', () => ({
  useSocket: () => capturedSocketContext,
}));

describe('useSocketEvent', () => {
  beforeEach(() => {
    capturedSocketContext = createMockContext({
      socket: {
        on: vi.fn(),
        off: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        connected: true,
      } as unknown as SocketClient,
      on: vi.fn(),
      off: vi.fn(),
    });
  });

  it('subscribes on mount and unsubscribes on unmount via stable listener', () => {
    const on = capturedSocketContext.on as ReturnType<typeof vi.fn>;
    const off = capturedSocketContext.off as ReturnType<typeof vi.fn>;

    const { unmount } = renderHook(() => useSocketEvent('message', vi.fn()));

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenNthCalledWith(1, 'message', expect.any(Function));

    unmount();

    expect(off).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenNthCalledWith(1, 'message', expect.any(Function));
  });

  it('does not unsubscribe/resubscribe when callback changes', () => {
    const on = capturedSocketContext.on as ReturnType<typeof vi.fn>;
    const off = capturedSocketContext.off as ReturnType<typeof vi.fn>;

    const { rerender } = renderHook(({ cb }) => useSocketEvent('message', cb), {
      initialProps: { cb: vi.fn() },
    });

    const listener1 = on.mock.calls[0][1] as (...args: unknown[]) => void;

    rerender({ cb: vi.fn() });

    // listener should be stable across rerenders
    const listener2 = on.mock.calls[0][1] as (...args: unknown[]) => void;
    expect(listener2).toBe(listener1);

    expect(on).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledTimes(0);
  });

  it('calls the latest callback via ref when event received', () => {
    const cb = vi.fn();
    const { rerender } = renderHook(({ eventCb }) => useSocketEvent('message', eventCb), {
      initialProps: { eventCb: cb },
    });

    const listener = (capturedSocketContext.on as ReturnType<typeof vi.fn>).mock.calls[0][1] as (...args: unknown[]) => void;

    listener('hello');

    expect(cb).toHaveBeenCalledWith('hello');

    const cb2 = vi.fn();
    rerender({ eventCb: cb2 });

    listener('world');

    expect(cb).toBeCalledTimes(1);
    expect(cb2).toBeCalledTimes(1);
  });

  it('cleans up event listeners on unmount', () => {
    const off = capturedSocketContext.off as ReturnType<typeof vi.fn>;

    const { unmount } = renderHook(() => useSocketEvent('message', vi.fn()));

    unmount();

    expect(off).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('handles socket disconnection during hook lifecycle', () => {
    const on = capturedSocketContext.on as ReturnType<typeof vi.fn>;

    const { rerender } = renderHook(() => useSocketEvent('message', vi.fn()));

    // Simulate socket disconnection
    capturedSocketContext = createMockContext({
      socket: null,
      on: vi.fn(),
      off: vi.fn(),
    });

    rerender();

    // Should not subscribe when socket is null
    expect(on).toHaveBeenCalledTimes(1); // Only initial subscription
  });

  it('resubscribes when socket reconnects after disconnection', () => {
    const on = capturedSocketContext.on as ReturnType<typeof vi.fn>;

    const { rerender } = renderHook(() => useSocketEvent('message', vi.fn()));

    // Simulate disconnection
    capturedSocketContext = createMockContext({
      socket: null,
      on: vi.fn(),
      off: vi.fn(),
    });

    rerender();

    const initialOnCalls = on.mock.calls.length;

    // Simulate reconnection
    capturedSocketContext = createMockContext({
      socket: {
        on: vi.fn(),
        off: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        connected: true,
      } as unknown as SocketClient,
      on: vi.fn(),
      off: vi.fn(),
    });

    rerender();

    // Should resubscribe on reconnection
    expect(on.mock.calls.length).toBeGreaterThan(initialOnCalls);
  });
});

describe('useSocketConnection', () => {
  it('returns connection controls', () => {
    const connect = vi.fn();
    const disconnect = vi.fn();
    capturedSocketContext = createMockContext({
      isConnected: true,
      connect,
      disconnect,
    });

    const { result } = renderHook(() => useSocketConnection());

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connect).toBe(connect);
    expect(result.current.disconnect).toBe(disconnect);
  });

  it('handles reconnection by updating connection state', () => {
    const connect = vi.fn();
    const disconnect = vi.fn();
    let isConnected = false;

    capturedSocketContext = createMockContext({
      isConnected,
      connect,
      disconnect,
    });

    const { result, rerender } = renderHook(() => useSocketConnection());

    expect(result.current.isConnected).toBe(false);

    // Simulate reconnection
    isConnected = true;
    capturedSocketContext = createMockContext({
      isConnected,
      connect,
      disconnect,
    });

    rerender();

    expect(result.current.isConnected).toBe(true);
  });

  it('properly cleans up on unmount', () => {
    const disconnect = vi.fn();
    capturedSocketContext = createMockContext({
      isConnected: true,
      disconnect,
    });

    const { unmount } = renderHook(() => useSocketConnection());

    unmount();

    // Verify disconnect is not called automatically - it's up to the consumer
    // to call disconnect when appropriate
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('maintains stable reference to connect/disconnect functions', () => {
    const connect = vi.fn();
    const disconnect = vi.fn();
    capturedSocketContext = createMockContext({
      isConnected: true,
      connect,
      disconnect,
    });

    const { result, rerender } = renderHook(() => useSocketConnection());

    const initialConnect = result.current.connect;
    const initialDisconnect = result.current.disconnect;

    // Simulate state change
    capturedSocketContext = createMockContext({
      isConnected: false,
      connect,
      disconnect,
    });

    rerender();

    // Functions should remain stable
    expect(result.current.connect).toBe(initialConnect);
    expect(result.current.disconnect).toBe(initialDisconnect);
  });

  it('handles rapid connection/disconnection cycles', () => {
    const connect = vi.fn();
    const disconnect = vi.fn();
    capturedSocketContext = createMockContext({
      isConnected: false,
      connect,
      disconnect,
    });

    const { result, rerender } = renderHook(() => useSocketConnection());

    // Rapid cycle: connect -> disconnect -> connect
    capturedSocketContext = createMockContext({
      isConnected: true,
      connect,
      disconnect,
    });
    rerender();

    capturedSocketContext = createMockContext({
      isConnected: false,
      connect,
      disconnect,
    });
    rerender();

    capturedSocketContext = createMockContext({
      isConnected: true,
      connect,
      disconnect,
    });
    rerender();

    expect(result.current.isConnected).toBe(true);
  });
});

describe('useSocket - Reconnection Scenarios', () => {
  beforeEach(() => {
    capturedSocketContext = createMockContext({
      socket: {
        on: vi.fn(),
        off: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        connected: true,
      } as unknown as SocketClient,
      on: vi.fn(),
      off: vi.fn(),
    });
  });

  it('handles reconnection after network failure', () => {
    const on = capturedSocketContext.on as ReturnType<typeof vi.fn>;

    const { rerender } = renderHook(() => useSocketEvent('message', vi.fn()));

    // Simulate network failure (socket disconnects)
    capturedSocketContext = createMockContext({
      socket: null,
      on: vi.fn(),
      off: vi.fn(),
    });
    rerender();

    const initialOffCalls = off.mock.calls.length;

    // Simulate reconnection
    capturedSocketContext = createMockContext({
      socket: {
        on: vi.fn(),
        off: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        connected: true,
      } as unknown as SocketClient,
      on: vi.fn(),
      off: vi.fn(),
    });
    rerender();

    // Should resubscribe after reconnection
    expect(on.mock.calls.length).toBeGreaterThan(initialOffCalls);
  });

  it('cleans up event listeners when socket disconnects', () => {
    const off = capturedSocketContext.off as ReturnType<typeof vi.fn>;

    const { rerender } = renderHook(() => useSocketEvent('message', vi.fn()));

    // Simulate disconnection
    capturedSocketContext = createMockContext({
      socket: null,
      on: vi.fn(),
      off: vi.fn(),
    });
    rerender();

    // Should unsubscribe when socket becomes null
    expect(off).toHaveBeenCalled();
  });

  it('handles multiple event subscriptions during reconnection', () => {
    const on = capturedSocketContext.on as ReturnType<typeof vi.fn>;

    const { rerender } = renderHook(() => {
      useSocketEvent('message', vi.fn());
      useSocketEvent('notification', vi.fn());
      useSocketEvent('status', vi.fn());
    });

    const initialOnCalls = on.mock.calls.length;

    // Simulate disconnection
    capturedSocketContext = createMockContext({
      socket: null,
      on: vi.fn(),
      off: vi.fn(),
    });
    rerender();

    // Simulate reconnection
    capturedSocketContext = createMockContext({
      socket: {
        on: vi.fn(),
        off: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        connected: true,
      } as unknown as SocketClient,
      on: vi.fn(),
      off: vi.fn(),
    });
    rerender();

    // All three events should be resubscribed
    expect(on.mock.calls.length).toBeGreaterThan(initialOnCalls);
  });

  it('maintains event listeners through temporary disconnections', () => {
    const on = capturedSocketContext.on as ReturnType<typeof vi.fn>;

    const { rerender } = renderHook(() => useSocketEvent('message', vi.fn()));

    // Simulate temporary disconnection
    capturedSocketContext = createMockContext({
      socket: null,
      on: vi.fn(),
      off: vi.fn(),
    });
    rerender();

    // Simulate reconnection
    capturedSocketContext = createMockContext({
      socket: {
        on: vi.fn(),
        off: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        connected: true,
      } as unknown as SocketClient,
      on: vi.fn(),
      off: vi.fn(),
    });
    rerender();

    // Should be subscribed after reconnection
    expect(on).toHaveBeenCalled();
  });
});

describe('useSocket - Cleanup Behaviour', () => {
  beforeEach(() => {
    capturedSocketContext = createMockContext({
      socket: {
        on: vi.fn(),
        off: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        connected: true,
      } as unknown as SocketClient,
      on: vi.fn(),
      off: vi.fn(),
    });
  });

  it('cleans up all event listeners on unmount', () => {
    const off = capturedSocketContext.off as ReturnType<typeof vi.fn>;

    const { unmount } = renderHook(() => {
      useSocketEvent('message', vi.fn());
      useSocketEvent('notification', vi.fn());
    });

    unmount();

    // Both events should be unsubscribed
    expect(off).toHaveBeenCalledTimes(2);
  });

  it('cleans up event listeners even when socket is null', () => {
    const { rerender, unmount } = renderHook(() => useSocketEvent('message', vi.fn()));

    // Simulate disconnection before unmount
    capturedSocketContext = createMockContext({
      socket: null,
      on: vi.fn(),
      off: vi.fn(),
    });
    rerender();

    // Should not throw when unmounting with null socket
    expect(() => unmount()).not.toThrow();
  });

  it('cleans up after multiple hook instances', () => {
    const off = capturedSocketContext.off as ReturnType<typeof vi.fn>;

    const { unmount: unmount1 } = renderHook(() => useSocketEvent('message', vi.fn()));
    const { unmount: unmount2 } = renderHook(() => useSocketEvent('notification', vi.fn()));

    unmount1();
    unmount2();

    // Both should have cleaned up
    expect(off).toHaveBeenCalledTimes(2);
  });

  it('handles cleanup during in-flight requests', () => {
    const off = capturedSocketContext.off as ReturnType<typeof vi.fn>;

    const { unmount } = renderHook(() => useSocketEvent('message', vi.fn()));

    // Unmount while socket is still connected
    unmount();

    // Should clean up even if events were fired
    expect(off).toHaveBeenCalled();
  });

  it('cleans up connection state on unmount', () => {
    const disconnect = vi.fn();
    capturedSocketContext = createMockContext({
      isConnected: true,
      disconnect,
    });

    const { unmount } = renderHook(() => useSocketConnection());

    unmount();

    // Verify disconnect is not called automatically (consumer controls this)
    expect(disconnect).not.toHaveBeenCalled();
  });
});

describe('useSocketConnection - reconnect/exhausted states (#276)', () => {
  it('exposes reconnecting state with attempt progress', () => {
    capturedSocketContext = {
      ...createMockContext({ isConnected: false }),
      connectionState: 'reconnecting',
      reconnectAttempt: 2,
      maxReconnectAttempts: 5,
      retry: vi.fn(),
    };

    const { result } = renderHook(() => useSocketConnection());

    expect(result.current.connectionState).toBe('reconnecting');
    expect(result.current.isReconnecting).toBe(true);
    expect(result.current.isExhausted).toBe(false);
    expect(result.current.reconnectAttempt).toBe(2);
    expect(result.current.maxReconnectAttempts).toBe(5);
  });

  it('exposes exhausted state and a retry action', () => {
    const retry = vi.fn();
    capturedSocketContext = {
      ...createMockContext({ isConnected: false }),
      connectionState: 'exhausted',
      reconnectAttempt: 5,
      maxReconnectAttempts: 5,
      retry,
    };

    const { result } = renderHook(() => useSocketConnection());

    expect(result.current.isExhausted).toBe(true);
    expect(result.current.isReconnecting).toBe(false);
    result.current.retry();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('reflects recovery when the provider reports connected again', () => {
    capturedSocketContext = {
      ...createMockContext({ isConnected: false }),
      connectionState: 'reconnecting',
      reconnectAttempt: 1,
    };
    const { result, rerender } = renderHook(() => useSocketConnection());
    expect(result.current.isReconnecting).toBe(true);

    capturedSocketContext = {
      ...createMockContext({ isConnected: true }),
      connectionState: 'connected',
      reconnectAttempt: 0,
    };
    rerender();

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.reconnectAttempt).toBe(0);
  });

  it('derives state from isConnected when the provider omits connectionState', () => {
    capturedSocketContext = createMockContext({ isConnected: true });
    const { result } = renderHook(() => useSocketConnection());
    expect(result.current.connectionState).toBe('connected');
  });
});

describe('useSocketResync (#277)', () => {
  it('reflects resync state from the socket manager and exposes resync()', async () => {
    const { act } = await import('@testing-library/react');
    const { useSocketResync } = await import('./useSocket');
    let notify: (s: unknown) => void = () => {};
    const manager = {
      getResyncState: vi.fn(() => ({ isResyncing: false, lastCursor: 'c1', lastResyncCount: 0, lastResyncAt: null, error: null })),
      onResyncStateChange: vi.fn((listener: (s: unknown) => void) => {
        notify = listener;
        return vi.fn();
      }),
      resyncMissedEvents: vi.fn().mockResolvedValue(3),
      setLastCursor: vi.fn(),
    };
    capturedSocketContext = { ...createMockContext(), socketManager: manager };

    const { result } = renderHook(() => useSocketResync());
    expect(result.current.lastCursor).toBe('c1');

    act(() => notify({ isResyncing: true, lastCursor: 'c1', lastResyncCount: 0, lastResyncAt: null, error: null }));
    expect(result.current.isResyncing).toBe(true);

    await expect(result.current.resync()).resolves.toBe(3);
  });

  it('is inert without a socket manager', async () => {
    const { useSocketResync } = await import('./useSocket');
    capturedSocketContext = createMockContext();
    const { result } = renderHook(() => useSocketResync());
    expect(result.current.isResyncing).toBe(false);
    await expect(result.current.resync()).resolves.toBe(0);
  });
});
