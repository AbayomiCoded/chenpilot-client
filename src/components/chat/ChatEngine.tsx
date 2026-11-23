"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send, Mic, Square, Sun } from "lucide-react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  addMessage as reduxAddMessage,
  setMessageDelivery,
  addPendingMessage,
  queueMessage,
  sendMessage,
  updateMessage,
} from "@/store/slices/chatSlice";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { AgentToolsMenu } from "@/components/chat/AgentToolsMenu";
import AgentMessage from "@/components/chat/AgentMessage";
import UserMessage from "@/components/chat/UserMessage";
import { OfflineIndicator } from "@/components/chat/OfflineIndicator";
import { TagWidget } from "@/components/chat/TagWidget";
import type { ChatMessage } from "@/types";

export default function ChatEngine() {
  const dispatch = useAppDispatch();
  const prefersReducedMotion = useReducedMotion();
  const { processQueue } = useOfflineQueue();
  const { user } = useAppSelector((state) => state.auth);
  const {
    messages,
    isLoading: isChatLoading,
    isTyping,
    isOnline,
    pendingMessages,
    streamingResponse,
  } = useAppSelector((state) => state.chat);

  const [inputValue, setInputValue] = useState("");
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    status: voiceStatus,
    elapsedSeconds,
    liveTranscript,
    recording,
    isSupported: isVoiceSupported,
    startRecording,
    stopRecording,
    reset: resetRecorder,
  } = useVoiceRecorder();

  const isVoiceRecording = voiceStatus === "recording";
  const isVoicePreview = voiceStatus === "stopped";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [messages, isTyping, prefersReducedMotion]);

  useEffect(() => {
    void processQueue();
  }, [processQueue]);

  const handleSendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isChatLoading || isTyping) {
      return;
    }

    const messageText = selectedTool ? `[Using ${selectedTool} tool] ${trimmed}` : trimmed;
    setInputValue("");

    try {
      if (!isOnline) {
        const msgId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const optimisticMessage: ChatMessage = {
          id: msgId,
          type: "user",
          content: trimmed,
          timestamp: new Date().toISOString(),
          metadata: { delivery: "queued", status: "pending", optimisticId: msgId, tempId: msgId },
        };
        dispatch(queueMessage({ id: msgId, query: messageText }));
        dispatch(reduxAddMessage(optimisticMessage));
        dispatch(addPendingMessage(msgId));
        toast("You are offline. The message is queued.");
        return;
      }

      await dispatch(sendMessage(messageText)).unwrap();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to send message";
      toast.error(message);
    }
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    dispatch(updateMessage({ id: messageId, updates: { content: newContent } }));
    toast.success("Message updated");
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const renderInput = (isSticky = false) => (
    <div className={`w-full ${isSticky ? "max-w-4xl mx-auto px-4 py-6" : "max-w-3xl mb-8"}`}>
      <div className="relative bg-[#1A1A2E] rounded-2xl p-6 border border-gray-800/50 shadow-xl">
        <ChatDraftComposer
          inputRef={inputRef}
          conversationId={currentConversation?.id ?? null}
          value={inputValue}
          onChange={setInputValue}
          onEnter={() => {
            void handleSendMessage();
      <div className="rounded-2xl border border-gray-800/50 bg-[#1A1A2E] p-5 shadow-xl">
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSendMessage();
            }
          }}
          placeholder={isVoiceRecording ? "Listening..." : "Ask ChenPilot..."}
          disabled={isVoiceRecording}
          className="w-full bg-transparent border-none text-white placeholder:text-gray-500 focus:outline-none text-lg mb-4"
        />

        {isVoiceRecording && (
          <div className="absolute right-6 top-6 flex items-center space-x-2 text-red-400">
            <div className="flex space-x-1">
              <div className="w-1 h-4 bg-red-400 rounded-full animate-pulse" />
              <div className="w-1 h-4 bg-red-400 rounded-full animate-pulse" style={{ animationDelay: "0.1s" }} />
              <div className="w-1 h-4 bg-red-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
            </div>
            <span className="text-xs font-mono">{elapsedSeconds}s</span>
          </div>
        )}

        {isVoicePreview && recording && (
          <div className="mb-4 rounded-lg border border-purple-500/30 bg-purple-500/10 p-3 text-sm text-purple-100">
            <div className="font-medium">Voice preview</div>
            <div className="mt-1 text-purple-200">{recording.transcript || "Voice message ready"}</div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (inputValue.trim()) {
                    void handleSendMessage();
                  }
                }}
                className="rounded bg-purple-600 px-3 py-1.5 text-white hover:bg-purple-500"
              >
                Send
              </button>
              <button
                type="button"
                onClick={resetRecorder}
                className="rounded border border-white/20 px-3 py-1.5 text-gray-200 hover:bg-white/5"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AgentToolsMenu selectedTool={selectedTool} onSelect={setSelectedTool} />
            <TagWidget />
          </div>

          <button
            type="button"
            onClick={() => {
              if (inputValue.trim()) {
                void handleSendMessage();
                return;
              }
              if (isVoiceSupported) {
                if (isVoiceRecording) {
                  stopRecording();
                } else {
                  void startRecording();
                }
              } else {
                toast.error("Voice recording is not supported in this browser.");
              }
            }}
            disabled={isChatLoading || isTyping}
            className={`p-3 rounded-lg transition-colors ${
              isVoiceRecording
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : inputValue.trim()
                  ? "bg-purple-600 text-white hover:bg-purple-700"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
            }`}
          >
            {isVoiceRecording ? <Square className="h-6 w-6" /> : inputValue.trim() ? <Send className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#0F0F23] text-white overflow-hidden relative">
      <OfflineIndicator />
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8">
            <div className="text-center mb-8">
              <div className="flex items-center justify-center mb-4">
                <Sun className="h-8 w-8 text-orange-400 mr-3" />
                <h2 className="text-2xl font-light text-white">
                  Happy {new Date().toLocaleDateString("en-US", { weekday: "long" })}, {user?.name || "User"}
                </h2>
              </div>
              <p className="text-lg text-gray-400">What can we do today?</p>
            </div>
            {renderInput(false)}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                {message.type === "user" ? (
                  <UserMessage message={message} onCopy={copyToClipboard} onEdit={handleEditMessage} />
                ) : (
                  <div className="max-w-2xl w-full">
                    <AgentMessage message={message} onCopy={copyToClipboard} />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl px-6 py-4 shadow-lg">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 bg-purple-400 rounded-full ${prefersReducedMotion ? "" : "animate-bounce"}`} />
                      <div className={`w-2 h-2 bg-pink-400 rounded-full ${prefersReducedMotion ? "" : "animate-bounce"}`} style={{ animationDelay: "0.1s" }} />
                      <div className={`w-2 h-2 bg-purple-400 rounded-full ${prefersReducedMotion ? "" : "animate-bounce"}`} style={{ animationDelay: "0.2s" }} />
                    </div>
                    <span className="text-sm text-gray-400">ChenPilot is thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <div className="relative z-10 border-t border-gray-800/50 bg-[#0F0F23]/80 backdrop-blur-xl">
          {renderInput(true)}
        </div>
      )}
    </div>
  );
}
