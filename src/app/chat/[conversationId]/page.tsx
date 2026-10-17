'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  initializeChatHistory,
  loadChatHistory,
  loadConversationsLocally,
  setCurrentConversation,
} from '@/store/slices/chatSlice';
import { ClientOnlyChatLayout } from '@/components/layout/ClientOnlyChatLayout';
import ChatEngine from '@/components/chat/ChatEngine';

export default function ConversationPage() {
  const { conversationId: rawConversationId } = useParams<{ conversationId: string }>();
  const conversationId = rawConversationId;
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { conversations, currentConversation } = useAppSelector((state) => state.chat);
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    dispatch(loadConversationsLocally());
    dispatch(initializeChatHistory());
    setStorageLoaded(true);
  }, [dispatch]);

  const conversation = conversations.find((item) => item.id === conversationId);

  useEffect(() => {
    if (!storageLoaded) return;
    if (!conversation) {
      setNotFound(true);
      dispatch(setCurrentConversation(null));
      return;
    }
    setNotFound(false);
    dispatch(setCurrentConversation(conversation));
    dispatch(loadChatHistory(conversationId));
  }, [conversation, conversationId, dispatch, storageLoaded]);

  if (!isAuthenticated) {
    return (
      <ClientOnlyChatLayout>
        <div className="flex h-full items-center justify-center text-gray-300">Redirecting to login...</div>
      </ClientOnlyChatLayout>
    );
  }

  return (
    <ClientOnlyChatLayout>
      {notFound ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-semibold text-white">Conversation not found</h1>
          <p className="text-gray-400">This conversation may have been deleted or the link may be incorrect.</p>
          <button
            type="button"
            onClick={() => router.push('/chat')}
            className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700"
          >
            Start a new chat
          </button>
        </div>
      ) : (
        <>
          <header className="border-b border-gray-700 px-6 py-3 text-white">
            <h1 className="font-semibold">{conversation?.title || conversationId}</h1>
            <p className="text-xs text-gray-400">Conversation {conversationId}</p>
          </header>
          {currentConversation?.id === conversationId && <ChatEngine />}
        </>
      )}
    </ClientOnlyChatLayout>
  );
}
