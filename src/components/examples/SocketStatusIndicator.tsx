'use client';

import React from 'react';
import { useSocketConnection } from '@/hooks/useSocket';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export function SocketStatusIndicator() {
  const { isConnected, isReconnecting, isExhausted, reconnectAttempt, maxReconnectAttempts, retry } =
    useSocketConnection();

  return (
    <div className="flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium">
      {isConnected ? (
        <>
          <Wifi className="w-4 h-4 text-green-500" />
          <span className="text-green-500">Connected</span>
        </>
      ) : isReconnecting ? (
        <>
          <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />
          <span className="text-yellow-500">
            Reconnecting{reconnectAttempt > 0 ? ` (${reconnectAttempt}/${maxReconnectAttempts})` : '…'}
          </span>
        </>
      ) : isExhausted ? (
        <>
          <WifiOff className="w-4 h-4 text-red-500" />
          <span className="text-red-500">Connection lost</span>
          <button type="button" onClick={retry} className="underline text-red-500">
            Retry
          </button>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-red-500" />
          <span className="text-red-500">Disconnected</span>
        </>
      )}
    </div>
  );
}
