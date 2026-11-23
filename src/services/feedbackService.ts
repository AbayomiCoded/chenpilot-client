import type { MessageFeedback } from "@/types";

/**
 * Single persistence seam for answer feedback. Feedback is stored in the local
 * conversation state today; a backend implementation can be added here later.
 */
export async function submitFeedback(
  _messageId: string,
  _feedback: MessageFeedback | null,
): Promise<void> {
  // Intentionally local-only until the feedback endpoint is available.
}
