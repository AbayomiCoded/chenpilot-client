import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it } from "vitest";
import { store } from "@/store";
import { setConversations } from "@/store/slices/chatSlice";
import { Conversation } from "@/types";
import { ConversationManager } from "./ConversationManager";

function conversation(id: string, updatedAt: string, pinned = false): Conversation {
  return {
    id,
    title: id,
    isActive: true,
    createdAt: updatedAt,
    updatedAt,
    userId: "user-1",
    messageCount: 1,
    pinned,
    pinnedAt: pinned ? updatedAt : undefined,
  };
}

describe("conversation pinning", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
          data.set(key, value);
        },
        removeItem: (key: string) => {
          data.delete(key);
        },
        clear: () => data.clear(),
        key: () => null,
        length: 0,
      },
    });
    store.dispatch(setConversations([
      conversation("older-pinned", "2026-01-01T00:00:00.000Z", true),
      conversation("newer", "2026-10-01T00:00:00.000Z"),
    ]));
  });

  it("keeps pinned conversations above newer unpinned ones and persists the pin", () => {
    render(
      <Provider store={store}>
        <ConversationManager />
      </Provider>,
    );

    const titles = screen.getAllByRole("heading", { level: 4 }).map((node) => node.textContent);
    expect(titles[0]).toBe("older-pinned");
    expect(titles[1]).toBe("newer");

    fireEvent.click(screen.getByRole("button", { name: "Pin newer" }));
    const pinnedTitles = screen.getAllByRole("heading", { level: 4 }).map((node) => node.textContent);
    expect(pinnedTitles[0]).toBe("newer");
    expect(store.getState().chat.conversations.find((item) => item.id === "newer")?.pinned).toBe(true);
    expect(localStorage.getItem("conversations")).toContain("\"pinned\":true");

    fireEvent.click(screen.getByRole("button", { name: "Unpin newer" }));
    expect(store.getState().chat.conversations.find((item) => item.id === "newer")?.pinned).toBe(false);
  });
});
