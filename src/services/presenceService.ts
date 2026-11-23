/**
 * Presence Service - Manages real-time user presence, lease expiry, and stale record recovery
 */

export type PresenceStatus = 'online' | 'away' | 'offline';

export interface UserPresence {
  userId: string;
  userName: string;
  status: PresenceStatus;
  lastSeen: string;
  conversationId?: string;
  /** Server-provided ISO-8601 timestamp or epoch ms when this presence lease expires. */
  expiresAt?: string | number;
  /** Server-provided relative lease duration in ms (independent of client wall clock). */
  leaseTtlMs?: number;
  /** Server-provided ISO-8601 timestamp or epoch ms when the payload was emitted. */
  serverTime?: string | number;
}

export interface PresenceListEnvelope {
  users: UserPresence[];
  serverTime?: string | number;
}

export type PresenceListPayload = UserPresence[] | PresenceListEnvelope;

export interface PresenceHeartbeatPayload {
  userId: string;
  lastSeen?: string;
  expiresAt?: string | number;
  leaseTtlMs?: number;
  serverTime?: string | number;
  status?: PresenceStatus;
}

export interface PresenceConfig {
  idleTimeout: number; // Time in ms before marking as away
  cleanupTimeout: number; // Time in ms before removing offline user
  leaseTimeout?: number; // Fallback lease duration in ms when server omits lease expiry
  sweepInterval?: number; // Interval in ms between stale lease sweeps
}

export const DEFAULT_LEASE_TIMEOUT_MS = 90 * 1000; // 90 seconds (3x 30s heartbeat)
export const DEFAULT_SWEEP_INTERVAL_MS = 15 * 1000; // 15 seconds

export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  idleTimeout: 5 * 60 * 1000, // 5 minutes
  cleanupTimeout: 30 * 60 * 1000, // 30 minutes
  leaseTimeout: DEFAULT_LEASE_TIMEOUT_MS,
  sweepInterval: DEFAULT_SWEEP_INTERVAL_MS,
};

export type MonotonicClock = () => number;

function defaultMonotonicNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Parse an ISO-8601 timestamp or epoch ms number into epoch ms.
 * Returns null for missing or invalid values.
 */
export function parseTimestampMs(value?: string | number | null): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export interface LeaseEvaluationOptions {
  /** Server reference timestamp (ISO-8601 or epoch ms) for the payload/envelope. */
  serverTime?: string | number;
  /** Estimated current server time in epoch ms derived from a monotonic anchor. */
  estimatedServerNowMs?: number | null;
  /** Fallback lease duration in ms when no explicit lease or server clock pair is provided. */
  fallbackLeaseMs?: number;
}

/**
 * Compute remaining lease duration in ms using only server-relative timestamps or
 * explicit TTLs. Never compares a server timestamp against the client's wall clock.
 */
export function computeRemainingLeaseMs(
  presence: UserPresence,
  options: LeaseEvaluationOptions = {},
): number {
  if (presence.status === 'offline') {
    return 0;
  }

  const fallbackLeaseMs = options.fallbackLeaseMs ?? DEFAULT_LEASE_TIMEOUT_MS;

  // 1. Explicit relative TTL from server — completely immune to clock skew.
  if (typeof presence.leaseTtlMs === 'number' && Number.isFinite(presence.leaseTtlMs)) {
    return presence.leaseTtlMs;
  }

  const expiresAtMs = parseTimestampMs(presence.expiresAt);
  const serverRefMs =
    parseTimestampMs(presence.serverTime) ??
    parseTimestampMs(options.serverTime) ??
    (typeof options.estimatedServerNowMs === 'number' &&
    Number.isFinite(options.estimatedServerNowMs)
      ? options.estimatedServerNowMs
      : null);

  // 2. Server expiresAt compared against server reference time.
  if (expiresAtMs !== null && serverRefMs !== null) {
    return expiresAtMs - serverRefMs;
  }

  const lastSeenMs = parseTimestampMs(presence.lastSeen);

  // 3. Server lastSeen compared against server reference time + fallback lease window.
  if (lastSeenMs !== null && serverRefMs !== null) {
    const ageMs = Math.max(0, serverRefMs - lastSeenMs);
    return fallbackLeaseMs - ageMs;
  }

  // 4. Server expiresAt compared against server lastSeen when serverTime is absent.
  if (expiresAtMs !== null && lastSeenMs !== null) {
    return expiresAtMs - lastSeenMs;
  }

  // 5. Fallback for legacy payloads lacking serverTime/lease fields:
  // anchor from local receipt time using a monotonic duration, never Date.now() vs lastSeen.
  return fallbackLeaseMs;
}

/**
 * Determine whether a presence record is already expired or offline using server timestamps
 * or lease expiry, without relying on client wall-clock assumptions.
 */
export function isPresenceExpired(
  presence: UserPresence,
  options: LeaseEvaluationOptions = {},
): boolean {
  if (!presence || !presence.userId || presence.status === 'offline') {
    return true;
  }
  return computeRemainingLeaseMs(presence, options) <= 0;
}

/**
 * Filter a list of presence records to only active, non-expired entries.
 */
export function filterActivePresences(
  presences: UserPresence[],
  options: LeaseEvaluationOptions = {},
): UserPresence[] {
  return presences.filter((presence) => !isPresenceExpired(presence, options));
}

/**
 * Validate whether an unknown socket payload has the minimum UserPresence shape.
 */
export function isUserPresencePayload(value: unknown): value is UserPresence {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === 'string' &&
    candidate.userId.length > 0 &&
    typeof candidate.userName === 'string' &&
    (candidate.status === 'online' ||
      candidate.status === 'away' ||
      candidate.status === 'offline') &&
    typeof candidate.lastSeen === 'string'
  );
}

/**
 * Normalize either a raw UserPresence[] or a { users, serverTime } envelope.
 */
export function normalizePresenceListPayload(
  payload: unknown,
): { users: UserPresence[]; serverTime?: string | number } | null {
  if (Array.isArray(payload)) {
    return {
      users: payload.filter(isUserPresencePayload),
    };
  }
  if (payload && typeof payload === 'object') {
    const envelope = payload as Record<string, unknown>;
    if (Array.isArray(envelope.users)) {
      const serverTime =
        typeof envelope.serverTime === 'string' || typeof envelope.serverTime === 'number'
          ? envelope.serverTime
          : undefined;
      return {
        users: envelope.users.filter(isUserPresencePayload),
        serverTime,
      };
    }
  }
  return null;
}

export class PresenceService {
  private userPresenceMap = new Map<string, UserPresence>();
  private leaseDeadlines = new Map<string, number>();
  private serverTimeAnchor: { serverMs: number; monotonicMs: number } | null = null;
  private activityTimers = new Map<string, NodeJS.Timeout>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();
  private monotonicNow: MonotonicClock;
  private callbacks = {
    onStatusChange: [] as Array<(presence: UserPresence) => void>,
    onUserJoin: [] as Array<(presence: UserPresence) => void>,
    onUserLeave: [] as Array<(userId: string) => void>,
  };

  constructor(monotonicNow: MonotonicClock = defaultMonotonicNow) {
    this.monotonicNow = monotonicNow;
  }

  /**
   * Anchor server time against the local monotonic clock so subsequent lease calculations
   * stay immune to client wall-clock skew and system clock jumps.
   */
  updateServerTimeAnchor(serverTime?: string | number): void {
    const serverMs = parseTimestampMs(serverTime);
    if (serverMs !== null) {
      this.serverTimeAnchor = {
        serverMs,
        monotonicMs: this.monotonicNow(),
      };
    }
  }

  /**
   * Estimate the current server time using the last observed server timestamp
   * plus elapsed monotonic time. Returns null if no server timestamp has been observed.
   */
  getEstimatedServerNowMs(): number | null {
    if (!this.serverTimeAnchor) {
      return null;
    }
    const elapsedMs = Math.max(0, this.monotonicNow() - this.serverTimeAnchor.monotonicMs);
    return this.serverTimeAnchor.serverMs + elapsedMs;
  }

  /**
   * Mark user as online (local presence tracking)
   */
  setUserOnline(
    userId: string,
    userName: string,
    conversationId?: string,
    config: PresenceConfig = DEFAULT_PRESENCE_CONFIG,
  ) {
    // Cancel existing timers
    this.cancelActivityTimer(userId);
    this.cancelCleanupTimer(userId);
    this.leaseDeadlines.delete(userId);

    // Check if this is a new user joining
    const isNewUser = !this.userPresenceMap.has(userId);

    const presence: UserPresence = {
      userId,
      userName,
      status: 'online',
      lastSeen: new Date().toISOString(),
      conversationId,
    };

    this.userPresenceMap.set(userId, presence);

    if (isNewUser) {
      this.callbacks.onUserJoin.forEach((cb) => cb(presence));
    } else {
      this.callbacks.onStatusChange.forEach((cb) => cb(presence));
    }

    // Set idle timeout to mark as away
    const idleTimer = setTimeout(() => {
      this.setUserAway(userId, config);
    }, config.idleTimeout);

    this.activityTimers.set(userId, idleTimer);
  }

  /**
   * Mark user as away after idle timeout
   */
  setUserAway(
    userId: string,
    config: PresenceConfig = DEFAULT_PRESENCE_CONFIG,
  ) {
    const presence = this.userPresenceMap.get(userId);
    if (!presence || presence.status === 'offline') {
      return;
    }

    presence.status = 'away';
    presence.lastSeen = new Date().toISOString();
    this.userPresenceMap.set(userId, presence);

    this.callbacks.onStatusChange.forEach((cb) => cb(presence));

    // Set cleanup timeout to remove after longer period
    const cleanupTimer = setTimeout(() => {
      this.setUserOffline(userId);
    }, config.cleanupTimeout);

    this.cleanupTimers.set(userId, cleanupTimer);
  }

  /**
   * Mark user as offline and remove from tracking
   */
  setUserOffline(userId: string) {
    const presence = this.userPresenceMap.get(userId);
    if (!presence) {
      return;
    }

    this.userPresenceMap.delete(userId);
    this.leaseDeadlines.delete(userId);
    this.cancelActivityTimer(userId);
    this.cancelCleanupTimer(userId);

    this.callbacks.onUserLeave.forEach((cb) => cb(userId));
  }

  /**
   * Activity detected - keep user online
   */
  recordActivity(userId: string, config: PresenceConfig = DEFAULT_PRESENCE_CONFIG) {
    const presence = this.userPresenceMap.get(userId);
    if (presence && presence.status !== 'offline') {
      // Reset idle timer
      this.cancelActivityTimer(userId);
      presence.status = 'online';
      presence.lastSeen = new Date().toISOString();

      const idleTimer = setTimeout(() => {
        this.setUserAway(userId, config);
      }, config.idleTimeout);

      this.activityTimers.set(userId, idleTimer);

      this.callbacks.onStatusChange.forEach((cb) => cb(presence));
    }
  }

  /**
   * Ingest a server-delivered presence update with lease/expiry validation.
   * Expired or offline records are rejected and removed if previously tracked.
   */
  upsertRemotePresence(
    presence: UserPresence,
    options: { serverTime?: string | number; leaseTimeout?: number } = {},
  ): UserPresence | null {
    const payloadServerTime = presence.serverTime ?? options.serverTime;
    if (payloadServerTime !== undefined) {
      this.updateServerTimeAnchor(payloadServerTime);
    }

    const remainingMs = computeRemainingLeaseMs(presence, {
      serverTime: options.serverTime,
      estimatedServerNowMs: this.getEstimatedServerNowMs(),
      fallbackLeaseMs: options.leaseTimeout ?? DEFAULT_LEASE_TIMEOUT_MS,
    });

    if (presence.status === 'offline' || remainingMs <= 0) {
      this.setUserOffline(presence.userId);
      return null;
    }

    this.cancelActivityTimer(presence.userId);
    this.cancelCleanupTimer(presence.userId);

    const isNewUser = !this.userPresenceMap.has(presence.userId);
    const stored: UserPresence = { ...presence };
    this.userPresenceMap.set(presence.userId, stored);
    this.leaseDeadlines.set(presence.userId, this.monotonicNow() + remainingMs);

    if (isNewUser) {
      this.callbacks.onUserJoin.forEach((cb) => cb(stored));
    } else {
      this.callbacks.onStatusChange.forEach((cb) => cb(stored));
    }

    return stored;
  }

  /**
   * Replace all tracked remote presence entries with a fresh server snapshot.
   * Filters out expired/offline records and removes users absent from the snapshot.
   */
  replaceRemotePresences(
    payload: PresenceListPayload,
    options: { leaseTimeout?: number } = {},
  ): UserPresence[] {
    const normalized = normalizePresenceListPayload(payload);
    if (!normalized) {
      return [];
    }

    if (normalized.serverTime !== undefined) {
      this.updateServerTimeAnchor(normalized.serverTime);
    }

    const activeUsers: UserPresence[] = [];
    const activeIds = new Set<string>();
    const fallbackLeaseMs = options.leaseTimeout ?? DEFAULT_LEASE_TIMEOUT_MS;

    for (const presence of normalized.users) {
      const payloadServerTime = presence.serverTime ?? normalized.serverTime;
      if (payloadServerTime !== undefined) {
        this.updateServerTimeAnchor(payloadServerTime);
      }

      const remainingMs = computeRemainingLeaseMs(presence, {
        serverTime: normalized.serverTime,
        estimatedServerNowMs: this.getEstimatedServerNowMs(),
        fallbackLeaseMs,
      });

      if (presence.status === 'offline' || remainingMs <= 0) {
        continue;
      }

      const stored: UserPresence = { ...presence };
      const isNewUser = !this.userPresenceMap.has(presence.userId);

      this.cancelActivityTimer(presence.userId);
      this.cancelCleanupTimer(presence.userId);
      this.userPresenceMap.set(presence.userId, stored);
      this.leaseDeadlines.set(presence.userId, this.monotonicNow() + remainingMs);

      activeIds.add(presence.userId);
      activeUsers.push(stored);

      if (isNewUser) {
        this.callbacks.onUserJoin.forEach((cb) => cb(stored));
      } else {
        this.callbacks.onStatusChange.forEach((cb) => cb(stored));
      }
    }

    // Remove users that were previously tracked but are missing or expired in the new snapshot
    for (const existingUserId of Array.from(this.userPresenceMap.keys())) {
      if (!activeIds.has(existingUserId)) {
        this.setUserOffline(existingUserId);
      }
    }

    return activeUsers;
  }

  /**
   * Renew a tracked user's lease upon receiving a heartbeat from the server.
   * Returns the updated presence, or null if the user is unknown or now expired.
   */
  recordHeartbeat(
    payload: PresenceHeartbeatPayload,
    options: { leaseTimeout?: number } = {},
  ): UserPresence | null {
    if (payload.serverTime !== undefined) {
      this.updateServerTimeAnchor(payload.serverTime);
    }

    const existing = this.userPresenceMap.get(payload.userId);
    if (!existing) {
      return null;
    }

    const updated: UserPresence = {
      ...existing,
      status: payload.status ?? existing.status,
      lastSeen: payload.lastSeen ?? existing.lastSeen,
      expiresAt: payload.expiresAt ?? existing.expiresAt,
      leaseTtlMs: payload.leaseTtlMs ?? existing.leaseTtlMs,
      serverTime: payload.serverTime ?? existing.serverTime,
    };

    const remainingMs = computeRemainingLeaseMs(updated, {
      serverTime: payload.serverTime,
      estimatedServerNowMs: this.getEstimatedServerNowMs(),
      fallbackLeaseMs: options.leaseTimeout ?? DEFAULT_LEASE_TIMEOUT_MS,
    });

    if (updated.status === 'offline' || remainingMs <= 0) {
      this.setUserOffline(payload.userId);
      return null;
    }

    this.userPresenceMap.set(payload.userId, updated);
    this.leaseDeadlines.set(payload.userId, this.monotonicNow() + remainingMs);
    this.callbacks.onStatusChange.forEach((cb) => cb(updated));
    return updated;
  }

  /**
   * Check whether a tracked user's monotonic lease deadline has elapsed.
   */
  isUserLeaseExpired(userId: string, nowMonotonic: number = this.monotonicNow()): boolean {
    const deadline = this.leaseDeadlines.get(userId);
    if (deadline === undefined) {
      return false;
    }
    return nowMonotonic >= deadline;
  }

  /**
   * Remove all tracked users whose presence leases have expired.
   * Returns the list of pruned user IDs.
   */
  pruneExpired(nowMonotonic: number = this.monotonicNow()): string[] {
    const expiredUserIds: string[] = [];

    for (const [userId, deadline] of Array.from(this.leaseDeadlines.entries())) {
      if (nowMonotonic >= deadline) {
        expiredUserIds.push(userId);
      }
    }

    for (const userId of expiredUserIds) {
      this.setUserOffline(userId);
    }

    return expiredUserIds;
  }

  /**
   * Get presence for specific user (excludes expired leases)
   */
  getPresence(userId: string): UserPresence | undefined {
    if (this.isUserLeaseExpired(userId)) {
      this.setUserOffline(userId);
      return undefined;
    }
    return this.userPresenceMap.get(userId);
  }

  /**
   * Get all online users (excludes expired leases)
   */
  getOnlineUsers(): UserPresence[] {
    this.pruneExpired();
    return Array.from(this.userPresenceMap.values()).filter(
      (p) => p.status === 'online',
    );
  }

  /**
   * Get all away users (excludes expired leases)
   */
  getAwayUsers(): UserPresence[] {
    this.pruneExpired();
    return Array.from(this.userPresenceMap.values()).filter(
      (p) => p.status === 'away',
    );
  }

  /**
   * Get all users (online and away, excludes expired leases)
   */
  getAllUsers(): UserPresence[] {
    this.pruneExpired();
    return Array.from(this.userPresenceMap.values());
  }

  /**
   * Get users in specific conversation (excludes expired leases)
   */
  getUsersInConversation(conversationId: string): UserPresence[] {
    this.pruneExpired();
    return Array.from(this.userPresenceMap.values()).filter(
      (p) => p.conversationId === conversationId && p.status !== 'offline',
    );
  }

  /**
   * Clear all presence data, timers, lease deadlines, and server clock anchor
   */
  clear() {
    this.userPresenceMap.clear();
    this.leaseDeadlines.clear();
    this.serverTimeAnchor = null;
    this.activityTimers.forEach((timer) => clearTimeout(timer));
    this.cleanupTimers.forEach((timer) => clearTimeout(timer));
    this.activityTimers.clear();
    this.cleanupTimers.clear();
  }

  private cancelActivityTimer(userId: string) {
    const timer = this.activityTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.activityTimers.delete(userId);
    }
  }

  private cancelCleanupTimer(userId: string) {
    const timer = this.cleanupTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(userId);
    }
  }

  onStatusChange(callback: (presence: UserPresence) => void): () => void {
    this.callbacks.onStatusChange.push(callback);
    return () => {
      this.callbacks.onStatusChange = this.callbacks.onStatusChange.filter(
        (cb) => cb !== callback,
      );
    };
  }

  onUserJoin(callback: (presence: UserPresence) => void): () => void {
    this.callbacks.onUserJoin.push(callback);
    return () => {
      this.callbacks.onUserJoin = this.callbacks.onUserJoin.filter(
        (cb) => cb !== callback,
      );
    };
  }

  onUserLeave(callback: (userId: string) => void): () => void {
    this.callbacks.onUserLeave.push(callback);
    return () => {
      this.callbacks.onUserLeave = this.callbacks.onUserLeave.filter(
        (cb) => cb !== callback,
      );
    };
  }
}

export const presenceService = new PresenceService();
