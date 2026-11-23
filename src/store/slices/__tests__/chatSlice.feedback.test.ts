import { describe, expect, it, beforeEach } from "vitest";
import chatReducer, {
  loadConversationsLocally,
  saveConversationLocally,
  setMessageFeedback,
  setMessages,
} from "../chatSlice";
import type { ChatMessage, Conversation, MessageFeedback } from "@/types";

const feedback: MessageFeedback = {
  rating: "down",
  comment: "Too brief",
  submittedAt: "2026-10-20T00:00:00.000Z",
};
const answer: ChatMessage = {
  id: "answer-1",
  type: "agent",
  content: "Answer",
  timestamp: "2026-10-20T00:00:00.000Z",
};
const conversation: Conversation = {
  id: "conversation-1",
  title: "Feedback persistence",
  isActive: true,
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
  userId: "user-1",
  messageCount: 1,
};

beforeEach(() => localStorage.clear());

describe("chat feedback", () => {
  it("sets and clears feedback, and ignores unknown message ids", () => {
    let state = chatReducer(undefined, setMessages([answer]));
    state = chatReducer(
      state,
      setMessageFeedback({ messageId: "answer-1", feedback }),
    );
    expect(state.messages[0].metadata?.feedback).toEqual(feedback);

    const unchanged = chatReducer(
      state,
      setMessageFeedback({ messageId: "missing", feedback }),
    );
    expect(unchanged.messages[0].metadata?.feedback).toEqual(feedback);

    state = chatReducer(
      state,
      setMessageFeedback({ messageId: "answer-1", feedback: null }),
    );
    expect(state.messages[0].metadata?.feedback).toBeUndefined();
  });

  it("persists feedback through saveConversationLocally and a localStorage reload", () => {
    let state = chatReducer(undefined, setMessages([answer]));
    state = chatReducer(
      state,
      setMessageFeedback({ messageId: "answer-1", feedback }),
    );
    chatReducer(state, saveConversationLocally(conversation));

    const restored = chatReducer(undefined, loadConversationsLocally());
    expect(restored.conversations[0].messages?.[0].metadata?.feedback).toEqual(
      feedback,
    );
  });
});
