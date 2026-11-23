// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineIndicator } from './OfflineIndicator';

const { dispatch, chat } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  chat: { isOnline: true, messageQueue: [] as Array<{ id: string; query: string }> },
}));

vi.mock('@/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: { chat: typeof chat }) => unknown) => selector({ chat }),
}));

vi.mock('@/store/slices/chatSlice', () => ({
  setOnlineStatus: (isOnline: boolean) => ({ type: 'chat/setOnlineStatus', payload: isOnline }),
  loadMessageQueue: () => ({ type: 'chat/loadMessageQueue' }),
}));

describe('OfflineIndicator connectivity recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chat.isOnline = true;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('shows offline status and provides a retry action after reconnecting', () => {
    const onRetry = vi.fn();
    const view = render(<OfflineIndicator canRetry onRetry={onRetry} />);

    fireEvent(window, new Event('offline'));
    chat.isOnline = false;
    view.rerender(<OfflineIndicator canRetry onRetry={onRetry} />);
    expect(screen.queryByText(/network actions are paused/)).not.toBeNull();

    fireEvent(window, new Event('online'));
    chat.isOnline = true;
    view.rerender(<OfflineIndicator canRetry onRetry={onRetry} />);
    expect(screen.queryByText(/your changes are ready to retry/)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
