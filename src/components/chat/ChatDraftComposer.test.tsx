import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearChatDraft, getChatDraft, setChatDraft } from "@/utils/format";
import { ChatDraftComposer } from "./ChatDraftComposer";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
}

function ComposerHarness({ conversationId }: { conversationId: string }) {
  const [value, setValue] = useState("");
  return (
    <>
      <ChatDraftComposer conversationId={conversationId} value={value} onChange={setValue} />
      <button
        type="button"
        onClick={() => {
          clearChatDraft(conversationId);
          setValue("");
        }}
      >
        Send
      </button>
    </>
  );
}

describe("ChatDraftComposer", () => {
  beforeEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: memoryStorage(),
    });
  });

  it("shows a restored draft in the composer after remount", () => {
    setChatDraft("conv-1", "finish the agent prompt");
    const first = render(<ComposerHarness conversationId="conv-1" />);
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("finish the agent prompt");
    expect(screen.getByText("Restored draft")).toBeInTheDocument();
    first.unmount();

    render(<ComposerHarness conversationId="conv-1" />);
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("finish the agent prompt");
    expect(screen.getByText("Restored draft")).toBeInTheDocument();
  });

  it("debounces draft writes", () => {
    vi.useFakeTimers();
    render(<ComposerHarness conversationId="conv-2" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "typing" },
    });
    expect(getChatDraft("conv-2")).toBe("");
    vi.advanceTimersByTime(300);
    expect(getChatDraft("conv-2")).toBe("typing");
  });

  it("clears the sent draft and leaves another conversation untouched", () => {
    setChatDraft("conv-a", "keep this");
    setChatDraft("conv-b", "send this");
    render(<ComposerHarness conversationId="conv-b" />);
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("send this");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(getChatDraft("conv-a")).toBe("keep this");
    expect(getChatDraft("conv-b")).toBe("");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });
});
