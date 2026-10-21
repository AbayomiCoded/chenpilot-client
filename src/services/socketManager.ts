import { io, Socket } from 'socket.io-client';
import { logger } from "../utils/logger";

export interface SocketConfig {
  url: string;
  options?: {
    transports?: ('polling' | 'websocket')[];
    autoConnect?: boolean;
    reconnection?: boolean;
    reconnectionDelay?: number;
    reconnectionDelayMax?: number;
    randomizationFactor?: number;
    reconnectionAttempts?: number;
    timeout?: number;
  };
  queueEnabled?: boolean;
  maxQueueSize?: number;
}

interface QueuedEvent {
  event: string;
  data?: unknown;
}
type SocketEventHandler = (...args: unknown[]) => void;

/**
 * Reconnection lifecycle exposed to the UI (#276).
 * - `idle`: never connected
 * - `connecting`: initial connect or manual retry in flight
 * - `connected`: socket is open
 * - `reconnecting`: connection lost, automatic retries in progress
 * - `exhausted`: all automatic retries used; only a manual `retry()` reconnects
 * - `disconnected`: closed on purpose (client call or server kick), no retries scheduled
 */
export type SocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'exhausted'
  | 'disconnected';

export type SocketStateListener = (state: SocketConnectionState, attempt: number) => void;

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

function normalizeAttempts(attempts: number | undefined): number {
  if (attempts === undefined || !Number.isFinite(attempts) || attempts < 0) {
    return RECONNECT_POLICY.maxAttempts;
  }
  return Math.min(Math.floor(attempts), RECONNECT_POLICY.maxAttemptsCap);
}

export class SocketManager {
  private socket: Socket | null = null;
  private config: SocketConfig;
  private reconnectAttempts = 0;
  private connectionState: SocketConnectionState = 'idle';
  private stateListeners = new Set<SocketStateListener>();
  private managerHandlers: Array<[string, SocketEventHandler]> = [];
  private eventQueue: QueuedEvent[] = [];
  private queueEnabled: boolean;
  private maxQueueSize: number;
  private registeredHandlers = new Map<string, Set<SocketEventHandler>>();

  constructor(config: SocketConfig) {
    const defaultOptions: NonNullable<SocketConfig['options']> = {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: RECONNECT_POLICY.baseDelayMs,
      reconnectionDelayMax: RECONNECT_POLICY.maxDelayMs,
      randomizationFactor: RECONNECT_POLICY.randomizationFactor,
      reconnectionAttempts: RECONNECT_POLICY.maxAttempts,
      timeout: 20000,
    };

    const options = { ...defaultOptions, ...(config.options || {}) };
    options.reconnectionAttempts = normalizeAttempts(options.reconnectionAttempts);

    this.config = { ...config, options };
    this.queueEnabled = this.config.queueEnabled ?? false;
    this.maxQueueSize = this.config.maxQueueSize ?? 100;
  }

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.socket) {
      this.removeRegisteredHandlers(this.socket);
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(this.config.url, this.config.options);
    this.reconnectAttempts = 0;
    this.setState('connecting');

    this.registerHandler('connect', () => {
      logger.debug('Socket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.flushQueue();
    });

    this.registerHandler('disconnect', (reason) => {
      logger.debug('Socket disconnected:', reason);
      // socket.io does not auto-reconnect after an explicit client or server disconnect
      if (reason === 'io client disconnect' || reason === 'io server disconnect') {
        this.setState('disconnected');
      } else if (this.config.options?.reconnection !== false) {
        this.setState('reconnecting');
      } else {
        this.setState('disconnected');
      }
    });

    this.registerHandler('connect_error', (error) => {
      console.error('Socket connection error:', error);
      if (this.config.options?.reconnection === false) {
        this.setState('disconnected');
      }
    });

    // In socket.io-client v4 the reconnect* events are emitted by the Manager, not the Socket.
    this.registerManagerHandler('reconnect_attempt', (attemptNumber) => {
      this.reconnectAttempts = Number(attemptNumber) || this.reconnectAttempts + 1;
      logger.debug('Socket reconnect attempt', this.reconnectAttempts);
      this.setState('reconnecting');
    });

    this.registerManagerHandler('reconnect', (attemptNumber) => {
      logger.debug('Socket reconnected after', attemptNumber, 'attempts');
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.flushQueue();
    });

    this.registerManagerHandler('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error);
    });

    this.registerManagerHandler('reconnect_failed', () => {
      console.error('Socket reconnection failed after', this.reconnectAttempts, 'attempts');
      this.setState('exhausted');
    });

    return this.socket;
  }

  /**
   * Manually reconnect after retries are exhausted (or any time the socket is down).
   * Resets the attempt counter so the full backoff schedule applies again.
   */
  retry(): void {
    if (this.socket?.connected) {
      return;
    }
    if (!this.socket) {
      this.connect();
      return;
    }
    this.reconnectAttempts = 0;
    this.setState('connecting');
    this.socket.connect();
  }

  getConnectionState(): SocketConnectionState {
    return this.connectionState;
  }

  getReconnectAttempt(): number {
    return this.reconnectAttempts;
  }

  getMaxReconnectAttempts(): number {
    return this.config.options?.reconnectionAttempts ?? RECONNECT_POLICY.maxAttempts;
  }

  /**
   * Subscribe to connection state changes. Listeners survive disconnect/connect cycles.
   * Returns an unsubscribe function.
   */
  onStateChange(listener: SocketStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private setState(state: SocketConnectionState): void {
    if (state === this.connectionState && state !== 'reconnecting') {
      return;
    }
    this.connectionState = state;
    for (const listener of this.stateListeners) {
      listener(state, this.reconnectAttempts);
    }
  }

  disconnect(): void {
    const socket = this.socket;

    if (!socket) {
      return;
    }

    this.removeRegisteredHandlers(socket);
    socket.disconnect();
    this.socket = null;
    this.reconnectAttempts = 0;
    this.setState('disconnected');
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Emits an event immediately when connected, or queues it when queueing is
   * enabled. The return value indicates whether the event was sent immediately.
   */
  emit(event: string, data?: unknown): boolean {
    if (this.socket?.connected) {
      try {
        this.socket.emit(event, data);
        return true;
      } catch (error) {
        console.warn('Failed to emit event:', event, error);
        return false;
      }
    }

    if (!this.queueEnabled) {
      console.warn('Socket not connected. Cannot emit event:', event);
      return false;
    }

    if (this.eventQueue.length >= this.maxQueueSize) {
      console.warn('Event queue is full. Dropping event:', event);
      return false;
    }

    this.eventQueue.push({ event, data });
    console.warn('Socket not connected. Event queued:', event);
    return false;
  }

  private flushQueue(): void {
    while (this.eventQueue.length > 0) {
      if (!this.socket?.connected) {
        break;
      }

      const queuedEvent = this.eventQueue.shift();
      if (!queuedEvent) {
        break;
      }

      this.socket.emit(queuedEvent.event, queuedEvent.data);
    }
  }

  private registerHandler(event: string, callback: SocketEventHandler): void {
    if (!this.socket) {
      return;
    }

    const handlers = this.registeredHandlers.get(event) ?? new Set<SocketEventHandler>();
    handlers.add(callback);
    this.registeredHandlers.set(event, handlers);
    this.socket.on(event, callback);
  }

  private registerManagerHandler(event: string, callback: SocketEventHandler): void {
    const manager = this.socket?.io;
    if (!manager) {
      return;
    }
    manager.on(event as never, callback);
    this.managerHandlers.push([event, callback]);
  }

  private removeRegisteredHandlers(socket: Socket): void {
    for (const [event, handlers] of this.registeredHandlers) {
      for (const handler of handlers) {
        socket.off(event, handler);
      }
    }
    this.registeredHandlers.clear();

    for (const [event, handler] of this.managerHandlers) {
      socket.io?.off(event as never, handler);
    }
    this.managerHandlers = [];
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (this.socket) {
      this.registerHandler(event, callback);
    }
  }

  off(event: string, callback?: (...args: unknown[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);

      const handlers = this.registeredHandlers.get(event);
      if (handlers) {
        if (callback) {
          handlers.delete(callback);
        } else {
          handlers.clear();
        }

        if (handlers.size === 0) {
          this.registeredHandlers.delete(event);
        }
      }
    }
  }

  once(event: string, callback: (...args: unknown[]) => void): void {
    if (this.socket) {
      const handlers = this.registeredHandlers.get(event) ?? new Set<SocketEventHandler>();
      handlers.add(callback);
      this.registeredHandlers.set(event, handlers);
      this.socket.once(event, callback);
    }
  }
}

// Singleton instance
let socketManagerInstance: SocketManager | null = null;

export const getSocketManager = (config?: SocketConfig): SocketManager => {
  if (!socketManagerInstance && config) {
    socketManagerInstance = new SocketManager(config);
  }
  if (!socketManagerInstance) {
    throw new Error('SocketManager not initialized. Call getSocketManager with config first.');
  }
  return socketManagerInstance;
};

export const initializeSocketManager = (config: SocketConfig): SocketManager => {
  socketManagerInstance = new SocketManager(config);
  return socketManagerInstance;
};
