/**
 * Tracks in-flight agent requests per conversation so deleting a conversation can stop them
 * and drop their late responses (#269). Lives outside Redux because AbortControllers are not
 * serializable.
 */

const active = new Map<string, Set<AbortController>>();
// Recently deleted conversation ids; late responses for these are ignored
const deleted = new Set<string>();
const DELETED_LIMIT = 100;

/** Rejection value used when a request's conversation was deleted while it was in flight. */
export const CONVERSATION_DELETED = "conversation_deleted";

/** Register a request for `conversationId`; returns its signal and a release function. */
export function trackConversationRequest(conversationId: string): {
  signal: AbortSignal;
  abort: () => void;
  release: () => void;
} {
  const controller = new AbortController();
  const set = active.get(conversationId) ?? new Set<AbortController>();
  set.add(controller);
  active.set(conversationId, set);

  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    release: () => {
      const current = active.get(conversationId);
      current?.delete(controller);
      if (current && current.size === 0) active.delete(conversationId);
    },
  };
}

/** Whether a conversation has requests in flight (used to warn before deleting). */
export function hasActiveRequests(conversationId: string): boolean {
  return (active.get(conversationId)?.size ?? 0) > 0;
}

/** Abort every in-flight request for a conversation and mark it deleted. */
export function cancelConversationRequests(conversationId: string): number {
  const set = active.get(conversationId);
  const count = set?.size ?? 0;
  set?.forEach((controller) => controller.abort("conversation_deleted"));
  active.delete(conversationId);

  deleted.add(conversationId);
  if (deleted.size > DELETED_LIMIT) {
    const oldest = deleted.values().next().value;
    if (oldest !== undefined) deleted.delete(oldest);
  }
  return count;
}

/** Whether responses for this conversation must be ignored because it was deleted. */
export function isConversationDeleted(conversationId: string | null | undefined): boolean {
  return Boolean(conversationId && deleted.has(conversationId));
}

/** Test helper. */
export function resetConversationRequests(): void {
  active.clear();
  deleted.clear();
}
