import { io, Socket } from 'socket.io-client';
import type { SocketConnectionState } from '@/types/socket';


export interface MissedEventsPage {
  events: MissedEvent[];
  /** More events exist after this page. */
  hasMore?: boolean;
  /** Cursor to request the next page from; defaults to the last event's cursor. */
  nextCursor?: string;
}

/**
 * Default bounded reconnection policy. Delays follow socket.io's backoff:
 * `min(maxDelayMs, baseDelayMs * 2^(attempt - 1))` with ±`randomizationFactor` jitter,
 * giving roughly 1s, 2s, 4s, 8s, 16s (each ±50%) before giving up.
 */
export const RECONNECT_POLICY = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  randomizationFactor: 0.5,
  maxAttempts: 5,
  /** Hard ceiling for caller-supplied attempts; prevents unbounded retry storms. */
  maxAttemptsCap: 20,
} as const;

/**
 * Delay before reconnect `attempt` (1-based), matching socket.io-client's Backoff so the
 * documented bounds are testable. `random` is injectable for deterministic tests.
 */
export function computeReconnectDelay(
  attempt: number,
  options: { baseDelayMs?: number; maxDelayMs?: number; randomizationFactor?: number } = {},
  random: () => number = Math.random
): number {
  const base = options.baseDelayMs ?? RECONNECT_POLICY.baseDelayMs;
  const max = options.maxDelayMs ?? RECONNECT_POLICY.maxDelayMs;
  const factor = options.randomizationFactor ?? RECONNECT_POLICY.randomizationFactor;

  let ms = base * Math.pow(2, Math.max(0, attempt - 1));
  if (factor > 0) {
    const deviation = Math.floor(random() * factor * ms);
    ms = Math.floor(random() * 10) & 1 ? ms + deviation : ms - deviation;
  }
  return Math.min(ms, max) | 0;
}
export interface SocketConfig {
  url: string;
  options?: Record<string, unknown>;
  resync?: {
    events: string[];
    fetchMissed: (cursor: string | null) => Promise<unknown>;
  };
  }

export interface SocketResyncState {
  isResyncing: boolean;
  lastCursor: string | null;
  lastResyncCount: number;
  lastResyncAt: Date | null;
  error: string | null;
}

export class SocketManager {
  private socket: Socket | null = null;
  private config: SocketConfig;
  private connectionState: SocketConnectionState = 'idle';
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 5;
  private stateListeners: Array<(state: SocketConnectionState, attempt: number) => void> = [];

  constructor(config: SocketConfig) {
    this.config = config;
    const maxAttempts = config.options?.reconnectionAttempts;
    if (typeof maxAttempts === 'number') {
      this.maxReconnectAttempts = Math.min(Math.max(maxAttempts, 1), 20);
  }
    }

  public connect(): Socket {
    if (this.socket) {
      return this.socket;
    }
    this.setState('connecting', 0);
    this.socket = io(this.config.url, this.config.options);

    this.socket.on('connect', () => {
      this.reconnectAttempt = 0;
      this.setState('connected', 0);
      });

    this.socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        this.setState('disconnected', this.reconnectAttempt);
      } else {
        this.setState('reconnecting', this.reconnectAttempt);
      }
    });

    this.socket.on('reconnect_attempt', (attempt: number) => {
      this.reconnectAttempt = attempt;
      if (attempt >= this.maxReconnectAttempts) {
        this.setState('exhausted', attempt);
      } else {
        this.setState('reconnecting', attempt);
      }
    });

    this.socket.on('reconnect_failed', () => {
      this.setState('exhausted', this.reconnectAttempt);
    });

    this.socket.on('connect_error', () => {
      if (this.connectionState !== 'reconnecting' && this.connectionState !== 'exhausted') {
        this.setState('exhausted', this.reconnectAttempt);
        }
        });

    return this.socket;
    }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      }
    this.setState('disconnected', this.reconnectAttempt);
    }

  public retry(): void {
    this.reconnectAttempt = 0;
    this.setState('connecting', 0);
    if (this.socket) {
      this.socket.connect();
    } else {
      this.connect();
    }
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public getConnectionState(): SocketConnectionState {
    return this.connectionState;
  }

  public getMaxReconnectAttempts(): number {
    return this.maxReconnectAttempts;
  }

  public onStateChange(listener: (state: SocketConnectionState, attempt: number) => void): () => void {
    this.stateListeners.push(listener);
    listener(this.connectionState, this.reconnectAttempt);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener);
    };
  }

  private setState(state: SocketConnectionState, attempt: number): void {
    this.connectionState = state;
    this.reconnectAttempt = attempt;
    this.stateListeners.forEach((l) => l(state, attempt));
  }

  public emit(event: string, data?: unknown): boolean {
    if (this.socket && this.socket.connected) {
        this.socket.emit(event, data);
        return true;
      }
      return false;
    }

  public on(event: string, callback: (...args: unknown[]) => void): void {
    this.socket?.on(event, callback);
  }

  public off(event: string, callback?: (...args: unknown[]) => void): void {
    this.socket?.off(event, callback);
  }

  public once(event: string, callback: (...args: unknown[]) => void): void {
    this.socket?.once(event, callback);
    }

  public getResyncState(): SocketResyncState {
    return {
      isResyncing: false,
      lastCursor: null,
      lastResyncCount: 0,
      lastResyncAt: null,
      error: null,
    };
  }

  public onResyncStateChange(_listener: (state: SocketResyncState) => void): () => void {
    return () => {};
  }

  public resyncMissedEvents(): Promise<number> {
    return Promise.resolve(0);
    }

  public setLastCursor(_cursor: string | null): void {}
        }

let defaultManager: SocketManager | null = null;

export function initializeSocketManager(config: SocketConfig): SocketManager {
  if (!defaultManager) {
    defaultManager = new SocketManager(config);
  }
  return defaultManager;
}

export function getSocketManager(): SocketManager | null {
  return defaultManager;
  }
