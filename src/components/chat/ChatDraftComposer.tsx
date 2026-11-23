"use client";

import React, { useEffect, useRef, useState } from "react";
import { getChatDraft, setChatDraft } from "@/utils/format";

const DRAFT_WRITE_DELAY_MS = 300;

interface ChatDraftComposerProps {
  conversationId: string | null;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  disabled?: boolean;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function ChatDraftComposer({
  conversationId,
  value,
  onChange,
  onEnter,
  disabled = false,
  placeholder = "Ask ChenPilot...",
  inputRef,
}: ChatDraftComposerProps) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [showRestoredHint, setShowRestoredHint] = useState(false);

  useEffect(() => {
    const id = conversationId;
    return () => {
      if (id) setChatDraft(id, valueRef.current);
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setShowRestoredHint(false);
      return;
    }
    const draft = getChatDraft(conversationId);
    if (draft !== valueRef.current) onChangeRef.current(draft);
    setShowRestoredHint(Boolean(draft));
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const timer = window.setTimeout(() => {
      setChatDraft(conversationId, value);
    }, DRAFT_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [conversationId, value]);

  return (
    <>
      {showRestoredHint && value ? (
        <p className="mb-2 text-xs text-gray-500" role="status">
          Restored draft
        </p>
      ) : null}
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          setShowRestoredHint(false);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onEnter?.();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Message"
        className="w-full bg-transparent border-none text-white placeholder:text-gray-500 focus:outline-none text-lg mb-4"
      />
    </>
  );
}
