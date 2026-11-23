"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { hasActiveRequests } from "@/store/conversationRequests";

interface DeleteConversationDialogProps {
  /** Conversation pending confirmation, or null when closed. */
  conversation: { id: string; title: string } | null;
  onConfirm: (conversationId: string) => void;
  onCancel: () => void;
}

/**
 * Confirmation before deleting a conversation (#269). Warns when an agent response is still
 * in progress, because deleting cancels it.
 */
export function DeleteConversationDialog({ conversation, onConfirm, onCancel }: DeleteConversationDialogProps) {
  const busy = conversation ? hasActiveRequests(conversation.id) : false;

  return (
    <Modal isOpen={conversation !== null} onClose={onCancel} title="Delete conversation?">
      {conversation && (
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            &ldquo;{conversation.title}&rdquo; and its messages will be removed from this device. This can&apos;t be undone.
          </p>
          {busy && (
            <p role="alert" className="text-sm text-yellow-300">
              A response is still in progress. Deleting will cancel it, and any reply that arrives later will be discarded.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700"
              onClick={() => onConfirm(conversation.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default DeleteConversationDialog;
