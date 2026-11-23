'use client';

import React from 'react';
import { Download } from 'lucide-react';
import type { ChatMessage } from '@/types';
import {
  EXPORT_MIME_TYPES,
  conversationExportFileName,
  downloadTextFile,
  serializeConversationJson,
  serializeConversationMarkdown,
  type ConversationExportFormat,
} from '@/utils/format';

interface ConversationExportMenuProps {
  /** Messages of the active conversation (`state.chat.messages`). */
  messages: ChatMessage[];
  conversationId: string | null | undefined;
  title?: string;
  /** Injected so tests can assert the exact file that would be downloaded. */
  onDownload?: (fileName: string, content: string, mimeType: string) => void;
  now?: () => Date;
}

const EMPTY_TOOLTIP = 'Nothing to export yet. Send a message first.';

export const ConversationExportMenu: React.FC<ConversationExportMenuProps> = ({
  messages,
  conversationId,
  title,
  onDownload = downloadTextFile,
  now = () => new Date(),
}) => {
  const isEmpty = messages.length === 0;

  const exportAs = (format: ConversationExportFormat) => {
    if (isEmpty) return;
    const content =
      format === 'json'
        ? serializeConversationJson(messages)
        : serializeConversationMarkdown(messages, { title });
    onDownload(
      conversationExportFileName(conversationId || 'conversation', format, now()),
      content,
      EXPORT_MIME_TYPES[format],
    );
  };

  return (
    <div
      role="group"
      aria-label="Export conversation"
      title={isEmpty ? EMPTY_TOOLTIP : undefined}
      className="flex items-center gap-2 text-xs text-gray-300"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Export</span>
      {(['markdown', 'json'] as const).map((format) => (
        <button
          key={format}
          type="button"
          disabled={isEmpty}
          title={isEmpty ? EMPTY_TOOLTIP : `Download this conversation as ${format === 'json' ? 'JSON' : 'Markdown'}`}
          onClick={() => exportAs(format)}
          className="rounded bg-gray-700 px-2 py-1 font-medium hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          {format === 'json' ? 'JSON' : 'Markdown'}
        </button>
      ))}
    </div>
  );
};
