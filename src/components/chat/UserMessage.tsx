"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Clock, Copy, Edit2, X } from "lucide-react";
import { useAppSelector } from "@/store";
import type { ChatMessage } from "@/types";

interface UserMessageProps {
  message: ChatMessage;
  onCopy?: (text: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onReply?: (messageId: string) => void;
  /** Resend a message that failed to reach the service (#266). */
  onRetry?: (message: ChatMessage) => void;
}

const markdownComponents: Components = {
  p: ({ children, ...props }) => <p className="mb-2 last:mb-0" {...props}>{children}</p>,
  strong: ({ children, ...props }) => <strong className="font-semibold text-white" {...props}>{children}</strong>,
  em: ({ children, ...props }) => <em className="italic text-gray-200" {...props}>{children}</em>,
  code: ({ children, ...props }) => (
    <code className="rounded bg-gray-800 px-1 py-0.5 text-sm text-green-400" {...props}>{children}</code>
  ),
  pre: ({ children, ...props }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-gray-100" {...props}>{children}</pre>
  ),
  ul: ({ children, ...props }) => <ul className="mb-2 list-inside list-disc space-y-1" {...props}>{children}</ul>,
  ol: ({ children, ...props }) => <ol className="mb-2 list-inside list-decimal space-y-1" {...props}>{children}</ol>,
  li: ({ children, ...props }) => <li className="text-gray-200" {...props}>{children}</li>,
};

export default function UserMessage({ message, onCopy, onEdit, onReply }: UserMessageProps) {
export default function UserMessage({
  message,
  onCopy,
  onEdit,
  onReply,
}: UserMessageProps) {
  const { pendingMessages } = useAppSelector((state) => state.chat);
  const delivery = getDeliveryState(message);
  const isPending = delivery === "sending" || (delivery === undefined && pendingMessages.has(message.id));
  const isQueued = delivery === "queued";
  const isFailed = delivery === "failed";
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const contentText =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(contentText);
      setCopied(true);
      onCopy?.(contentText);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy text:", error);
    }
  };

  const handleSaveEdit = () => {
    if (onEdit && editContent.trim() !== contentText) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(contentText);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSaveEdit();
    } else if (event.key === "Escape") {
      handleCancelEdit();
    }
  };

  // Track a running offset so each text node in the markdown gets the right
  // global match index. We accumulate it across node renders using a ref-like
  // mutable object that is re-created on each component render (but stable
  // within the single ReactMarkdown render pass).
  const offsetTracker = useMemo(() => ({ current: searchMatchOffset }), [searchMatchOffset]);

  /**
   * Wrap a child string (text node inside a ReactMarkdown component) with
   * HighlightedText, advancing the running offset by the number of matches.
   */
  const wrapChildren = (children: React.ReactNode): React.ReactNode => {
    if (!searchQuery) return children;
    if (typeof children === 'string') {
      const matchCount = findMatches(children, searchQuery).length;
      const offset = offsetTracker.current;
      offsetTracker.current += matchCount;
      return (
        <HighlightedText
          text={children}
          query={searchQuery}
          activeIndex={searchActiveIndex}
          matchOffset={offset}
        />
      );
    }
    // React.Children are already nodes – pass through.
    return children;
  };

  const markdownContent =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content, null, 2);

  return (
    <div className={`max-w-3xl ${isPending ? "opacity-75" : ""} bg-[#7C3AED] text-white rounded-2xl px-6 py-4 group relative`}>
      {isPending && (
        <div role="status" className="absolute -left-8 top-4 flex items-center gap-1 text-xs text-yellow-400">
          <Clock className="h-3 w-3 animate-spin" />
          <span>Sending...</span>
        </div>
      )}

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(event) => setEditContent(event.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-white placeholder:text-gray-300 focus:outline-none resize-none"
            rows={Math.max(2, editContent.split("\n").length)}
            autoFocus
          />
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              className="p-1 text-green-400 hover:text-green-300 transition-colors"
              title="Save changes"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="p-1 text-red-400 hover:text-red-300 transition-colors"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="prose prose-invert prose-lg max-w-none leading-relaxed pr-12">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children, ...props }: any) => (
                  <p className="mb-2 last:mb-0" {...props}>{children}</p>
                ),
                strong: ({ children, ...props }: any) => (
                  <strong className="font-semibold text-white" {...props}>{children}</strong>
                ),
                em: ({ children, ...props }: any) => (
                  <em className="italic text-gray-200" {...props}>{children}</em>
                ),
                code: ({ children, ...props }: any) => (
                  <code className="bg-gray-800 text-green-400 px-1 py-0.5 rounded text-sm" {...props}>{children}</code>
                ),
                pre: ({ children, ...props }: any) => (
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto my-2" {...props}>{children}</pre>
                ),
                ul: ({ children, ...props }: any) => (
                  <ul className="list-disc list-inside mb-2 space-y-1" {...props}>{children}</ul>
                ),
                ol: ({ children, ...props }: any) => (
                  <ol className="list-decimal list-inside mb-2 space-y-1" {...props}>{children}</ol>
                ),
                li: ({ children, ...props }: any) => (
                  <li className="text-gray-200" {...props}>{children}</li>
                ),
              }}
            >
              {contentText}
            </ReactMarkdown>
          </div>

          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 text-gray-300 hover:text-white transition-colors"
              title="Copy message"
            >
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="p-1 text-gray-300 hover:text-white transition-colors"
              title="Edit message"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            {onReply && (
              <button
                type="button"
                onClick={() => onReply(message.id)}
                className="p-1 text-gray-300 hover:text-white transition-colors"
                title="Reply in thread"
              >
                <span className="text-xs">↩</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
