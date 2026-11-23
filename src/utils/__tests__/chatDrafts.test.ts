import { beforeEach, describe, expect, it } from "vitest";
import {
  CHAT_DRAFTS_STORAGE_KEY,
  clearChatDraft,
  getChatDraft,
  pruneChatDrafts,
  readChatDrafts,
  setChatDraft,
  type ChatDraftMap,
} from "../format";

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

describe("chat drafts", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: memoryStorage(),
    });
  });

  it("stores, reads, and clears a draft under chat_drafts_v1", () => {
    setChatDraft("conv-a", "hold this prompt", 1_000);
    expect(localStorage.getItem(CHAT_DRAFTS_STORAGE_KEY)).toContain("conv-a");
    expect(getChatDraft("conv-a")).toBe("hold this prompt");
    expect(readChatDrafts()["conv-a"].updatedAt).toBe(1_000);

    clearChatDraft("conv-a");
    expect(getChatDraft("conv-a")).toBe("");
    expect(getChatDraft("missing")).toBe("");
  });

  it("returns an empty map when storage is corrupted", () => {
    localStorage.setItem(CHAT_DRAFTS_STORAGE_KEY, "{not-json");
    expect(readChatDrafts()).toEqual({});
    localStorage.setItem(CHAT_DRAFTS_STORAGE_KEY, JSON.stringify(["nope"]));
    expect(readChatDrafts()).toEqual({});
    localStorage.setItem(
      CHAT_DRAFTS_STORAGE_KEY,
      JSON.stringify({ bad: { text: 1, updatedAt: "x" }, ok: { text: "hi", updatedAt: 2 } }),
    );
    expect(readChatDrafts()).toEqual({ ok: { text: "hi", updatedAt: 2 } });
  });

  it("prunes to the 20 most recent drafts and keeps the active conversation", () => {
    const drafts: ChatDraftMap = {};
    for (let index = 0; index < 22; index += 1) {
      drafts[`c${index}`] = { text: `draft ${index}`, updatedAt: index };
    }
    const pruned = pruneChatDrafts(drafts, "c0");
    expect(Object.keys(pruned)).toHaveLength(21);
    expect(pruned.c0.text).toBe("draft 0");
    expect(pruned.c21.text).toBe("draft 21");
    expect(pruned.c1).toBeUndefined();
  });

  it("clears only the sent conversation draft", () => {
    setChatDraft("keep", "other conversation", 10);
    setChatDraft("sent", "this one goes out", 11);
    clearChatDraft("sent");
    expect(getChatDraft("keep")).toBe("other conversation");
    expect(getChatDraft("sent")).toBe("");
  });
});
