"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  sendMessage,
  regenerateLastResponse,
  ABORT_ERROR,
  clearMessages,
  updateMessage,
  saveConversationLocally,
  queueMessage,
  addMessage as reduxAddMessage,
  addPendingMessage,
} from "@/store/slices/chatSlice";
import AgentMessage from "@/components/chat/AgentMessage";
import UserMessage from "@/components/chat/UserMessage";
import { TagWidget } from "@/components/chat/TagWidget";
import { OfflineIndicator } from "@/components/chat/OfflineIndicator";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import {
  Send,
  Mic,
  Square,
  Sun,
  Clock,
  Copy,
} from "lucide-react";
import toast from "react-hot-toast";
import { ChatMessage } from "@/types";
import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AgentToolsMenu } from "@/components/chat/AgentToolsMenu";
import { QueryStopButton } from "@/components/chat/QueryStopButton";

// ─── Speech Recognition ambient types (used by the old transcription path) ────

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  onstart: () => void;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ChatEngine: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const {
    messages,
    isLoading: isChatLoading,
    isTyping,
    currentConversation,
    isOnline,
    pendingMessages,
  } = useAppSelector((state) => state.chat);
  const { processQueue } = useOfflineQueue();
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [speechResult, setSpeechResult] = useState("");
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inflightRef = useRef<{ abort: () => void; unwrap: () => Promise<unknown> } | null>(null);
  const lastDraftRef = useRef("");

  // ── Legacy speech-to-text (transcription → text input) ───────────────────
  // Kept for the Mic button when MediaRecorder is NOT supported
  const [isLegacyRecording, setIsLegacyRecording] = useState(false);
  const [legacyRecordingTime, setLegacyRecordingTime] = useState(0);
  const legacyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ── Voice message recorder (MediaRecorder) ────────────────────────────────
  const {
    status: voiceStatus,
    elapsedSeconds,
    liveTranscript,
    recording,
    isSupported: isVoiceSupported,
    startRecording,
    stopRecording,
    cancelRecording,
    reset: resetRecorder,
  } = useVoiceRecorder();

  const isVoiceRecording = voiceStatus === 'recording';
  const isVoicePreview = voiceStatus === 'stopped';

  // ── Thread handlers ───────────────────────────────────────────────────────
  const handleOpenThread = (messageId: string) => {
    if (activeThread?.rootMessageId === messageId) {
      dispatch(closeThread());
    } else {
      dispatch(openThread(messageId));
    }
  };

  const handleCloseThread = () => dispatch(closeThread());

  // Listen for thread replies from other participants
  useSocketEvent('thread:new_reply', (data: unknown) => {
    const payload = data as { threadId: string; message: ChatMessage; userId: string };
    if (payload.userId === user?.id) return;
    dispatch(addReply(payload.message));
    toast(`New reply in thread`, { icon: '💬' });
  });

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [messages, isTyping, voiceStatus, prefersReducedMotion]);

  useEffect(() => {
    if (currentConversation && messages.length > 0) {
      dispatch(saveConversationLocally(currentConversation));
    }
  }, [dispatch, currentConversation, messages.length]);

  // Cleanup legacy recorder on unmount
  useEffect(() => {
    if (currentConversation?.id && pathname === "/chat") {
      router.replace(`/chat/${encodeURIComponent(currentConversation.id)}`, { scroll: false });
    }
  }, [currentConversation?.id, pathname, router]);

  useEffect(() => {
    return () => {
      if (legacyTimerRef.current) clearInterval(legacyTimerRef.current);
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      inflightRef.current?.abort();
    };
  }, []);

  // Initialize legacy SpeechRecognition (used only when MediaRecorder unavailable)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = "en-US";

        recognitionRef.current.onstart = () => {
          setIsListening(true);
        };

        recognitionRef.current.onresult = (event) => {
          let finalTranscript = "";
          let interimTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            setSpeechResult(finalTranscript);
            setInputValue(finalTranscript);
            if (recognitionRef.current) {
              recognitionRef.current.stop();
            }
          } else {
            setSpeechResult(interimTranscript);
          }
        };

        recognitionRef.current.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
          setIsListening(false);
          setIsRecording(false);

          let errorMessage = "Speech recognition failed. ";
          switch (event.error) {
            case "no-speech":
              errorMessage += "No speech was detected.";
              break;
            case "audio-capture":
              errorMessage += "No microphone was found.";
              break;
            case "not-allowed":
              errorMessage += "Microphone access denied.";
              break;
            case "network":
              errorMessage += "Network error occurred.";
              break;
            default:
              errorMessage += "Please try again.";
          }
          toast.error(errorMessage);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
          setIsRecording(false);
          if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            setRecordingTime(0);
          }
        };
      }
      if (finalTranscript) {
        setInputValue(finalTranscript);
        recognition.stop();
      }
    };
    recognition.onerror = (event) => {
      setIsLegacyRecording(false);
      if (legacyTimerRef.current) clearInterval(legacyTimerRef.current);
      const msgs: Record<string, string> = {
        'no-speech': 'No speech detected.',
        'audio-capture': 'No microphone found.',
        'not-allowed': 'Microphone access denied.',
        'network': 'Network error.',
      };
      toast.error('Speech recognition failed. ' + (msgs[event.error] ?? 'Please try again.'));
    };
    recognition.onend = () => {
      setIsLegacyRecording(false);
      if (legacyTimerRef.current) {
        clearInterval(legacyTimerRef.current);
        setLegacyRecordingTime(0);
      }
    };

    recognitionRef.current = recognition;
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isChatLoading || isTyping) return;
    const message = inputValue.trim();
    lastDraftRef.current = message;
    setInputValue("");

    try {
      const queryWithTool = selectedTool
        ? `[Using ${selectedTool} tool] ${message}`
        : message;

      if (!isOnline) {
        // Queue message for offline
        const msgId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        dispatch(queueMessage({ id: msgId, query: queryWithTool }));

        // Add optimistic user message
        const userMessage: ChatMessage = {
          id: msgId,
          type: "user",
          content: message,
          timestamp: new Date().toISOString(),
        };
        dispatch(reduxAddMessage(userMessage));
        dispatch(addPendingMessage(msgId));

        toast.info(
          "You're offline. Message queued and will send when back online.",
        );
        return;
      }

      const request = dispatch(sendMessage(queryWithTool));
      inflightRef.current = request;
      await request.unwrap();
      inflightRef.current = null;
    } catch (error: any) {
      inflightRef.current = null;
      if (error === ABORT_ERROR || error?.name === "AbortError") {
        setInputValue(lastDraftRef.current);
        return;
      }
      toast.error(error || "Failed to send message");
    }
  };

  const handleStopQuery = () => {
    inflightRef.current?.abort();
    setInputValue(lastDraftRef.current);
  };

  const handleRegenerate = async () => {
    if (isChatLoading || isTyping || currentConversation?.isActive === false) return;
    try {
      const request = dispatch(regenerateLastResponse());
      inflightRef.current = request;
      await request.unwrap();
      inflightRef.current = null;
    } catch (error: any) {
      inflightRef.current = null;
      if (error === ABORT_ERROR || error === "busy" || error === "inactive") return;
      toast.error(error || "Failed to regenerate");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    dispatch(
      updateMessage({ id: messageId, updates: { content: newContent } }),
    );
    toast.success("Message updated");
  };

  // Legacy: toggle speech-to-text (fallback when MediaRecorder not supported)
  const toggleLegacyRecording = () => {
    if (isLegacyRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current)
        clearInterval(recordingIntervalRef.current);
    } else {
      if (!recognitionRef.current) {
        toast.error("Speech recognition is not supported in this browser");
        return;
      }
      setSpeechResult("");
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      recognitionRef.current.start();
    }
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ── Recording overlay (shown inside the input box while recording) ─────────
  const renderRecordingOverlay = () => {
    if (!isVoiceRecording) return null;
    const pct = Math.min(elapsedSeconds / VOICE_MESSAGE.MAX_DURATION_SECONDS, 1);
    return (
      <div className="flex items-center gap-3 mb-4">
        {/* Animated pulse dot */}
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>

        {/* Live transcript preview */}
        <span className="flex-1 text-sm text-gray-300 truncate min-w-0">
          {liveTranscript || (
            <span className="text-gray-500 italic">Listening…</span>
          )}
        </span>

        {/* Elapsed / max */}
        <span className="text-xs text-red-400 font-mono shrink-0">
          {formatSeconds(elapsedSeconds)} / {formatSeconds(VOICE_MESSAGE.MAX_DURATION_SECONDS)}
        </span>

        {/* Progress bar */}
        <div className="w-20 h-1 rounded-full bg-gray-700 shrink-0 overflow-hidden">
          <div
            className="h-full bg-red-400 rounded-full transition-all duration-1000"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      </div>
    );
  };

  // ── Pre-send preview strip ─────────────────────────────────────────────────
  const renderVoicePreview = () => {
    if (!isVoicePreview || !recording) return null;
    return (
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <VoiceMessagePlayer
            audioUrl={recording.audioUrl}
            duration={recording.duration}
            transcript={recording.transcript}
            variant="user"
          />
        </div>
        {/* Cancel preview */}
        <button
          onClick={resetRecorder}
          className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Discard voice message"
          aria-label="Discard voice message"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  };

  // ── Input area ────────────────────────────────────────────────────────────
  const renderInput = (isSticky: boolean = false) => (
    <div
      className={`w-full ${isSticky ? "max-w-4xl mx-auto px-4 py-6" : "max-w-3xl mb-8"}`}
    >
      <div className="relative bg-[#1A1A2E] rounded-2xl p-6 border border-gray-800/50 shadow-xl">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder={isRecording ? "Listening..." : "Ask ChenPilot..."}
          disabled={isRecording}
          className="w-full bg-transparent border-none text-white placeholder:text-gray-500 focus:outline-none text-lg mb-4"
        />

        {isRecording && (
          <div className="absolute right-6 top-6 flex items-center space-x-2 text-red-400">
            <div className="flex space-x-1">
              <div className="w-1 h-4 bg-red-400 rounded-full animate-pulse"></div>
              <div
                className="w-1 h-4 bg-red-400 rounded-full animate-pulse"
                style={{ animationDelay: "0.1s" }}
              ></div>
              <div
                className="w-1 h-4 bg-red-400 rounded-full animate-pulse"
                style={{ animationDelay: "0.2s" }}
              ></div>
            </div>
            <span className="text-xs font-mono">
              {formatRecordingTime(recordingTime)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          {/* Tools picker */}
          <div className="flex items-center space-x-3">
            <AgentToolsMenu
              selectedTool={selectedTool}
              onSelect={setSelectedTool}
            />
            <TagWidget />
          </div>

          <QueryStopButton inFlight={isChatLoading || isTyping} onStop={handleStopQuery} />
          <button
            type="button"
            onClick={() =>
              inputValue.trim() ? handleSendMessage() : toggleVoiceRecording()
            }
            disabled={isChatLoading || isTyping}
            className={`p-3 rounded-lg transition-colors ${isRecording
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : inputValue.trim()
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
              }`}
          >
            {isRecording ? (
              <Square className="h-6 w-6" />
            ) : inputValue.trim() ? (
              <Send className="h-6 w-6" />
            ) : (
              <Mic className="h-6 w-6" />
            )}

            {/* Send voice message button (preview state) */}
            {isVoicePreview && (
              <button
                type="button"
                onClick={handleSendVoiceMessage}
                disabled={isChatLoading}
                className="p-3 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                title="Send voice message"
                aria-label="Send voice message"
              >
                <SendHorizonal className="h-6 w-6" />
              </button>
            )}

            {/* Main mic / stop / send button */}
            {!isVoicePreview && (
              <button
                type="button"
                onClick={() => {
                  if (inputValue.trim() && !isVoiceRecording) {
                    handleSendMessage();
                  } else if (isVoiceSupported) {
                    handleVoiceMicClick();
                  } else {
                    toggleLegacyRecording();
                  }
                }}
                disabled={isChatLoading || isTyping}
                className={cn(
                  'p-3 rounded-lg transition-colors',
                  isVoiceRecording || isLegacyRecording
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : inputValue.trim()
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'text-gray-400 hover:bg-gray-800/50 hover:text-white',
                )}
                title={
                  isVoiceRecording || isLegacyRecording
                    ? 'Stop recording'
                    : inputValue.trim()
                      ? 'Send message'
                      : 'Record voice message'
                }
                aria-label={
                  isVoiceRecording || isLegacyRecording
                    ? 'Stop recording'
                    : inputValue.trim()
                      ? 'Send message'
                      : 'Record voice message'
                }
              >
                {isVoiceRecording || isLegacyRecording ? (
                  <Square className="h-6 w-6" />
                ) : inputValue.trim() ? (
                  <Send className="h-6 w-6" />
                ) : (
                  <Mic className="h-6 w-6" />
                )}
              </button>
            )}
        </div>
      </div>

    </div>
    </div >
  );

// ── Render ────────────────────────────────────────────────────────────────
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
                Happy{" "}
                {new Date().toLocaleDateString("en-US", { weekday: "long" })},{" "}
                {user?.name || "User"}
              </h2>
            </div>
            <p className="text-lg text-gray-400">What can we do today?</p>
          </div>
          {renderInput(false)}

          <div className="w-full max-w-2xl">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                "Check wallet balance",
                "Recent transactions",
                "Deploy Stellar account",
                "Create contact",
                "Swap USDC to XLM",
                "Bitcoin price",
              ].map((question, index) => (
                <button
                  key={index}
                  onClick={() => setInputValue(question)}
                  className="text-left px-3 py-2 bg-transparent border border-gray-700/50 rounded-lg hover:border-gray-600 transition-colors text-gray-400 hover:text-white"
                >
                  <span className="text-xs font-medium">{question}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.type === "user" ? (
                <UserMessage
                  message={message}
                  onCopy={copyToClipboard}
                  onEdit={handleEditMessage}
                />
              ) : (
                <div className="max-w-2xl w-full">
                  <AgentMessage
                    message={message}
                    onCopy={copyToClipboard}
                    onRegenerate={handleRegenerate}
                    canRegenerate={
                      message.type === "agent" &&
                      message.id === [...messages].reverse().find((item) => item.type === "agent")?.id &&
                      !isChatLoading &&
                      !isTyping &&
                      currentConversation?.isActive !== false
                    }
                  />
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
                    <div
                      className={`w-2 h-2 bg-pink-400 rounded-full ${prefersReducedMotion ? "" : "animate-bounce"}`}
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className={`w-2 h-2 bg-purple-400 rounded-full ${prefersReducedMotion ? "" : "animate-bounce"}`}
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                  <span className="text-sm text-gray-400">
                    ChenPilot is thinking...
                  </span>
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

    {messages.length > 0 && (
      <div className="relative z-10 border-t border-gray-800/50 bg-[#0F0F23]/80 backdrop-blur-xl">
        {renderInput(true)}
      </div>
    )}

    <style jsx>{`
        @keyframes slide-up {
          0% {
            transform: translateY(10px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
      `}</style>
  </div>
);

export const ChatEngine: React.FC<ChatEngineProps> = ({
  messages,
  targetMessageId,
  onLoadMoreHistory,
  isFetchingHistory,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const parentRef = useRef<HTMLDivElement>(null);
  const isShortList = messages.length <= SMALL_LIST_THRESHOLD;

  // Initialize virtualizer
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Average initial message height estimate
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Scroll to bottom on new incoming messages if near bottom
  const scrollToBottom = useCallback(() => {
    if (messages.length > 0) {
      rowVirtualizer.scrollToIndex(messages.length - 1, {
        align: 'end',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [messages.length, rowVirtualizer]);

  // Handle target message navigation (Search jump)
  useEffect(() => {
    if (targetMessageId) {
      const targetIndex = messages.findIndex((m) => m.id === targetMessageId);
      if (targetIndex !== -1) {
        rowVirtualizer.scrollToIndex(targetIndex, {
          align: 'center',
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
      }
    }
  }, [targetMessageId, messages, rowVirtualizer]);

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar relative"
      style={{ contain: 'strict' }}
    >
      {isShortList ? (
        /* Fallback for short conversations: standard un-virtualized DOM */
        <div className="flex flex-col space-y-4">
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
        </div>
      ) : (
        /* Virtualized rendering for long conversations */
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const message = messages[virtualRow.index];
            return (
              <div
                key={message.id || virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MessageRow message={message} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChatEngine;
