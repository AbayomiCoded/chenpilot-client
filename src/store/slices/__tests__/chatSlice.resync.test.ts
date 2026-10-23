import { describe, it, expect } from 'vitest';
import chatReducer, {
  addMessage,
  storeOptimisticUpdate,
  mergeSyncedMessages,
  mergeIncomingMessages,
} from '../chatSlice';
import { ChatMessage } from '@/types';

const msg = (id: string, type: ChatMessage['type'], content: string, ts: string, metadata?: ChatMessage['metadata']): ChatMessage => ({
  id,
  type,
  content,
  timestamp: ts,
  metadata,
});

describe('mergeIncomingMessages (#277)', () => {
  it('appends unseen server messages in chronological order', () => {
    const local = [msg('m1', 'user', 'hi', '2024-01-01T12:00:01Z')];
    const merged = mergeIncomingMessages(local, [
      msg('m3', 'agent', 'later', '2024-01-01T12:00:03Z'),
      msg('m2', 'agent', 'earlier', '2024-01-01T12:00:02Z'),
    ]);
    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('ignores a message already present by id, keeping one copy', () => {
    const local = [msg('m1', 'agent', 'hello', '2024-01-01T12:00:01Z')];
    const merged = mergeIncomingMessages(local, [msg('m1', 'agent', 'hello', '2024-01-01T12:00:01Z')]);
    expect(merged).toHaveLength(1);
  });

  it('replaces the optimistic copy when the server echoes its optimistic id', () => {
    const local = [
      msg('msg_optimistic_1', 'user', 'send 5 XLM', '2024-01-01T12:00:00Z', { status: 'pending', optimisticId: 'msg_optimistic_1' }),
    ];
    const merged = mergeIncomingMessages(local, [
      msg('srv_10', 'user', 'send 5 XLM', '2024-01-01T12:00:01Z', { optimisticId: 'msg_optimistic_1' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('srv_10');
    expect(merged[0].metadata?.status).toBe('success');
  });

  it('matches agent replies by request id within the same message type only', () => {
    const local = [
      msg('u1', 'user', 'swap', '2024-01-01T12:00:00Z'),
      msg('a_local', 'agent', 'timed out', '2024-01-01T12:00:01Z', { requestId: 'req_1', errorKind: 'timeout' }),
    ];
    const merged = mergeIncomingMessages(local, [
      msg('srv_user', 'user', 'swap', '2024-01-01T12:00:00Z', { requestId: 'req_1' }),
      msg('srv_agent', 'agent', 'Swapped', '2024-01-01T12:00:05Z', { requestId: 'req_1', success: true }),
    ]);

    const agents = merged.filter((m) => m.type === 'agent');
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ id: 'srv_agent', content: 'Swapped' });
    // the user message had no request id locally, so it is added rather than replacing the agent reply
    expect(merged.filter((m) => m.type === 'user')).toHaveLength(2);
  });

  it('dedupes repeats within a single incoming batch', () => {
    const merged = mergeIncomingMessages([], [
      msg('m1', 'agent', 'x', '2024-01-01T12:00:01Z'),
      msg('m1', 'agent', 'x', '2024-01-01T12:00:01Z'),
    ]);
    expect(merged).toHaveLength(1);
  });
});

describe('mergeSyncedMessages reducer (#277)', () => {
  it('merges into state and clears the resolved optimistic entry', () => {
    let state = chatReducer(undefined, { type: '' });
    const optimistic = msg('tmp_1', 'user', 'hello', '2024-01-01T12:00:00Z', { status: 'pending', tempId: 'tmp_1' });
    state = chatReducer(state, addMessage(optimistic));
    state = chatReducer(state, storeOptimisticUpdate(optimistic));

    state = chatReducer(state, mergeSyncedMessages([
      msg('srv_1', 'user', 'hello', '2024-01-01T12:00:00Z', { tempId: 'tmp_1' }),
    ]));

    expect(state.messages.map((m) => m.id)).toEqual(['srv_1']);
    expect(state.optimisticUpdates.has('tmp_1')).toBe(false);
  });
});
