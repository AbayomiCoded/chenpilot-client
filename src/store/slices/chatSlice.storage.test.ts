// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistOfflineStorage } from './chatSlice';

describe('chat storage quota handling', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('removes expired queue entries before retrying a quota-exceeded write', () => {
    const expiredQueue = {
      id: 'expired',
      query: 'old queued message',
      timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const freshQueue = {
      id: 'fresh',
      query: 'new queued message',
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem('messageQueue', JSON.stringify([expiredQueue, freshQueue]));

    const originalSetItem = Storage.prototype.setItem;
    let quotaAttempted = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === 'messageQueue' && !quotaAttempted) {
        quotaAttempted = true;
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    const result = persistOfflineStorage('messageQueue', [freshQueue], 'queued message');

    expect(result).toBeNull();
    expect(JSON.parse(localStorage.getItem('messageQueue') || '[]')).toEqual([freshQueue]);
  });

  it('prunes only expired chat history entries without dropping fresh conversations', () => {
    const freshMessage = { id: 'fresh', timestamp: new Date().toISOString(), content: 'fresh' };
    const expiredMessage = {
      id: 'expired',
      timestamp: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      content: 'old',
    };
    localStorage.setItem('chat_history', JSON.stringify({
      active: [freshMessage],
      stale: [expiredMessage],
    }));

    const originalSetItem = Storage.prototype.setItem;
    let quotaAttempted = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === 'chat_history' && !quotaAttempted) {
        quotaAttempted = true;
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    const result = persistOfflineStorage('chat_history', {
      active: [freshMessage],
      stale: [expiredMessage],
    }, 'chat history');

    expect(result).toBeNull();
    expect(JSON.parse(localStorage.getItem('chat_history') || '{}')).toMatchObject({
      active: [freshMessage],
    });
    expect(JSON.parse(localStorage.getItem('chat_history') || '{}')).not.toHaveProperty('stale');
  });

  it('returns a user-facing error when the browser still refuses to store offline data', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    const result = persistOfflineStorage('chat_history', { thread: [] }, 'chat history');

    expect(result).toContain('browser storage is full');
  });
});
