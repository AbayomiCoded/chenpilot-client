"use client";

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { agentService } from "@/services/agentService";
import { ChatMessage } from "@/types";

interface AgentRetryActionProps {
  message: ChatMessage;
  /** Resend `retryPrompt` with the original request id. */
  onRetry: (message: ChatMessage) => void;
  /** Apply a status-check outcome (e.g. the original attempt already completed). */
  onResolve: (updates: Partial<ChatMessage>) => void;
}

/**
 * Retry action for a failed agent reply (#262). Only shown for retryable failures. For
 * state-changing prompts it first asks the backend whether the original attempt went through,
 * so a retry cannot repeat a transfer or swap that already succeeded.
 */
export function AgentRetryAction({ message, onRetry, onResolve }: AgentRetryActionProps) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const metadata = message.metadata ?? {};

  if (!metadata.retryable || !metadata.retryPrompt) {
    return null;
  }

  const handleRetry = async () => {
    setNote(null);
    setChecking(true);
    const decision = await agentService.checkBeforeRetry(metadata.requestId, Boolean(metadata.stateChanging));
    setChecking(false);

    switch (decision.action) {
      case "retry":
        onRetry(message);
        return;
      case "completed":
        onResolve({
          content: decision.result?.data ?? "Your earlier request already completed, so it wasn't sent again.",
          metadata: {
            ...metadata,
            success: true,
            status: "success",
            error: undefined,
            errorKind: undefined,
            retryable: false,
            transactionHash: decision.result?.transactionHash ?? metadata.transactionHash,
          },
        });
        return;
      case "pending":
        setNote("Your earlier request is still being processed. Check again in a moment before retrying.");
        return;
      case "confirm":
        setNeedsConfirm(true);
        setNote(
          "We couldn't confirm whether your earlier request went through. Check your transaction history before retrying.",
        );
        return;
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-testid="agent-retry-action">
      {needsConfirm ? (
        <button
          type="button"
          onClick={() => onRetry(message)}
          className="inline-flex items-center gap-1 rounded-md border border-yellow-600/60 px-2 py-1 text-yellow-300 hover:bg-yellow-900/30"
        >
          <RefreshCw aria-hidden="true" className="h-3 w-3" />
          Retry anyway
        </button>
      ) : (
        <button
          type="button"
          onClick={handleRetry}
          disabled={checking}
          aria-busy={checking}
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Checking…" : "Retry"}
        </button>
      )}
      {note && (
        <span role="status" className="w-full text-gray-400">
          {note}
        </span>
      )}
    </div>
  );
}

export default AgentRetryAction;
