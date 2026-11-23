"use client";

import React, { useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { agentService } from "@/services/agentService";
import { ChatMessage } from "@/types";

interface AgentTimeoutNoticeProps {
  message: ChatMessage;
  /** Apply the outcome of a status check to the timed-out message. */
  onResolve: (updates: Partial<ChatMessage>) => void;
  /** Resend the original query. Only offered for read-only queries. */
  onRetry?: () => void;
}

const STATUS_COPY = {
  pending: "Still running. Check again in a moment.",
  unknown:
    "Couldn't confirm the status. Check your wallet's transaction history before trying again.",
} as const;

/**
 * Shown under an agent reply that timed out on the client (#274).
 * State-changing actions get a status check instead of a retry, so a slow
 * transfer or swap is not submitted twice.
 */
export function AgentTimeoutNotice({ message, onResolve, onRetry }: AgentTimeoutNoticeProps) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const metadata = message.metadata ?? {};
  const canCheckStatus = Boolean(metadata.stateChanging && metadata.requestId);

  if (metadata.errorKind !== "timeout" || metadata.actionStatus === "completed" || metadata.actionStatus === "failed") {
    return null;
  }

  const checkStatus = async () => {
    if (!metadata.requestId) return;
    setChecking(true);
    setNote(null);
    const status = await agentService.getActionStatus(metadata.requestId);
    setChecking(false);

    if (status.status === "completed" || status.status === "failed") {
      const result = status.result;
      onResolve({
        content:
          result?.data ??
          (status.status === "completed" ? "The action completed." : "The action failed."),
        metadata: {
          ...metadata,
          success: status.status === "completed",
          error: result?.error,
          errorKind: status.status === "failed" ? result?.errorKind ?? "server" : undefined,
          transactionHash: result?.transactionHash ?? metadata.transactionHash,
          actionStatus: status.status,
        },
      });
      return;
    }

    setNote(STATUS_COPY[status.status]);
    onResolve({ metadata: { ...metadata, actionStatus: status.status } });
  };

  return (
    <div
      role="status"
      data-testid="agent-timeout-notice"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-yellow-700/50 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-300"
    >
      <Clock className="h-4 w-4" aria-hidden="true" />
      <span>{canCheckStatus ? "Timed out — this action may still be running." : "Timed out."}</span>
      {canCheckStatus ? (
        <button
          type="button"
          onClick={checkStatus}
          disabled={checking}
          className="underline disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check status"}
        </button>
      ) : (
        onRetry && (
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 underline">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Retry
          </button>
        )
      )}
      {note && <span className="w-full text-yellow-200/80">{note}</span>}
    </div>
  );
}

export default AgentTimeoutNotice;
