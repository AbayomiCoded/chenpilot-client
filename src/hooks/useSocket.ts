import { useEffect, useRef } from 'react';
import { useSocket as useSocketContext } from '@/components/providers/SocketProvider';
import type { SocketConnectionState } from '@/services/socketManager';

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