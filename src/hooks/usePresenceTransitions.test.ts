import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/store', () => ({ useAppDispatch: () => vi.fn(), useAppSelector: vi.fn() }));
vi.mock('@/components/providers/SocketProvider', () => ({ useSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }) }));

import { createPresenceTransitionScheduler } from './usePresenceManagement';

describe('createPresenceTransitionScheduler (#288)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses repeated transitions into the final state', () => {
    const send = vi.fn();
    const s = createPresenceTransitionScheduler(send, 2000);
    s.schedule('away');
    s.schedule('online');
    s.schedule('away');
    vi.advanceTimersByTime(2000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('away');
  });

  it('sends offline immediately and cancels a pending update', () => {
    const send = vi.fn();
    const s = createPresenceTransitionScheduler(send, 2000);
    s.schedule('online');
    s.schedule('offline');
    expect(send).toHaveBeenCalledWith('offline');
    vi.advanceTimersByTime(2000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('skips repeating the last sent status', () => {
    const send = vi.fn();
    const s = createPresenceTransitionScheduler(send, 2000);
    s.schedule('online');
    vi.advanceTimersByTime(2000);
    s.schedule('online');
    vi.advanceTimersByTime(2000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('dispose cancels pending updates', () => {
    const send = vi.fn();
    const s = createPresenceTransitionScheduler(send, 2000);
    s.schedule('away');
    s.dispose();
    vi.advanceTimersByTime(2000);
    expect(send).not.toHaveBeenCalled();
  });
});
