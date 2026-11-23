'use client';

import React from 'react';
import { useOptionalSocket } from '@/components/providers/SocketProvider';
import type { SocketConnectionState } from '@/types/socket';

export const SocketStatusIndicator: React.FC = () => {
  const socket = useOptionalSocket();
  const state: SocketConnectionState = socket?.connectionState ?? 'idle';

  const getBadgeColor = () => {
    switch (state) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
      case 'reconnecting':
        return 'bg-yellow-500 animate-pulse';
      case 'exhausted':
      case 'failed':
      case 'disconnected':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs font-medium px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
      <span className={`w-2.5 h-2.5 rounded-full ${getBadgeColor()}`} />
      <span className="capitalize">{state}</span>
    </div>
  );
};
