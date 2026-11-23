// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocketConnectionState } from '@/types/socket';
import { OfflineIndicator, describeSocketState } from './OfflineIndicator';

const { dispatch, chat, socketContext } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  chat: { isOnline: true, messageQueue: [] as Array<{ id: string; query: string }> },
  socketContext: {
    current: undefined as
      | undefined
      | {
          connectionState: SocketConnectionState;
          reconnectAttempt: number;
          maxReconnectAttempts: number;
          retry: () => void;
        },
  },
}));

vi.mock('@/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: { chat: typeof chat }) => unknown) => selector({ chat }),
}));

vi.mock('@/store/slices/chatSlice', () => ({
  setOnlineStatus: (isOnline: boolean) => ({ type: 'chat/setOnlineStatus', payload: isOnline }),
  loadMessageQueue: () => ({ type: 'chat/loadMessageQueue' }),
}));

vi.mock('@/components/providers/SocketProvider', () => ({
  useOptionalSocket: () => socketContext.current,
}));

function withSocket(connectionState: SocketConnectionState, attempt = 0, retry = vi.fn()) {
  socketContext.current = {
    connectionState,
    reconnectAttempt: attempt,
    maxReconnectAttempts: 5,
    retry,
  };
  return retry;
}

describe('OfflineIndicator socket status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chat.isOnline = true;
    chat.messageQueue = [];
    socketContext.current = undefined;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('renders nothing outside a SocketProvider while online', () => {
    const { container } = render(<OfflineIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each<SocketConnectionState>(['idle', 'connected'])(
    'renders nothing for the %s state',
    (state) => {
      withSocket(state);
      const { container } = render(<OfflineIndicator />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('shows connecting and reconnecting progress', () => {
    withSocket('connecting');
    const view = render(<OfflineIndicator />);
    expect(screen.getByText('Connecting to live updates…')).toBeInTheDocument();

    withSocket('reconnecting', 2);
    view.rerender(<OfflineIndicator />);
    expect(screen.getByText('Reconnecting to live updates (attempt 2 of 5)…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('offers a retry when reconnection is exhausted', () => {
    const retry = withSocket('exhausted', 5);
    render(<OfflineIndicator />);
    expect(screen.getByText('Live updates unavailable • could not reconnect')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('offers a retry when the socket was disconnected', () => {
    const retry = withSocket('disconnected');
    render(<OfflineIndicator />);
    expect(screen.getByText('Live updates disconnected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('keeps the offline message when the browser is offline regardless of socket state', () => {
    chat.isOnline = false;
    withSocket('reconnecting', 1);
    render(<OfflineIndicator />);
    expect(screen.getByText(/network actions are paused/)).toBeInTheDocument();
  });

  it('describes every visible state and none for idle or connected', () => {
    expect(describeSocketState('idle')).toBeNull();
    expect(describeSocketState('connected')).toBeNull();
    expect(describeSocketState('reconnecting', 0, 0)).toBe('Reconnecting to live updates…');
  });
});
