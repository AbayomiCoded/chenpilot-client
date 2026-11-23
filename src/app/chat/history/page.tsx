'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppSelector } from '@/store';
import { ChatLayout } from '@/components/layout/ChatLayout';
import { ConversationHistoryView } from '@/components/chat/ConversationHistoryView';
import { fetchChatHistory, loadOlderHistory } from '@/store/slices/chatSlice';
import { usePrependScrollAnchor } from '@/hooks/usePrependScrollAnchor';

export default function ChatHistoryPage() {
  const router = useRouter();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const {
    messages,
    historyStatus,
    historyError,
    historyHasMore,
    isLoadingOlderHistory,
    olderHistoryError,
  } = useAppSelector((state) => state.chat);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Keep the viewport anchored while older pages are prepended (#264)
  const anchor = usePrependScrollAnchor(scrollRef, messages[0]?.id);

  const handleLoadOlder = useCallback(() => {
    anchor.capture();
    dispatch(loadOlderHistory()).finally(() => {
      // Drop the snapshot if nothing was prepended (error or empty page)
      setTimeout(anchor.release, 0);
    });
  }, [anchor, dispatch]);

  const loadHistory = useCallback(() => {
    dispatch(fetchChatHistory());
  }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated) {
      loadHistory();
    }
  }, [isAuthenticated, loadHistory]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatLayout>
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Chat History
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                View and manage your previous conversations with the AI agent.
              </p>
            </div>

            <ConversationHistoryView
              messages={messages}
              status={historyStatus}
              error={historyError}
              onRetry={loadHistory}
              onStartChat={() => router.push('/chat')}
              hasMore={historyHasMore}
              isLoadingOlder={isLoadingOlderHistory}
              olderError={olderHistoryError}
              onLoadOlder={handleLoadOlder}
            />
          </div>
        </div>
      </div>
    </ChatLayout>
  );
}
