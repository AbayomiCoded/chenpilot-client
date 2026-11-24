import { useEffect, useRef, useState } from 'react';
import { useSocket as useSocketContext } from '@/components/providers/SocketProvider';
import type { SocketConnectionState, SocketResyncState } from '@/services/socketManager';

/**
 * Access the Socket.IO context, connection state, and event helpers (`emit`, `on`, `off`, `once`).
 * When using `on()` directly, callers must pass the same handler reference to `off(event, handler)`
 * during cleanup. See `src/services/README.md` for the full socket event contract.
 */
export function useSocket() {
  const context = useSocketContext();
  const connectionState: SocketConnectionState =
    context.connectionState ?? (context.isConnected ? 'connected' : 'disconnected');

  return {
    socket: context.socket,
    socketManager: context.socketManager,
    isConnected: context.isConnected,
    connectionState,
    isReconnecting: connectionState === 'reconnecting',
    isExhausted: connectionState === 'exhausted',
    reconnectAttempt: context.reconnectAttempt ?? 0,
    maxReconnectAttempts: context.maxReconnectAttempts ?? 0,
    retry: context.retry,
    connect: context.connect,
    disconnect: context.disconnect,
    emit: context.emit,
    on: context.on,
    off: context.off,
    once: context.once,
  };
}

/**
 * Subscribe to a Socket.IO event with automatic cleanup on unmount or socket/event change.
 * Uses a ref-backed stable listener so inline callbacks do not trigger resubscriptions.
 */
export function useSocketEvent(event: string, callback: (...args: unknown[]) => void) {
  const { socket, on, off } = useSocket();
  const callbackRef = useRef(callback);

  // Keep ref updated with latest callback
  useEffect(() => {
    callbackRef.current = callback;
  });

  // Stable listener function that delegates to the ref
  const stableListener = (...args: unknown[]) => {
    callbackRef.current(...args);
  };

  useEffect(() => {
    if (socket) {
      on(event, stableListener);
      
      return () => {
        off(event, stableListener);
      };
    }
  }, [socket, event, on, off]);
}

export function useSocketConnection() {
  const {
    isConnected,
    connectionState,
    isReconnecting,
    isExhausted,
    reconnectAttempt,
    maxReconnectAttempts,
    retry,
    connect,
    disconnect,
  } = useSocket();

  return {
    isConnected,
    connectionState,
    isReconnecting,
    isExhausted,
    reconnectAttempt,
    maxReconnectAttempts,
    retry,
    connect,
    disconnect,
  };
}

const IDLE_RESYNC_STATE: SocketResyncState = {
  isResyncing: false,
  lastCursor: null,
  lastResyncCount: 0,
  lastResyncAt: null,
  error: null,
};

/**
 * Post-reconnect resync status (#277): whether missed events are being fetched, the last
 * acknowledged cursor, and a manual `resync()` trigger.
 */
export function useSocketResync() {
  const { socketManager } = useSocket();
  const [state, setState] = useState<SocketResyncState>(
    () => socketManager?.getResyncState?.() ?? IDLE_RESYNC_STATE
  );

  useEffect(() => {
    if (!socketManager?.onResyncStateChange) return;
    setState(socketManager.getResyncState());
    return socketManager.onResyncStateChange(setState);
  }, [socketManager]);

  return {
    ...state,
    resync: () => socketManager?.resyncMissedEvents() ?? Promise.resolve(0),
    setLastCursor: (cursor: string | null) => socketManager?.setLastCursor(cursor),
  };
}
