'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { History, MessageCircle, AlertTriangle, RefreshCw, ChevronUp } from 'lucide-react';
import { ChatHistoryStatus, ChatMessage } from '@/types';

export interface ConversationHistoryViewProps {
  messages: ChatMessage[];
  status: ChatHistoryStatus;
  error: string | null;
  onRetry: () => void;
  onStartChat: () => void;
  /** Older pages exist on the server (#264). */
  hasMore?: boolean;
  isLoadingOlder?: boolean;
  olderError?: string | null;
  onLoadOlder?: () => void;
}

/**
 * Chat history body (#265). Distinguishes four cases:
 * loading with nothing cached, failed with nothing cached (error state + retry),
 * failed with cached messages (inline banner + retry, list still shown), and truly empty.
 */
export function ConversationHistoryView({
  messages,
  status,
  error,
  onRetry,
  onStartChat,
  hasMore = false,
  isLoadingOlder = false,
  olderError = null,
  onLoadOlder,
}: ConversationHistoryViewProps) {
  const hasMessages = messages.length > 0;
  const isLoading = status === 'loading' || status === 'idle';

  if (!hasMessages && isLoading) {
    return (
      <div role="status" aria-live="polite" className="py-12 text-center text-gray-600 dark:text-gray-400">
        Loading chat history…
      </div>
    );
  }

  if (!hasMessages && status === 'failed') {
    return (
      <EmptyState
        tone="error"
        icon={<AlertTriangle aria-hidden="true" className="h-8 w-8" />}
        title="Couldn't load your chat history"
        description="Something went wrong while loading your conversations. Your history hasn't been deleted. Try again in a moment."
        action={{
          label: 'Try again',
          onClick: onRetry,
          icon: <RefreshCw aria-hidden="true" className="h-4 w-4" />,
        }}
        secondaryAction={{
          label: 'Start new chat',
          onClick: onStartChat,
          icon: <MessageCircle aria-hidden="true" className="h-4 w-4" />,
        }}
      />
    );
  }

  if (!hasMessages) {
    return (
      <EmptyState
        icon={<History aria-hidden="true" className="h-8 w-8" />}
        title="No chat history yet"
        description="Your previous conversations will appear here once you start chatting."
        action={{
          label: 'Start new chat',
          onClick: onStartChat,
          icon: <MessageCircle aria-hidden="true" className="h-4 w-4" />,
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {status === 'failed' && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          <span className="flex-1">
            Showing saved conversations. We couldn&apos;t refresh your history{error ? `: ${error}` : '.'}
          </span>
          <Button type="button" variant="secondary" onClick={onRetry} className="gap-2">
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Try again
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Recent Conversations
        </h2>
        <Button onClick={onStartChat} className="inline-flex items-center">
          <MessageCircle className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      {onLoadOlder && (hasMore || olderError) && (
        <div className="flex flex-col items-center gap-2">
          {olderError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              Couldn&apos;t load older messages: {olderError}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={onLoadOlder}
            disabled={isLoadingOlder}
            aria-busy={isLoadingOlder}
            className="gap-2"
          >
            <ChevronUp aria-hidden="true" className="h-4 w-4" />
            {isLoadingOlder ? 'Loading older messages…' : olderError ? 'Retry loading older messages' : 'Load older messages'}
          </Button>
        </div>
      )}

      <div className="grid gap-2" data-testid="history-list">
        {messages.map((message) => (
          <Card key={message.id} className="p-2 hover:shadow-md transition-shadow">
            <div className="flex items-start space-x-2">
              <div className={`w-2 h-2 rounded-full mt-1 ${
                message.type === 'user' ? 'bg-blue-500' :
                message.type === 'agent' ? 'bg-green-500' : 'bg-gray-500'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                    {message.type}
                  </p>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                  {typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}
                </p>
                {message.metadata && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {message.metadata?.type && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {message.metadata?.type}
                      </span>
                    )}
                    {message.metadata?.action && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        {message.metadata?.action}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ConversationHistoryView;
