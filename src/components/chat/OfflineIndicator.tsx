'use client';

import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { setOnlineStatus, loadMessageQueue } from '@/store/slices/chatSlice';
import { WifiOff, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useOptionalSocket } from '@/components/providers/SocketProvider';
import { isSocketStatusVisible, type SocketConnectionState } from '@/types/socket';

/** Status-line copy for each visible socket state (#279). */
export function describeSocketState(
  state: SocketConnectionState,
  attempt = 0,
  maxAttempts = 0,
): string | null {
  switch (state) {
    case 'connecting':
      return 'Connecting to live updates…';
    case 'reconnecting':
      return maxAttempts > 0 && attempt > 0
        ? `Reconnecting to live updates (attempt ${attempt} of ${maxAttempts})…`
        : 'Reconnecting to live updates…';
    case 'exhausted':
      return 'Live updates unavailable • could not reconnect';
    case 'disconnected':
      return 'Live updates disconnected';
    default:
      return null;
  }
}

interface OfflineIndicatorProps {
  canRetry?: boolean;
  onRetry?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  canRetry = false,
  onRetry,
}) => {
  const dispatch = useAppDispatch();
  const { isOnline, messageQueue } = useAppSelector((state) => state.chat);
  const [connectionRestored, setConnectionRestored] = React.useState(false);
  const socket = useOptionalSocket();
  const socketState: SocketConnectionState = socket?.connectionState ?? 'unknown';
  const socketMessage = isSocketStatusVisible(socketState)
    ? describeSocketState(socketState, socket?.reconnectAttempt, socket?.maxReconnectAttempts)
    : null;
  const canRetrySocket =
    socket !== undefined && (socketState === 'exhausted' || socketState === 'disconnected');

  useEffect(() => {
    // Load queue on mount
    dispatch(loadMessageQueue());
    dispatch(setOnlineStatus(navigator.onLine));

    // Set up event listeners
    const handleOnline = () => {
      dispatch(setOnlineStatus(true));
      setConnectionRestored(true);
    };

    const handleOffline = () => {
      dispatch(setOnlineStatus(false));
      setConnectionRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [dispatch]);

  useEffect(() => {
    if (!connectionRestored || canRetry || messageQueue.length > 0) return;

    const timeout = window.setTimeout(() => setConnectionRestored(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [canRetry, connectionRestored, messageQueue.length]);

  if (isOnline && messageQueue.length === 0 && !connectionRestored && !socketMessage) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-20 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium z-40 transition-all duration-300 ${
        isOnline
          ? 'bg-blue-900/80 border border-blue-700 text-blue-200'
          : 'bg-red-900/80 border border-red-700 text-red-200 animate-pulse'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4" />
          <span>
            {messageQueue.length > 0
              ? `Online • ${messageQueue.length} message${messageQueue.length !== 1 ? 's' : ''} queued`
              : canRetry
                ? 'Connection restored • your changes are ready to retry'
                : connectionRestored
                  ? 'Connection restored'
                  : socketMessage}
          </span>
          {canRetrySocket && !connectionRestored && messageQueue.length === 0 && (
            <Button type="button" size="sm" variant="secondary" onClick={socket.retry}>
              Retry
            </Button>
          )}
          {connectionRestored && canRetry && onRetry && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onRetry}
            >
              Retry
            </Button>
          )}
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>
            You are offline • network actions are paused{messageQueue.length > 0
              ? ` • ${messageQueue.length} message${messageQueue.length !== 1 ? 's' : ''} queued`
              : ''}
          </span>
        </>
      )}
    </div>
  );
};
