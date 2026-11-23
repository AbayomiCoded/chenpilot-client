import { describe, expect, it } from 'vitest';
import {
  INITIAL_SOCKET_CONNECTION_STATE,
  SOCKET_CONNECTION_STATES,
  isSocketConnected,
  isSocketStatusVisible,
} from './socket';

describe('socket connection state model', () => {
  it('starts in the unknown (idle) state before any connection attempt', () => {
    expect(INITIAL_SOCKET_CONNECTION_STATE).toBe('idle');
    expect(isSocketConnected(INITIAL_SOCKET_CONNECTION_STATE)).toBe(false);
    expect(isSocketStatusVisible(INITIAL_SOCKET_CONNECTION_STATE)).toBe(false);
  });

  it('covers connected, reconnecting, disconnected and failed (exhausted)', () => {
    expect(SOCKET_CONNECTION_STATES).toEqual([
      'idle',
      'connecting',
      'connected',
      'reconnecting',
      'exhausted',
      'disconnected',
    ]);
  });

  it('reports connected only for the connected state', () => {
    for (const state of SOCKET_CONNECTION_STATES) {
      expect(isSocketConnected(state)).toBe(state === 'connected');
    }
  });

  it('shows status for every state except idle and connected', () => {
    for (const state of SOCKET_CONNECTION_STATES) {
      expect(isSocketStatusVisible(state)).toBe(state !== 'idle' && state !== 'connected');
    }
  });
});
