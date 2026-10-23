'use client';

import React, { createContext, useContext, useEffect, useCallback, useRef, useState, ReactNode } from 'react';
import { Socket } from 'socket.io-client';
import {
  SocketManager,
  SocketConfig,
  SocketConnectionState,
  initializeSocketManager,
} from '@/services/socketManager';

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
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<SocketConnectionState>('idle');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Stable handler refs so the same function identity is used for on() and off().
  // Using refs avoids declaring the handlers as useCallback dependencies and
  // ensures off() can always remove exactly what on() registered.
  const handleConnect = useRef(() => setIsConnected(true));
  const handleDisconnect = useRef(() => setIsConnected(false));

  /**
   * Registers the connect/disconnect state handlers exactly once per manager.
   * Calls off() before on() so repeated invocations are idempotent.
   */
  const registerStateHandlers = useCallback((manager: SocketManager) => {
    manager.off('connect', handleConnect.current);
    manager.off('disconnect', handleDisconnect.current);
    manager.on('connect', handleConnect.current);
    manager.on('disconnect', handleDisconnect.current);
  }, []);

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
      setIsConnected(socketInstance.connected);
      registerStateHandlers(manager);
    }

    return () => {
      unsubscribeState();
      manager.disconnect();
    };
  }, [config, configKey, autoConnect, registerStateHandlers]);

  const connect = useCallback(() => {
    if (socketManager) {
      const socketInstance = socketManager.connect();
      setSocket(socketInstance);
      setIsConnected(socketInstance.connected);
      registerStateHandlers(socketManager);
    }
  }, [socketManager, registerStateHandlers]);

  const retry = () => {
    if (socketManager) {
      socketManager.retry();
      setSocket(socketManager.getSocket());
      registerStateHandlers(socketManager);
    }
  };

  const disconnect = () => {
    if (socketManager) {
      socketManager.disconnect();
      setSocket(null);
      setIsConnected(false);
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

export function useSocket(): SocketContextType {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
