import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import AgentMessage from "./AgentMessage";
import { ChatMessage } from "@/types";
import chatReducer from "@/store/slices/chatSlice";
import { submitFeedback } from "@/services/feedbackService";

vi.mock("@/services/feedbackService", () => ({
  submitFeedback: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./CodeBlock", () => ({
  CodeBlock: ({ children }: { children: ReactNode }) => <code>{children}</code>,
}));

const agentMessage: ChatMessage = {
  id: "agent-1",
  type: "agent",
  content: "Previous answer",
  timestamp: "2026-10-21T00:00:00.000Z",
};

function renderAgentMessage(message = agentMessage) {
  const store = configureStore({ reducer: { chat: chatReducer } });
  store.dispatch({ type: "chat/setMessages", payload: [message] });
  render(
    <Provider store={store}>
      <AgentMessage message={message} />
    </Provider>,
  );
  return store;
}

beforeEach(() => vi.clearAllMocks());

describe("AgentMessage regenerate", () => {
  it("dispatches regenerate exactly once", () => {
    const onRegenerate = vi.fn();
    const store = configureStore({ reducer: { chat: chatReducer } });
    render(
      <Provider store={store}>
        <AgentMessage
          message={agentMessage}
          onRegenerate={onRegenerate}
          canRegenerate
        />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Regenerate/i }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("disables regenerate while another query is running", () => {
    const onRegenerate = vi.fn();
    const store = configureStore({ reducer: { chat: chatReducer } });
    render(
      <Provider store={store}>
        <AgentMessage
          message={agentMessage}
          onRegenerate={onRegenerate}
          canRegenerate={false}
        />
      </Provider>,
    );

    expect(screen.getByRole("button", { name: /Regenerate/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Regenerate/i }));
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it("updates feedback state and calls the submit seam once", () => {
    const store = renderAgentMessage();

    fireEvent.click(screen.getByRole("button", { name: "Helpful" }));

    expect(store.getState().chat.messages[0].metadata?.feedback?.rating).toBe("up");
    expect(submitFeedback).toHaveBeenCalledTimes(1);
    expect(submitFeedback).toHaveBeenCalledWith(
      "agent-1",
      expect.objectContaining({ rating: "up" }),
    );
  });

  it("lets a user dismiss the negative-feedback prompt without rating", () => {
    const store = renderAgentMessage();

    fireEvent.click(screen.getByRole("button", { name: "Not helpful" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(store.getState().chat.messages[0].metadata?.feedback).toBeUndefined();
    expect(submitFeedback).not.toHaveBeenCalled();
  });
});
