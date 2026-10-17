'use client';

import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Send, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { closeThread, addReply, setThreadTyping } from '@/store/slices/chatSlice';
import { useSocket } from '@/hooks/useSocket';
import { ChatMessage } from '@/types';
import toast from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface ThreadPanelProps {
  /** Called so ChatEngine can update its own layout when panel opens/closes */
  onClose?: () => void;
}

export default function ThreadPanel({ onClose }: ThreadPanelProps) {
  const dispatch = useAppDispatch();
  const { messages } = useAppSelector((state) => state.chat);
  const { activeThread } = useAppSelector((state) => state.chat);
  const { user } = useAppSelector((state) => state.auth);
  const { emit } = useSocket();
  const prefersReducedMotion = useReducedMotion();

  const [replyInput, setReplyInput] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Find the root message from the main messages list
  const rootMessage = messages.find((m) => m.id === activeThread?.rootMessageId);

  // Auto-scroll to bottom when new replies arrive
  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [activeThread?.replies.length, activeThread?.isTyping, prefersReducedMotion]);

  // Focus input when panel opens
  useEffect(() => {
    if (!collapsed) {
      inputRef.current?.focus();
    }
  }, [collapsed]);

  const handleClose = () => {
    dispatch(closeThread());
    onClose?.();
  };

  const handleSendReply = async () => {
    const text = replyInput.trim();
    if (!text || !activeThread || !user) return;

    setReplyInput('');

    // Build the user reply message
    const replyMsg: ChatMessage = {
      id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      threadId: activeThread.rootMessageId,
      parentId: activeThread.rootMessageId,
    };

    dispatch(addReply(replyMsg));

    // Notify other thread participants over the socket
    emit('thread:reply', {
      threadId: activeThread.rootMessageId,
      message: replyMsg,
      userId: user.id,
    });

    // Simulate an agent acknowledgment in-thread (lightweight stub)
    dispatch(setThreadTyping(true));
    try {
      await new Promise((res) => setTimeout(res, 800));
      const agentReply: ChatMessage = {
        id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'agent',
        content: `Got your reply in the thread. To ask ChenPilot a full question, use the main chat input.`,
        timestamp: new Date().toISOString(),
        threadId: activeThread.rootMessageId,
        parentId: replyMsg.id,
      };
      dispatch(addReply(agentReply));
    } finally {
      dispatch(setThreadTyping(false));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  if (!activeThread || !rootMessage) return null;

  const rootContent =
    typeof rootMessage.content === 'string'
      ? rootMessage.content
      : JSON.stringify(rootMessage.content);

  return (
    <aside
      className={cn(
        'flex flex-col bg-[#12122A] border-l border-gray-800 transition-all duration-300',
        collapsed ? 'w-12' : 'w-80 xl:w-96',
      )}
      aria-label="Thread replies"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-800 shrink-0">
        {!collapsed && (
          <div className="flex items-center space-x-2 min-w-0">
            <MessageSquare className="h-4 w-4 text-purple-400 shrink-0" />
            <span className="text-sm font-medium text-white truncate">Thread</span>
            {activeThread.replies.length > 0 && (
              <span className="text-xs text-gray-400">
                {activeThread.replies.length}{' '}
                {activeThread.replies.length === 1 ? 'reply' : 'replies'}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center space-x-1 ml-auto">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title={collapsed ? 'Expand thread' : 'Collapse thread'}
            aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
          >
            {collapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
          {!collapsed && (
            <button
              onClick={handleClose}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title="Close thread"
              aria-label="Close thread"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {/* ── Root message preview ── */}
          <div className="px-4 py-3 border-b border-gray-800/60 shrink-0">
            <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Original message</p>
            <div
              className={cn(
                'rounded-xl px-3 py-2 text-sm',
                rootMessage.type === 'user'
                  ? 'bg-[#7C3AED]/20 text-purple-200 border border-purple-800/40'
                  : 'bg-gray-900/60 text-gray-300 border border-gray-700/40',
              )}
            >
              <p className="line-clamp-3 leading-relaxed">{rootContent}</p>
            </div>
          </div>

          {/* ── Replies list ── */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {activeThread.replies.length === 0 && !activeThread.isTyping && (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No replies yet</p>
                <p className="text-xs text-gray-600 mt-1">Be the first to reply</p>
              </div>
            )}

            {activeThread.replies.map((reply) => (
              <ThreadReply key={reply.id} reply={reply} />
            ))}

            {/* Typing indicator */}
            {activeThread.isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-900/80 border border-gray-800 rounded-2xl px-4 py-3">
                  <div className="flex items-center space-x-1">
                    <div className={`w-1.5 h-1.5 bg-purple-400 rounded-full ${prefersReducedMotion ? '' : 'animate-bounce'}`} />
                    <div
                      className={`w-1.5 h-1.5 bg-pink-400 rounded-full ${prefersReducedMotion ? '' : 'animate-bounce'}`}
                      style={{ animationDelay: '0.1s' }}
                    />
                    <div
                      className={`w-1.5 h-1.5 bg-purple-400 rounded-full ${prefersReducedMotion ? '' : 'animate-bounce'}`}
                      style={{ animationDelay: '0.2s' }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={repliesEndRef} />
          </div>

          {/* ── Reply input ── */}
          <div className="px-4 py-3 border-t border-gray-800 shrink-0">
            <div className="relative bg-[#1A1A2E] rounded-xl border border-gray-700/60 focus-within:border-purple-600 transition-colors">
              <textarea
                ref={inputRef}
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Reply in thread… (Enter to send)"
                rows={2}
                className="w-full bg-transparent text-white placeholder:text-gray-500 focus:outline-none text-sm px-3 pt-3 pb-2 resize-none"
              />
              <div className="flex justify-end px-2 pb-2">
                <button
                  onClick={handleSendReply}
                  disabled={!replyInput.trim()}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    replyInput.trim()
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'text-gray-600 cursor-not-allowed',
                  )}
                  title="Send reply"
                  aria-label="Send reply"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-1.5 text-center">
              Shift+Enter for a new line
            </p>
          </div>
        </>
      )}
    </aside>
  );
}

// ── Individual reply bubble ────────────────────────────────────────────────────

interface ThreadReplyProps {
  reply: ChatMessage;
}

function ThreadReply({ reply }: ThreadReplyProps) {
  const content =
    typeof reply.content === 'string' ? reply.content : JSON.stringify(reply.content);

  const isUser = reply.type === 'user';
  const time = new Date(reply.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-[#7C3AED] text-white'
            : 'bg-gray-900/80 border border-gray-800 text-gray-200',
        )}
      >
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
      <span className="text-[10px] text-gray-600 mt-1 px-1">{time}</span>
    </div>
  );
}
