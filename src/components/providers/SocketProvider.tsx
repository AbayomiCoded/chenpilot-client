'use client';

import React, { createContext, useContext, useEffect, useCallback, useState, ReactNode } from 'react';
import { Socket } from 'socket.io-client';
import {
  SocketManager,
  SocketConfig,
  initializeSocketManager,
} from '@/services/socketManager';
import {
  INITIAL_SOCKET_CONNECTION_STATE,
  isSocketConnected,
  type SocketConnectionState,
} from '@/types/socket';

interface SocketContextType {
  socket: Socket | null;
  socketManager: SocketManager | null;
  isConnected: boolean;
  connectionState: SocketConnectionState;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  retry: () => void;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data?: unknown) => boolean;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback?: (...args: unknown[]) => void) => void;
  once: (event: string, callback: (...args: unknown[]) => void) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
  config: SocketConfig;
  configKey?: string;
  autoConnect?: boolean;
}

export function SocketProvider({ children, config, configKey, autoConnect = true }: SocketProviderProps) {
  const [socketManager, setSocketManager] = useState<SocketManager | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<SocketConnectionState>(
    INITIAL_SOCKET_CONNECTION_STATE,
  );
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  // Derived from the single shared state, never tracked separately (#279).
  const isConnected = isSocketConnected(connectionState);

  useEffect(() => {
    const manager = initializeSocketManager(config);
    setSocketManager(manager);
    const unsubscribeState = manager.onStateChange((state, attempt) => {
      setConnectionState(state);
      setReconnectAttempt(attempt);
    });

    if (autoConnect) {
      const socketInstance = manager.connect();
      setSocket(socketInstance);
    }

    return () => {
      unsubscribeState();
      manager.disconnect();
    };
  }, [config, configKey, autoConnect]);

  const connect = useCallback(() => {
    if (socketManager) {
      const socketInstance = socketManager.connect();
      setSocket(socketInstance);
    }
  }, [socketManager]);

  const retry = () => {
    if (socketManager) {
      socketManager.retry();
      setSocket(socketManager.getSocket());
    }
  };

  const disconnect = () => {
    if (socketManager) {
      socketManager.disconnect();
      setSocket(null);
    }
  };

  const emit = (event: string, data?: unknown): boolean => {
    return socketManager?.emit(event, data) ?? false;
  };

  const on = (event: string, callback: (...args: unknown[]) => void) => {
    socketManager?.on(event, callback);
  };

  const off = (event: string, callback?: (...args: unknown[]) => void) => {
    socketManager?.off(event, callback);
  };

  const once = (event: string, callback: (...args: unknown[]) => void) => {
    socketManager?.once(event, callback);
  };

  const value: SocketContextType = {
    socket,
    socketManager,
    isConnected,
    connectionState,
    reconnectAttempt,
    maxReconnectAttempts: socketManager?.getMaxReconnectAttempts() ?? 0,
    retry,
    connect,
    disconnect,
    emit,
    on,
    off,
    once,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Like `useSocket`, but returns `undefined` outside a SocketProvider so status
 * UI that can render without a socket (e.g. OfflineIndicator) can opt in.
 */
export function useOptionalSocket(): SocketContextType | undefined {
  return useContext(SocketContext);
}

export function useSocket(): SocketContextType {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
