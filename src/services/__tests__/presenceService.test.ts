import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PresenceService,
  presenceService,
  DEFAULT_PRESENCE_CONFIG,
  DEFAULT_LEASE_TIMEOUT_MS,
  computeRemainingLeaseMs,
  isPresenceExpired,
  filterActivePresences,
  type UserPresence,
} from '../presenceService';

describe('PresenceService', () => {
  beforeEach(() => {
    presenceService.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    presenceService.clear();
    vi.useRealTimers();
  });

  describe('setUserOnline', () => {
    it('marks user as online', () => {
      presenceService.setUserOnline('user1', 'Test User');
      const presence = presenceService.getPresence('user1');
      expect(presence?.status).toBe('online');
    });

    it('triggers onUserJoin callback for new user', () => {
      const callback = vi.fn();
      presenceService.onUserJoin(callback);
      presenceService.setUserOnline('user1', 'Test User');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('triggers onStatusChange callback for existing user', () => {
      presenceService.setUserOnline('user1', 'Test User');
      const callback = vi.fn();
      presenceService.onStatusChange(callback);
      presenceService.setUserOnline('user1', 'Test User');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does not trigger onUserJoin for existing user', () => {
      const joinCallback = vi.fn();
      presenceService.onUserJoin(joinCallback);
      presenceService.setUserOnline('user1', 'Test User');
      presenceService.setUserOnline('user1', 'Test User');
      expect(joinCallback).toHaveBeenCalledTimes(1);
    });

    it('sets idle timeout for user', () => {
      presenceService.setUserOnline('user1', 'Test User');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      const presence = presenceService.getPresence('user1');
      expect(presence?.status).toBe('away');
    });

    it('cancels existing timers when setting user online again', () => {
      presenceService.setUserOnline('user1', 'Test User');
      presenceService.setUserOnline('user1', 'Test User');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      const presence = presenceService.getPresence('user1');
      expect(presence?.status).toBe('away');
    });

    it('stores conversation ID when provided', () => {
      presenceService.setUserOnline('user1', 'Test User', 'conv123');
      const presence = presenceService.getPresence('user1');
      expect(presence?.conversationId).toBe('conv123');
    });
  });

  describe('setUserAway', () => {
    it('marks user as away', () => {
      presenceService.setUserOnline('user1', 'Test User');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      const presence = presenceService.getPresence('user1');
      expect(presence?.status).toBe('away');
    });

    it('does not mark offline user as away', () => {
      presenceService.setUserOnline('user1', 'Test User');
      presenceService.setUserOffline('user1');
      presenceService.setUserAway('user1');
      const presence = presenceService.getPresence('user1');
      expect(presence).toBeUndefined();
    });

    it('triggers onStatusChange callback', () => {
      presenceService.setUserOnline('user1', 'Test User');
      const callback = vi.fn();
      presenceService.onStatusChange(callback);
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      expect(callback).toHaveBeenCalled();
    });

    it('sets cleanup timeout for offline removal', () => {
      presenceService.setUserOnline('user1', 'Test User');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.cleanupTimeout);
      const presence = presenceService.getPresence('user1');
      expect(presence).toBeUndefined();
    });
  });

  describe('setUserOffline', () => {
    it('removes user from presence map', () => {
      presenceService.setUserOnline('user1', 'Test User');
      presenceService.setUserOffline('user1');
      const presence = presenceService.getPresence('user1');
      expect(presence).toBeUndefined();
    });

    it('triggers onUserLeave callback', () => {
      presenceService.setUserOnline('user1', 'Test User');
      const callback = vi.fn();
      presenceService.onUserLeave(callback);
      presenceService.setUserOffline('user1');
      expect(callback).toHaveBeenCalledWith('user1');
    });

    it('cancels activity and cleanup timers', () => {
      presenceService.setUserOnline('user1', 'Test User');
      presenceService.setUserOffline('user1');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.cleanupTimeout);
      const presence = presenceService.getPresence('user1');
      expect(presence).toBeUndefined();
    });

    it('does nothing if user not present', () => {
      const callback = vi.fn();
      presenceService.onUserLeave(callback);
      presenceService.setUserOffline('nonexistent');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('recordActivity', () => {
    it('resets user to online status', () => {
      presenceService.setUserOnline('user1', 'Test User');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      expect(presenceService.getPresence('user1')?.status).toBe('away');
      presenceService.recordActivity('user1');
      expect(presenceService.getPresence('user1')?.status).toBe('online');
    });

    it('resets idle timer', () => {
      presenceService.setUserOnline('user1', 'Test User');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout / 2);
      presenceService.recordActivity('user1');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout / 2);
      expect(presenceService.getPresence('user1')?.status).toBe('online');
    });

    it('triggers onStatusChange callback', () => {
      presenceService.setUserOnline('user1', 'Test User');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      const callback = vi.fn();
      presenceService.onStatusChange(callback);
      presenceService.recordActivity('user1');
      expect(callback).toHaveBeenCalled();
    });

    it('does nothing for offline user', () => {
      presenceService.setUserOnline('user1', 'Test User');
      presenceService.setUserOffline('user1');
      const callback = vi.fn();
      presenceService.onStatusChange(callback);
      presenceService.recordActivity('user1');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getPresence', () => {
    it('returns presence for existing user', () => {
      presenceService.setUserOnline('user1', 'Test User');
      const presence = presenceService.getPresence('user1');
      expect(presence).toBeDefined();
      expect(presence?.userId).toBe('user1');
    });

    it('returns undefined for non-existent user', () => {
      const presence = presenceService.getPresence('nonexistent');
      expect(presence).toBeUndefined();
    });
  });

  describe('getOnlineUsers', () => {
    it('returns only online users', () => {
      presenceService.setUserOnline('user1', 'User 1');
      presenceService.setUserOnline('user2', 'User 2');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      const onlineUsers = presenceService.getOnlineUsers();
      expect(onlineUsers).toHaveLength(0);
    });

    it('returns empty array when no users online', () => {
      const onlineUsers = presenceService.getOnlineUsers();
      expect(onlineUsers).toEqual([]);
    });

    it('excludes away users', () => {
      presenceService.setUserOnline('user1', 'User 1');
      presenceService.setUserOnline('user2', 'User 2');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      const onlineUsers = presenceService.getOnlineUsers();
      expect(onlineUsers).toHaveLength(0);
    });
  });

  describe('getAwayUsers', () => {
    it('returns only away users', () => {
      presenceService.setUserOnline('user1', 'User 1');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      const awayUsers = presenceService.getAwayUsers();
      expect(awayUsers).toHaveLength(1);
      expect(awayUsers[0].status).toBe('away');
    });

    it('returns empty array when no users away', () => {
      presenceService.setUserOnline('user1', 'User 1');
      const awayUsers = presenceService.getAwayUsers();
      expect(awayUsers).toEqual([]);
    });
  });

  describe('getAllUsers', () => {
    it('returns all tracked users', () => {
      presenceService.setUserOnline('user1', 'User 1');
      presenceService.setUserOnline('user2', 'User 2');
      const allUsers = presenceService.getAllUsers();
      expect(allUsers).toHaveLength(2);
    });

    it('returns empty array when no users tracked', () => {
      const allUsers = presenceService.getAllUsers();
      expect(allUsers).toEqual([]);
    });
  });

  describe('getUsersInConversation', () => {
    it('returns users in specific conversation', () => {
      presenceService.setUserOnline('user1', 'User 1', 'conv1');
      presenceService.setUserOnline('user2', 'User 2', 'conv2');
      presenceService.setUserOnline('user3', 'User 3', 'conv1');
      const usersInConv1 = presenceService.getUsersInConversation('conv1');
      expect(usersInConv1).toHaveLength(2);
    });

    it('excludes offline users from conversation', () => {
      presenceService.setUserOnline('user1', 'User 1', 'conv1');
      presenceService.setUserOnline('user2', 'User 2', 'conv1');
      presenceService.setUserOffline('user1');
      const usersInConv1 = presenceService.getUsersInConversation('conv1');
      expect(usersInConv1).toHaveLength(1);
    });

    it('returns empty array for non-existent conversation', () => {
      const usersInConv = presenceService.getUsersInConversation('nonexistent');
      expect(usersInConv).toEqual([]);
    });
  });

  describe('clear', () => {
    it('clears all presence data', () => {
      presenceService.setUserOnline('user1', 'User 1');
      presenceService.setUserOnline('user2', 'User 2');
      presenceService.clear();
      expect(presenceService.getAllUsers()).toHaveLength(0);
    });

    it('clears all timers', () => {
      presenceService.setUserOnline('user1', 'User 1');
      presenceService.clear();
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.cleanupTimeout);
      expect(presenceService.getAllUsers()).toHaveLength(0);
    });
  });

  describe('callback registration', () => {
    it('onStatusChange registers callback', () => {
      const callback = vi.fn();
      const unregister = presenceService.onStatusChange(callback);
      presenceService.setUserOnline('user1', 'User 1');
      presenceService.recordActivity('user1');
      expect(callback).toHaveBeenCalled();
      unregister();
    });

    it('onUserJoin registers callback', () => {
      const callback = vi.fn();
      const unregister = presenceService.onUserJoin(callback);
      presenceService.setUserOnline('user1', 'User 1');
      expect(callback).toHaveBeenCalled();
      unregister();
    });

    it('onUserLeave registers callback', () => {
      const callback = vi.fn();
      const unregister = presenceService.onUserLeave(callback);
      presenceService.setUserOnline('user1', 'User 1');
      presenceService.setUserOffline('user1');
      expect(callback).toHaveBeenCalledWith('user1');
      unregister();
    });

    it('unregister removes callback', () => {
      const callback = vi.fn();
      const unregister = presenceService.onStatusChange(callback);
      unregister();
      presenceService.setUserOnline('user1', 'User 1');
      presenceService.recordActivity('user1');
      expect(callback).not.toHaveBeenCalled();
    });

    it('multiple callbacks are all triggered', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      presenceService.onStatusChange(callback1);
      presenceService.onStatusChange(callback2);
      presenceService.setUserOnline('user1', 'User 1');
      presenceService.recordActivity('user1');
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles rapid status changes', () => {
      presenceService.setUserOnline('user1', 'User 1');
      for (let i = 0; i < 10; i++) {
        presenceService.recordActivity('user1');
      }
      const presence = presenceService.getPresence('user1');
      expect(presence?.status).toBe('online');
    });

    it('handles multiple users with same status changes', () => {
      const users = ['user1', 'user2', 'user3'];
      users.forEach((userId) => presenceService.setUserOnline(userId, `User ${userId}`));
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      const awayUsers = presenceService.getAwayUsers();
      expect(awayUsers).toHaveLength(3);
    });

    it('handles cleanup timeout correctly', () => {
      presenceService.setUserOnline('user1', 'User 1');
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.idleTimeout);
      vi.advanceTimersByTime(DEFAULT_PRESENCE_CONFIG.cleanupTimeout);
      const presence = presenceService.getPresence('user1');
      expect(presence).toBeUndefined();
    });

    it('handles user with no conversation ID', () => {
      presenceService.setUserOnline('user1', 'User 1');
      const presence = presenceService.getPresence('user1');
      expect(presence?.conversationId).toBeUndefined();
    });
  });

  describe('lease expiry and stale presence recovery (#287)', () => {
    it('computes remaining lease from server expiresAt and serverTime regardless of skewed client clock', () => {
      // Simulate a client wall clock skewed 5 years into the future
      vi.setSystemTime(new Date('2031-06-15T00:00:00.000Z'));

      const record: UserPresence = {
        userId: 'user-skew',
        userName: 'Skewed Client',
        status: 'online',
        lastSeen: '2026-10-19T12:00:00.000Z',
        serverTime: '2026-10-19T12:00:10.000Z',
        expiresAt: '2026-10-19T12:01:10.000Z',
      };

      expect(computeRemainingLeaseMs(record)).toBe(60_000);
      expect(isPresenceExpired(record)).toBe(false);
    });

    it('treats records with expiresAt <= serverTime as expired even when client clock is in the past', () => {
      // Simulate a client wall clock skewed 5 years into the past
      vi.setSystemTime(new Date('2021-01-01T00:00:00.000Z'));

      const expiredRecord: UserPresence = {
        userId: 'user-expired',
        userName: 'Expired User',
        status: 'online',
        lastSeen: '2026-10-19T11:58:00.000Z',
        serverTime: '2026-10-19T12:01:00.000Z',
        expiresAt: '2026-10-19T12:00:00.000Z',
      };

      expect(computeRemainingLeaseMs(expiredRecord)).toBe(-60_000);
      expect(isPresenceExpired(expiredRecord)).toBe(true);
    });

    it('supports explicit relative leaseTtlMs without client clock assumptions', () => {
      vi.setSystemTime(new Date('2035-01-01T00:00:00.000Z'));

      const active: UserPresence = {
        userId: 'user-ttl',
        userName: 'TTL User',
        status: 'online',
        lastSeen: '2026-10-19T12:00:00.000Z',
        leaseTtlMs: 45_000,
      };
      const expired: UserPresence = {
        userId: 'user-ttl-expired',
        userName: 'Expired TTL User',
        status: 'online',
        lastSeen: '2026-10-19T12:00:00.000Z',
        leaseTtlMs: 0,
      };

      expect(computeRemainingLeaseMs(active)).toBe(45_000);
      expect(isPresenceExpired(active)).toBe(false);
      expect(isPresenceExpired(expired)).toBe(true);
    });

    it('filters expired and offline records in filterActivePresences using envelope serverTime', () => {
      const serverTime = '2026-10-19T12:00:00.000Z';
      const records: UserPresence[] = [
        {
          userId: 'active-1',
          userName: 'Active',
          status: 'online',
          lastSeen: '2026-10-19T11:59:50.000Z',
          expiresAt: '2026-10-19T12:01:00.000Z',
        },
        {
          userId: 'expired-1',
          userName: 'Expired',
          status: 'online',
          lastSeen: '2026-10-19T11:55:00.000Z',
          expiresAt: '2026-10-19T11:59:00.000Z',
        },
        {
          userId: 'offline-1',
          userName: 'Offline',
          status: 'offline',
          lastSeen: '2026-10-19T11:59:55.000Z',
          expiresAt: '2026-10-19T12:05:00.000Z',
        },
      ];

      const filtered = filterActivePresences(records, { serverTime });
      expect(filtered.map((u) => u.userId)).toEqual(['active-1']);
    });

    it('prunes stale remote users on a monotonic clock after abrupt disconnect', () => {
      let monotonic = 1_000;
      const service = new PresenceService(() => monotonic);
      const onLeave = vi.fn();
      service.onUserLeave(onLeave);

      // Client wall clock jumps wildly — should have zero effect on monotonic lease expiry
      vi.setSystemTime(new Date('2032-01-01T00:00:00.000Z'));

      service.upsertRemotePresence({
        userId: 'remote-1',
        userName: 'Remote User',
        status: 'online',
        lastSeen: '2026-10-19T12:00:00.000Z',
        serverTime: '2026-10-19T12:00:00.000Z',
        expiresAt: '2026-10-19T12:00:30.000Z',
      });

      expect(service.getPresence('remote-1')).toBeDefined();

      // Advance 29s monotonically — still active
      monotonic += 29_000;
      expect(service.pruneExpired()).toEqual([]);
      expect(service.getOnlineUsers()).toHaveLength(1);

      // Advance past 30s lease — pruned as stale
      monotonic += 1_000;
      expect(service.pruneExpired()).toEqual(['remote-1']);
      expect(service.getPresence('remote-1')).toBeUndefined();
      expect(service.getOnlineUsers()).toHaveLength(0);
      expect(onLeave).toHaveBeenCalledWith('remote-1');
    });

    it('renews lease deadline when recordHeartbeat is received', () => {
      let monotonic = 1_000;
      const service = new PresenceService(() => monotonic);

      service.upsertRemotePresence({
        userId: 'remote-hb',
        userName: 'Heartbeat User',
        status: 'online',
        lastSeen: '2026-10-19T12:00:00.000Z',
        leaseTtlMs: 30_000,
      });

      monotonic += 25_000;
      service.recordHeartbeat({
        userId: 'remote-hb',
        lastSeen: '2026-10-19T12:00:25.000Z',
        leaseTtlMs: 30_000,
      });

      // 20s later (45s total, beyond original 30s) — still alive thanks to heartbeat
      monotonic += 20_000;
      expect(service.pruneExpired()).toEqual([]);
      expect(service.getPresence('remote-hb')).toBeDefined();

      // 10s later (30s after heartbeat) — now expires
      monotonic += 10_000;
      expect(service.pruneExpired()).toEqual(['remote-hb']);
      expect(service.getPresence('remote-hb')).toBeUndefined();
    });

    it('replaces snapshot on replaceRemotePresences, filtering expired entries and removing absent users', () => {
      const monotonic = 5_000;
      const service = new PresenceService(() => monotonic);
      const onLeave = vi.fn();
      service.onUserLeave(onLeave);

      service.upsertRemotePresence({
        userId: 'stale-user',
        userName: 'Stale',
        status: 'online',
        lastSeen: '2026-10-19T11:50:00.000Z',
        leaseTtlMs: 60_000,
      });

      const active = service.replaceRemotePresences({
        serverTime: '2026-10-19T12:00:00.000Z',
        users: [
          {
            userId: 'fresh-user',
            userName: 'Fresh',
            status: 'online',
            lastSeen: '2026-10-19T11:59:55.000Z',
            expiresAt: '2026-10-19T12:01:00.000Z',
          },
          {
            userId: 'already-expired',
            userName: 'Old',
            status: 'away',
            lastSeen: '2026-10-19T11:50:00.000Z',
            expiresAt: '2026-10-19T11:59:00.000Z',
          },
        ],
      });

      expect(active.map((u) => u.userId)).toEqual(['fresh-user']);
      expect(service.getAllUsers().map((u) => u.userId)).toEqual(['fresh-user']);
      expect(onLeave).toHaveBeenCalledWith('stale-user');
    });

    it('anchors legacy payloads without serverTime/expiresAt using fallback monotonic lease', () => {
      let monotonic = 10_000;
      const service = new PresenceService(() => monotonic);

      // Even if client wall clock is wildly skewed vs legacy lastSeen, do not immediately expire
      vi.setSystemTime(new Date('2035-01-01T00:00:00.000Z'));

      service.upsertRemotePresence({
        userId: 'legacy-user',
        userName: 'Legacy',
        status: 'online',
        lastSeen: '2026-10-19T12:00:00.000Z',
      });

      expect(service.getPresence('legacy-user')).toBeDefined();

      monotonic += DEFAULT_LEASE_TIMEOUT_MS;
      expect(service.pruneExpired()).toEqual(['legacy-user']);
      expect(service.getPresence('legacy-user')).toBeUndefined();
    });
  });
});
