import { describe, it, expect, beforeEach } from 'vitest';
import {
  cancelConversationRequests,
  hasActiveRequests,
  isConversationDeleted,
  resetConversationRequests,
  trackConversationRequest,
} from '../conversationRequests';

describe('conversation request registry (#269)', () => {
  beforeEach(() => resetConversationRequests());

  it('tracks and releases requests per conversation', () => {
    const a = trackConversationRequest('c1');
    const b = trackConversationRequest('c1');
    expect(hasActiveRequests('c1')).toBe(true);

    a.release();
    expect(hasActiveRequests('c1')).toBe(true);
    b.release();
    expect(hasActiveRequests('c1')).toBe(false);
  });

  it('aborts only the deleted conversation and marks it deleted', () => {
    const doomed = trackConversationRequest('c1');
    const other = trackConversationRequest('c2');

    expect(cancelConversationRequests('c1')).toBe(1);

    expect(doomed.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false);
    expect(isConversationDeleted('c1')).toBe(true);
    expect(isConversationDeleted('c2')).toBe(false);
    expect(hasActiveRequests('c1')).toBe(false);
  });

  it('handles empty ids', () => {
    expect(isConversationDeleted(null)).toBe(false);
    expect(isConversationDeleted(undefined)).toBe(false);
  });
});
