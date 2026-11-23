export type SocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'exhausted'
  | 'failed';


/**
 * The single shared model for real-time socket connection status (#279).
 *
 * Every consumer (the provider, hooks and status UI such as OfflineIndicator)
 * reads this one union; `isConnected` and friends are derived from it rather
 * than tracked separately.
 *
 * - `idle`: the initial, unknown state; no connection has been attempted yet
 * - `connecting`: initial connect or manual retry in flight
 * - `connected`: socket is open
 * - `reconnecting`: connection lost, automatic retries in progress
 * - `exhausted`: all automatic retries used (the "failed" state); only a manual `retry()` reconnects
 * - `disconnected`: closed on purpose (client call or server kick), no retries scheduled
 */
export const SOCKET_CONNECTION_STATES = [
  'idle',
  'connecting',
  'connected',
  'reconnecting',
  'exhausted',
  'disconnected',
] as const;

export type SocketConnectionState = (typeof SOCKET_CONNECTION_STATES)[number];
export const INITIAL_SOCKET_CONNECTION_STATE: SocketConnectionState = 'idle';

export function isSocketConnected(state: SocketConnectionState): boolean {
  return state === 'connected';
}

export function isSocketStatusVisible(state: SocketConnectionState): boolean {
  return state !== 'idle' && state !== 'connected';
}
