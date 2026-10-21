import { describe, it, expect } from 'vitest';
import { canRetry, canTransition, getDeliveryState } from '../messageDelivery';

describe('message delivery state machine (#266)', () => {
  it.each([
    [undefined, 'queued', true],
    [undefined, 'sending', true],
    [undefined, 'sent', false],
    ['queued', 'sending', true],
    ['queued', 'sent', false],
    ['sending', 'sent', true],
    ['sending', 'failed', true],
    ['sending', 'queued', false],
    ['failed', 'sending', true],
    ['failed', 'queued', true],
    ['failed', 'sent', false],
    ['sent', 'sending', false],
    ['sent', 'failed', false],
  ] as const)('%s → %s allowed: %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it('maps legacy status values for older stored messages', () => {
    expect(getDeliveryState({ type: 'user', metadata: { status: 'pending' } })).toBe('sending');
    expect(getDeliveryState({ type: 'user', metadata: { status: 'success' } })).toBe('sent');
    expect(getDeliveryState({ type: 'user', metadata: { status: 'failed' } })).toBe('failed');
    expect(getDeliveryState({ type: 'user', metadata: { delivery: 'queued', status: 'pending' } })).toBe('queued');
    expect(getDeliveryState({ type: 'agent', metadata: { status: 'failed' } })).toBeUndefined();
  });

  it('allows retry only for failed messages', () => {
    expect(canRetry({ type: 'user', metadata: { delivery: 'failed' } })).toBe(true);
    for (const delivery of ['queued', 'sending', 'sent'] as const) {
      expect(canRetry({ type: 'user', metadata: { delivery } })).toBe(false);
    }
  });
});
