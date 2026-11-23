import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { logger } from "../../utils/logger";
import { ChatMessage, AgentQueryRequest, Conversation, MessageFeedback } from "@/types";
import { AgentQueryResponse } from "@/types/agent";
import apiService from "@/services/api";
import { VOICE_MESSAGE } from "@/constants";

// ─── Voice message payload ────────────────────────────────────────────────────
export interface SendVoiceMessagePayload {
  audioUrl: string;
  duration: number;
  mimeType: string;
  transcript: string;
  sizeBytes: number;
}

interface ChatState {
  messages: ChatMessage[];
  conversations: Conversation[];
  currentConversation: Conversation | null;
  isLoading: boolean;
  error: string | null;
  isTyping: boolean;
  agentStatus: {
    isConnected: boolean;
    lastHealthCheck: string | null;
    capabilities: AgentCapabilities | null;
  };
  chatHistory: { [conversationId: string]: ChatMessage[] };
  tags: { [userId: string]: string[] };
  selectedTags: string[];
  isOnline: boolean;
  messageQueue: Array<{ id: string; query: string; timestamp: string }>;
  pendingMessages: Set<string>;
  optimisticUpdates: Map<string, ChatMessage>;
  /** Server history load state, kept separate from `messages` so a failure is not shown as empty (#265). */
  historyStatus: ChatHistoryStatus;
  historyError: string | null;
  /** Partial agent reply while a streamed response is in flight (#261); cleared when it settles. */
  streamingResponse: { requestId: string; text: string } | null;
  /** Cursor for the next older history page (#264); null when unknown or exhausted. */
  historyCursor: string | null;
  historyHasMore: boolean;
  isLoadingOlderHistory: boolean;
  olderHistoryError: string | null;
}

const initialState: ChatState = {
  messages: [],
  conversations: [],
  currentConversation: null,
  isLoading: false,
  error: null,
  isTyping: false,
  agentStatus: {
    isConnected: false,
    lastHealthCheck: null,
    capabilities: null,
  },
  chatHistory: {},
  tags: {},
  selectedTags: [],
  isOnline: typeof window !== "undefined" && navigator.onLine,
  messageQueue: [],
  pendingMessages: new Set(),
  optimisticUpdates: new Map(),
  historyStatus: "idle",
  historyError: null,
  streamingResponse: null,
  historyCursor: null,
  historyHasMore: false,
  isLoadingOlderHistory: false,
  olderHistoryError: null,
};

const DEFAULT_CONVERSATION_TITLE = "New Chat";

export const generateConversationTitle = (content: unknown): string => {
  if (typeof content !== "string") return DEFAULT_CONVERSATION_TITLE;

  const normalized = content.trim().replace(/\s+/g, " ");
  if (!normalized) return DEFAULT_CONVERSATION_TITLE;

  const characters = Array.from(normalized);
  return characters.length > 60
    ? `${characters.slice(0, 57).join("")}...`
    : normalized;
};

const isUntitledConversation = (conversation: Conversation): boolean =>
  !conversation.title?.trim() || conversation.title === DEFAULT_CONVERSATION_TITLE;

const titleConversationFromMessage = (
  conversation: Conversation | null,
  message: ChatMessage,
): Conversation | null => {
  if (!conversation || message.type !== "user" || !isUntitledConversation(conversation)) {
    return conversation;
  }

  return { ...conversation, title: generateConversationTitle(message.content) };
};

// Async thunks
// Removed server-side conversation thunks - now handled client-side

// Helper function to sort messages by timestamp
const sortMessagesByTimestamp = (messages: ChatMessage[]): ChatMessage[] => {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    return aTime - bTime;
  });
};

export const getOrCreateActiveConversation = createAsyncThunk(
  "chat/getOrCreateActiveConversation",
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as ChatThunkState;
      const currentConversation = state.chat.currentConversation;

      // If we already have an active conversation, return it
      if (currentConversation) {
        return currentConversation;
      }

      // Create a new conversation locally
      const newConversation: Conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: "New Chat",
        description: "A new conversation",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: state.auth.user?.id || "anonymous",
        messageCount: 0,
      };

      return newConversation;
    } catch {
      return rejectWithValue("Failed to create conversation");
    }
  },
);

// Helper functions for message ordering & timestamps (#86)
export const getMessageTimestamp = (message: ChatMessage): number => {
  // 1. Root serverTimestamp (number or string)
  if (message.serverTimestamp !== undefined && message.serverTimestamp !== null) {
    const ts = typeof message.serverTimestamp === 'number'
      ? message.serverTimestamp
      : new Date(message.serverTimestamp).getTime();
    if (!isNaN(ts)) return ts;
  }

  // 2. metadata.serverTimestamp (number or string)
  if (message.metadata?.serverTimestamp !== undefined && message.metadata?.serverTimestamp !== null) {
    const ts = typeof message.metadata.serverTimestamp === 'number'
      ? message.metadata.serverTimestamp
      : new Date(message.metadata.serverTimestamp).getTime();
    if (!isNaN(ts)) return ts;
  }

  // 3. metadata.clientTimestamp (number or string)
  if (message.metadata?.clientTimestamp !== undefined && message.metadata?.clientTimestamp !== null) {
    const ts = typeof message.metadata.clientTimestamp === 'number'
      ? message.metadata.clientTimestamp
      : new Date(message.metadata.clientTimestamp).getTime();
    if (!isNaN(ts)) return ts;
  }

  // 4. Root timestamp (ISO string or unix ms or numeric string)
  if (message.timestamp) {
    const num = Number(message.timestamp);
    if (!isNaN(num) && num > 1000000000) {
      return num;
    }
    const ts = new Date(message.timestamp).getTime();
    if (!isNaN(ts)) return ts;
  }

  // 5. Fallback to 0
  return 0;
};

export const sortMessagesChronologically = (messages: ChatMessage[]): ChatMessage[] => {
  return [...messages].sort((a, b) => {
    const timeA = getMessageTimestamp(a);
    const timeB = getMessageTimestamp(b);
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    // Stable tie-breaker: user message comes before agent/system message for same timestamp
    if (a.type === 'user' && b.type !== 'user') return -1;
    if (a.type !== 'user' && b.type === 'user') return 1;
    return a.id.localeCompare(b.id);
  });
};

/**
 * Merge server messages into the local list by message id; the server copy wins (#265).
 */
export const mergeMessagesById = (existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const byId = new Map<string, ChatMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) {
    if (message?.id) byId.set(message.id, message);
  }
  return sortMessagesChronologically(Array.from(byId.values()));
};

/** Messages requested per history page (#264). */
export const HISTORY_PAGE_SIZE = 50;

/**
 * Load the newest page of chat history from the server (#265, #264). Locally cached messages
 * stay in place if this fails. A 404/501 means the backend has no history endpoint; that
 * resolves with no messages rather than an error, so the page falls back to the local cache.
 */
export const fetchChatHistory = createAsyncThunk(
  "chat/fetchChatHistory",
  async (_: void, { rejectWithValue }) => {
    try {
      return await apiService.getChatHistory({ limit: HISTORY_PAGE_SIZE });
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404 || status === 501) {
        return { messages: [] as ChatMessage[], nextCursor: null, hasMore: false };
      }
      return rejectWithValue(
        error?.response?.data?.message || error?.message || "Failed to load chat history",
      );
    }
  },
);

/**
 * Load the next older page of history using the stable cursor from the previous page (#264).
 * Skipped while another page is loading or when there is nothing older.
 */
export const loadOlderHistory = createAsyncThunk(
  "chat/loadOlderHistory",
  async (_: void, { getState, rejectWithValue }) => {
    const cursor = (getState() as { chat: ChatState }).chat.historyCursor as string;
    try {
      const page = await apiService.getChatHistory({ before: cursor, limit: HISTORY_PAGE_SIZE });
      return { page, cursor };
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.message || error?.message || "Failed to load older messages",
      );
    }
  },
  {
    condition: (_: void, { getState }) => {
      const chat = (getState() as { chat: ChatState }).chat;
      return Boolean(chat.historyHasMore && chat.historyCursor && !chat.isLoadingOlderHistory);
    },
  },
);

/**
 * Delete a conversation safely (#269): abort its in-flight agent requests, mark it deleted so
 * late responses are ignored, then remove it from state and storage. Confirmation happens in the UI.
 */
export const deleteConversation = createAsyncThunk(
  "chat/deleteConversation",
  async (conversationId: string, { dispatch }) => {
    const cancelled = cancelConversationRequests(conversationId);
    dispatch(chatSlice.actions.deleteConversationLocally(conversationId));
    return { conversationId, cancelled };
  },
);

/**
 * Keys that identify the same logical message across local, optimistic and server copies (#277).
 * `requestId` is shared by the user and agent message of one query, so it only matches within a type.
 */
const messageIdentityKeys = (message: ChatMessage): string[] => {
  const keys = [`id:${message.id}`];
  const meta = message.metadata;
  if (meta?.optimisticId) keys.push(`id:${meta.optimisticId}`);
  if (meta?.tempId) keys.push(`id:${meta.tempId}`);
  if (meta?.requestId) keys.push(`req:${message.type}:${meta.requestId}`);
  return keys;
};

/**
 * Merge messages received from the server (live socket events or a post-reconnect resync)
 * into the local list without duplicates (#277). An incoming message replaces the local
 * message it matches (same id, or its optimistic/temp id or request id), so the server
 * copy wins over the optimistic one. Unmatched messages are appended. Result is sorted.
 */
export const mergeIncomingMessages = (existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const merged = [...existing];
  const index = new Map<string, number>();
  merged.forEach((message, i) => {
    for (const key of messageIdentityKeys(message)) index.set(key, i);
  });

  for (const message of incoming) {
    const keys = messageIdentityKeys(message);
    const matchIdx = keys.map((key) => index.get(key)).find((i) => i !== undefined);

    if (matchIdx !== undefined) {
      const local = merged[matchIdx];
      merged[matchIdx] = {
        ...message,
        metadata: { ...local.metadata, ...message.metadata, status: message.metadata?.status ?? 'success' },
      };
      for (const key of messageIdentityKeys(merged[matchIdx])) index.set(key, matchIdx);
    } else {
      merged.push(message);
      for (const key of keys) index.set(key, merged.length - 1);
    }
  }

  return sortMessagesChronologically(merged);
};

export const ABORT_ERROR = "ABORT_ERR";

export type SendMessageArg =
  | string
  | {
      query: string;
      tempId?: string;
      clientTimestamp?: number;
      /** Reuse the original request id when retrying, so the backend can deduplicate (#262). */
      clientRequestId?: string;
    };

const clientRequestIdFor = (arg: SendMessageArg, requestId: string): string =>
  (typeof arg === 'object' && arg.clientRequestId) || `agent_req_${requestId}`;

/**
 * Retry metadata for a failed agent reply (#262): whether a retry is offered, plus what is
 * needed to resend the same prompt with the same request id.
 */
const retryMetadata = (query: string, tempId: string, requestId: string, errorKind: ReturnType<typeof classifyAgentError>) => ({
  errorKind,
  requestId,
  retryable: isRetryableErrorKind(errorKind),
  retryPrompt: query,
  retryTempId: tempId,
  stateChanging: isStateChangingQuery(query),
});

function isAbortError(error: unknown): boolean {
  const err = error as { code?: string; name?: string; message?: string };
  return (
    err?.code === "ERR_CANCELED" ||
    err?.name === "CanceledError" ||
    err?.name === "AbortError" ||
    err?.message === ABORT_ERROR
  );
}

/** Apply a delivery transition if the state machine allows it (#266). */
const transitionDelivery = (message: ChatMessage, to: DeliveryState): boolean => {
  if (!canTransition(getDeliveryState(message), to)) return false;
  message.metadata = {
    ...message.metadata,
    delivery: to,
    status: to === 'sent' ? 'success' : to === 'failed' ? 'failed' : 'pending',
  };
  return true;
};

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (arg: SendMessageArg, { getState, rejectWithValue, requestId, signal, dispatch }) => {
    const query = typeof arg === 'string' ? arg : arg.query;
    const tempId = typeof arg === 'object' && arg.tempId ? arg.tempId : `msg_optimistic_${requestId}`;
    const clientTimestamp = typeof arg === 'object' && arg.clientTimestamp ? arg.clientTimestamp : Date.now();

    try {
      const state = getState() as ChatThunkState;
      const userId = state.auth.user?.id;
      const currentConversation = state.chat.currentConversation;

      if (!userId) {
        return rejectWithValue("User not authenticated");
      }

      let conversation = currentConversation;
      if (!conversation) {
        conversation = {
          id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: "New Chat",
          description: "A new conversation",
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          userId: userId,
          messageCount: 0,
        };
      }

      const response = await apiService.queryAgent({ userId, query });
      // The client request id is the idempotency key: a retry reuses it so the backend can
      // recognise a repeat (#262).
      const clientRequestId = clientRequestIdFor(arg, requestId);

      // Track the request against its conversation so deleting the conversation aborts it (#269).
      // The Stop button aborts the thunk signal, which is forwarded to the tracked request.
      const tracked = trackConversationRequest(conversation.id);
      const onAbort = () => tracked.abort();
      signal.addEventListener("abort", onAbort);
      let response: AgentQueryResponse;
      try {
        response = await apiService.queryAgent(
          { userId, query, clientRequestId },
          {
            signal: tracked.signal,
            // Partial text is streamed into `streamingResponse` when the backend supports it (#261)
            onDelta: (text) => dispatch(streamingDelta({ requestId, text })),
          },
        );
      } catch (error) {
        // Aborted because the conversation was deleted, not because the user pressed Stop (#269)
        if (isConversationDeleted(conversation.id)) {
          return rejectWithValue(CONVERSATION_DELETED);
        }
        throw error;
      } finally {
        tracked.release();
        signal.removeEventListener("abort", onAbort);
      }

      // The conversation was deleted while waiting: drop the late response (#269)
      if (isConversationDeleted(conversation.id) || (tracked.signal.aborted && !signal.aborted)) {
        return rejectWithValue(CONVERSATION_DELETED);
      }

      // No HTTP response came back: the message never reached the service (#266)
      if (response.result.delivered === false) {
        return rejectWithValue(response.result.error || "Network error: message not delivered");
      }

      const content = response.result.data;
      if (
        typeof content === "string" &&
        (content.trim().startsWith("{") || content.trim().startsWith("["))
      ) {
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === "object") {
            logger.debug("[ChatSlice] Structured agent response:", parsed);
          }
        } catch {
          logger.debug("[ChatSlice] Response is not valid JSON, keeping as string");
        }
      }

      // Extract server timestamp from response if available
      const rawServerTimestamp = (response.result as any).serverTimestamp
        || (response.result as any).timestamp
        || (response as any).serverTimestamp
        || (response as any).timestamp
        || Date.now();

      const serverTimestamp = typeof rawServerTimestamp === 'string' && isNaN(Number(rawServerTimestamp))
        ? new Date(rawServerTimestamp).getTime()
        : Number(rawServerTimestamp);

      // Create user message representation with updated serverTimestamp and success status.
      // Adopt the server id when the backend returns one (#266).
      const serverId = response.result.userMessageId;
      const userMessage: ChatMessage = {
        id: serverId ?? tempId,
        type: 'user',
        content: query,
        timestamp: messageTimestamp,
        serverTimestamp: serverTimestampMs,
        metadata: {
          status: 'success',
          delivery: 'sent',
          serverId,
          clientTimestamp: clientTimestamp,
          serverTimestamp: serverTimestampMs,
          optimisticId: tempId,
          tempId,
        },
      };

      const agentMessage: ChatMessage = {
        id: `msg_agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "agent",
        content,
        timestamp: messageTimestamp,
        serverTimestamp: serverTimestampMs,
        metadata: {
          status: 'success',
          success: response.result.success,
          error: response.result.error,
          // Failed replies carry what a retry needs (#262); every reply keeps the request id (#274)
          ...(response.result.success === false
            ? retryMetadata(query, tempId, response.result.requestId ?? clientRequestId, response.result.errorKind ?? 'unknown')
            : {
                errorKind: response.result.errorKind,
                requestId: response.result.requestId ?? clientRequestId,
                stateChanging: response.result.stateChanging,
              }),
          executionTrace: response.result.executionTrace,
          serverTimestamp: serverTimestamp,
          // Store raw structured data in metadata if it was JSON
          rawData: typeof content !== "string" ? content : undefined,
        },
      };

      return { response, conversation, userMessage, agentMessage, tempId };
    } catch (error: unknown) {
      if (signal.aborted || isAbortError(error)) {
        return rejectWithValue(ABORT_ERROR);
      }
      return rejectWithValue(getErrorMessage(error, "Failed to send message"));
    }
  },
);

export const regenerateLastResponse = createAsyncThunk(
  "chat/regenerateLastResponse",
  async (_, { getState, rejectWithValue, signal }) => {
    const state = getState() as { chat: ChatState };
    if (state.chat.isTyping || state.chat.isLoading) {
      return rejectWithValue("busy");
    }
    if (state.chat.currentConversation && state.chat.currentConversation.isActive === false) {
      return rejectWithValue("inactive");
    }
    const messages: ChatMessage[] = state.chat.messages;
    const lastAgent = [...messages].reverse().find((message) => message.type === "agent");
    if (!lastAgent) {
      return rejectWithValue("no agent message");
    }
    const agentIndex = messages.findIndex((message) => message.id === lastAgent.id);
    const precedingUser = [...messages.slice(0, agentIndex)]
      .reverse()
      .find((message) => message.type === "user");
    if (!precedingUser) {
      return rejectWithValue("no user message");
    }
    const userId = state.auth.user?.id;
    if (!userId) {
      return rejectWithValue("User not authenticated");
    }
    try {
      const response = await apiService.queryAgent(
        { userId, query: String(precedingUser.content) },
        { signal },
      );
      return {
        agentId: lastAgent.id,
        content: response.result.data,
        response,
      };
    } catch (error: unknown) {
      if (signal.aborted || isAbortError(error)) {
        return rejectWithValue(ABORT_ERROR);
      }
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to regenerate message",
      );
    }
  },
);

// ─── sendVoiceMessage thunk ───────────────────────────────────────────────────

export const sendVoiceMessage = createAsyncThunk(
  'chat/sendVoiceMessage',
  async (payload: SendVoiceMessagePayload, { getState, rejectWithValue }) => {
    const state = getState() as ChatThunkState;

    if (state.chat.isLoading || state.chat.isTyping) {
      return rejectWithValue('A message is already in progress');
    }

    const userId = state.auth.user?.id;
    if (!userId) {
      return rejectWithValue('User not authenticated');
    }

    // Storage guard — warn if total voice data in history is getting large
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('chat_history') || '';
      if (stored.length > VOICE_MESSAGE.STORAGE_WARN_BYTES) {
        console.warn('[sendVoiceMessage] chat_history localStorage is large; consider pruning old voice messages');
      }
    }

    let conversation = state.chat.currentConversation;
    if (!conversation) {
      conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: 'New Chat',
        description: 'A new conversation',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId,
        messageCount: 0,
      };
    }

    // Display text is the transcript (or a placeholder)
    const displayText = payload.transcript
      ? `🎙 *Voice message* — "${payload.transcript}"`
      : '🎙 *Voice message*';

    const voiceMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'user',
      messageType: 'voice',
      content: displayText,
      timestamp: new Date().toISOString(),
      voice: {
        audioUrl: payload.audioUrl,
        duration: payload.duration,
        mimeType: payload.mimeType,
        transcript: payload.transcript,
        sizeBytes: payload.sizeBytes,
      },
    };

    // If there is a transcript, forward it to the agent as a regular text query
    let agentMessage: ChatMessage | null = null;
    if (payload.transcript.trim()) {
      try {
        const response = await apiService.queryAgent({ userId, query: payload.transcript });
        let content = response.result.data;
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === 'object') content = parsed;
        } catch { /* not JSON */ }

        agentMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'agent',
          content,
          timestamp: new Date().toISOString(),
          metadata: {
            success: response.result.success,
            error: response.result.error,
            executionTrace: response.result.executionTrace,
          },
        };
      } catch {
        // Non-fatal — voice message is still stored even if agent call fails
      }
    }

    return { conversation, voiceMessage, agentMessage };
  },
);

// ─── Slice ────────────────────────────────────────────────────────────────────

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    addMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.messages.push(action.payload);
      state.messages = sortMessagesChronologically(state.messages);
      state.currentConversation = titleConversationFromMessage(
        state.currentConversation,
        action.payload,
      );
    },
    addUserMessage: (state, action: PayloadAction<string>) => {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "user",
        content: action.payload,
        timestamp: new Date().toISOString(),
        serverTimestamp: Date.now(),
      };
      state.messages.push(userMessage);
      state.messages = sortMessagesChronologically(state.messages);
      state.currentConversation = titleConversationFromMessage(
        state.currentConversation,
        userMessage,
      );
    },
    addSystemMessage: (
      state,
      action: PayloadAction<{ content: string; metadata?: ChatMessage['metadata'] }>,
    ) => {
      const systemMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "system",
        content: action.payload.content,
        timestamp: new Date().toISOString(),
        serverTimestamp: Date.now(),
        metadata: action.payload.metadata,
      };
      state.messages.push(systemMessage);
      state.messages = sortMessagesChronologically(state.messages);
    },
    clearMessages: (state) => {
      state.messages = [];
    },
    setMessages: (state, action: PayloadAction<ChatMessage[]>) => {
      state.messages = sortMessagesChronologically(action.payload);
    },
    setConversations: (state, action: PayloadAction<Conversation[]>) => {
      state.conversations = action.payload;
    },
    setCurrentConversation: (
      state,
      action: PayloadAction<Conversation | null>,
    ) => {
      state.currentConversation = action.payload;
    },
    setTyping: (state, action: PayloadAction<boolean>) => {
      state.isTyping = action.payload;
    },
    updateMessage: (
      state,
      action: PayloadAction<{ id: string; updates: Partial<ChatMessage> }>,
    ) => {
      const index = state.messages.findIndex(
        (msg) => msg.id === action.payload.id,
      );
      if (index !== -1) {
        state.messages[index] = {
          ...state.messages[index],
          ...action.payload.updates,
        };
        state.messages = sortMessagesChronologically(state.messages);
      }
    },
    setMessageFeedback: (
      state,
      action: PayloadAction<{ messageId: string; feedback: MessageFeedback | null }>,
    ) => {
      const message = state.messages.find((item) => item.id === action.payload.messageId);
      if (!message) return;

      const metadata = { ...message.metadata };
      if (action.payload.feedback) {
        metadata.feedback = action.payload.feedback;
      } else {
        delete metadata.feedback;
      }
      message.metadata = metadata;
    },
    removeMessage: (state, action: PayloadAction<string>) => {
      state.messages = state.messages.filter(
        (msg) => msg.id !== action.payload,
      );
    },
    updateAgentStatus: (
      state,
      action: PayloadAction<{
        isConnected: boolean;
        lastHealthCheck: string | null;
        capabilities?: AgentCapabilities | null;
      }>,
    ) => {
      state.agentStatus = { ...state.agentStatus, ...action.payload };
    },
    setAgentConnected: (state, action: PayloadAction<boolean>) => {
      state.agentStatus.isConnected = action.payload;
    },
    startNewChat: (state) => {
      // Save current conversation messages to history
      if (state.currentConversation && state.messages.length > 0) {
        state.chatHistory[state.currentConversation.id] = [...state.messages];
      }
      // Clear current messages and conversation
      state.messages = [];
      state.currentConversation = null;
      // Save to localStorage
      if (typeof window !== "undefined") {
        const storageError = persistOfflineStorage("chat_history", state.chatHistory, "chat history");
        if (storageError) {
          state.error = storageError;
        } else {
          state.error = null;
        }
      }
    },
    loadChatHistory: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      const conversation = state.conversations.find((item) => item.id === conversationId);
      state.currentConversation = conversation ?? state.currentConversation;
      const loadedMessages = state.chatHistory[conversationId] ?? conversation?.messages ?? [];
      state.messages = sortMessagesChronologically(loadedMessages);
      if (state.chatHistory[conversationId]) {
        state.messages = sortMessagesByTimestamp(
          state.chatHistory[conversationId],
        );
      } else {
        state.messages = [];
      }
    },
    saveChatHistory: (state) => {
      if (state.currentConversation && state.messages.length > 0) {
        state.chatHistory[state.currentConversation.id] = [...state.messages];
        // Save to localStorage
        if (typeof window !== "undefined") {
          const storageError = persistOfflineStorage("chat_history", state.chatHistory, "chat history");
          if (storageError) {
            state.error = storageError;
          } else {
            state.error = null;
          }
        }
      }
    },
    deleteChatHistory: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      delete state.chatHistory[conversationId];
      // Save to localStorage
      if (typeof window !== "undefined") {
        const storageError = persistOfflineStorage("chat_history", state.chatHistory, "chat history");
        if (storageError) {
          state.error = storageError;
        } else {
          state.error = null;
        }
      }
    },
    initializeChatHistory: (state) => {
      if (typeof window !== "undefined") {
        const savedHistory = localStorage.getItem("chat_history");
        if (savedHistory) {
          try {
            const parsed = JSON.parse(savedHistory);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              state.chatHistory = parsed;
            } else {
              // Unexpected schema (e.g. array or primitive from an old version) — clear the key.
              logger.warn('[initializeChatHistory] Unexpected schema in localStorage key "chat_history"; clearing key and recovering to empty history.');
              localStorage.removeItem("chat_history");
              state.chatHistory = {};
            }
          } catch {
            logger.warn('[initializeChatHistory] Malformed JSON in localStorage key "chat_history"; clearing key and recovering to empty history.');
            localStorage.removeItem("chat_history");
            state.chatHistory = {};
          }
        }
      }
    },
    saveConversationLocally: (state, action: PayloadAction<Conversation>) => {
      const conversation = {
        ...action.payload,
        messages: [...state.messages],
        messageCount: state.messages.length,
      };
      state.chatHistory[conversation.id] = [...state.messages];
      const existingIndex = state.conversations.findIndex((item) => item.id === conversation.id);
      if (existingIndex >= 0) {
        state.conversations[existingIndex] = conversation;
      } else {
        state.conversations.unshift(conversation);
      }

      // Save to localStorage
      if (typeof window !== "undefined") {
        let conversations: Conversation[] = [];
        try {
          const raw = JSON.parse(localStorage.getItem("conversations") || "[]");
          conversations = Array.isArray(raw) ? raw : [];
          if (!Array.isArray(raw)) {
            logger.warn('[saveConversationLocally] Unexpected schema in localStorage key "conversations"; recovering to empty list.');
            localStorage.removeItem("conversations");
          }
        } catch {
          logger.warn('[saveConversationLocally] Malformed JSON in localStorage key "conversations"; clearing key and recovering to empty list.');
          localStorage.removeItem("conversations");
        }
        const existingIndex = conversations.findIndex((item: Conversation) => item.id === conversation.id);
        if (existingIndex >= 0) conversations[existingIndex] = conversation;
        else conversations.unshift(conversation);

        const conversationsError = persistOfflineStorage("conversations", conversations, "conversation list");
        const chatHistoryError = persistOfflineStorage("chat_history", state.chatHistory, "chat history");

        if (conversationsError || chatHistoryError) {
          state.error = conversationsError || chatHistoryError;
        } else {
          state.error = null;
        }
      }
    },
    loadConversationsLocally: (state) => {
      if (typeof window !== "undefined") {
        try {
          const conversations = JSON.parse(localStorage.getItem("conversations") || "[]");
          const history = JSON.parse(localStorage.getItem("chat_history") || "{}");
          state.conversations = Array.isArray(conversations)
            ? conversations.map((conversation: Conversation) => {
              const messages = conversation.messages || history[conversation.id] || [];
              const firstUserMessage = messages.find(
                (message: ChatMessage) => message.type === "user",
              );
              return isUntitledConversation(conversation) && firstUserMessage
                ? {
                  ...conversation,
                  title: generateConversationTitle(firstUserMessage.content),
                }
                : conversation;
            })
            : [];
          localStorage.setItem("conversations", JSON.stringify(state.conversations));
        } catch {
          logger.warn('[loadConversationsLocally] Malformed JSON in localStorage key "conversations"; clearing key and recovering to empty list.');
          localStorage.removeItem("conversations");
          state.conversations = [];
        }
      }
    },
    deleteConversationLocally: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      // Deleting the open conversation also clears its view and any pending request state (#269)
      if (state.currentConversation?.id === conversationId) {
        state.currentConversation = null;
        state.messages = [];
        state.isLoading = false;
        state.isTyping = false;
        state.pendingMessages = new Set();
        state.optimisticUpdates = new Map();
      }
      state.conversations = state.conversations.filter(
        (conv) => conv.id !== conversationId,
      );
      delete state.chatHistory[conversationId];

      // Update localStorage
      if (typeof window !== "undefined") {
        let conversations: Conversation[] = [];
        try {
          const rawConvs = JSON.parse(localStorage.getItem("conversations") || "[]");
          conversations = Array.isArray(rawConvs) ? rawConvs : [];
          if (!Array.isArray(rawConvs)) {
            logger.warn('[deleteConversationLocally] Unexpected schema in localStorage key "conversations"; clearing key.');
            localStorage.removeItem("conversations");
          }
        } catch {
          logger.warn('[deleteConversationLocally] Malformed JSON in localStorage key "conversations"; clearing key.');
          localStorage.removeItem("conversations");
        }
        const updatedConversations = conversations.filter(
          (conv: Conversation) => conv.id !== conversationId,
        );
        const conversationsError = persistOfflineStorage("conversations", updatedConversations, "conversation list");

        let chatHistory: Record<string, unknown> = {};
        try {
          const rawHistory = JSON.parse(localStorage.getItem("chat_history") || "{}");
          chatHistory = (typeof rawHistory === 'object' && rawHistory !== null && !Array.isArray(rawHistory)) ? rawHistory : {};
          if (typeof rawHistory !== 'object' || rawHistory === null || Array.isArray(rawHistory)) {
            logger.warn('[deleteConversationLocally] Unexpected schema in localStorage key "chat_history"; clearing key.');
            localStorage.removeItem("chat_history");
          }
        } catch {
          logger.warn('[deleteConversationLocally] Malformed JSON in localStorage key "chat_history"; clearing key.');
          localStorage.removeItem("chat_history");
        }
        delete chatHistory[conversationId];
        const chatHistoryError = persistOfflineStorage("chat_history", chatHistory, "chat history");

        if (conversationsError || chatHistoryError) {
          state.error = conversationsError || chatHistoryError;
        } else {
          state.error = null;
        }
      }
    },
    addTag: (
      state,
      action: PayloadAction<{ conversationId: string; tag: string }>,
    ) => {
      const { conversationId, tag } = action.payload;
      const conversation = state.conversations.find(
        (c) => c.id === conversationId,
      );
      if (conversation) {
        if (!conversation.tags) conversation.tags = [];
        if (!conversation.tags.includes(tag)) {
          conversation.tags.push(tag);
        }
        // Persist to localStorage
        if (typeof window !== "undefined") {
          let conversations: Conversation[] = [];
          try {
            const raw = JSON.parse(localStorage.getItem("conversations") || "[]");
            conversations = Array.isArray(raw) ? raw : [];
            if (!Array.isArray(raw)) {
              logger.warn('[addTag] Unexpected schema in localStorage key "conversations"; clearing key.');
              localStorage.removeItem("conversations");
            }
          } catch {
            logger.warn('[addTag] Malformed JSON in localStorage key "conversations"; clearing key.');
            localStorage.removeItem("conversations");
          }
          const index = conversations.findIndex(
            (c: Conversation) => c.id === conversationId,
          );
          if (index !== -1) {
            conversations[index] = conversation;
            localStorage.setItem(
              "conversations",
              JSON.stringify(conversations),
            );
          }
        }
      }
    },
    removeTag: (
      state,
      action: PayloadAction<{ conversationId: string; tag: string }>,
    ) => {
      const { conversationId, tag } = action.payload;
      const conversation = state.conversations.find(
        (c) => c.id === conversationId,
      );
      if (conversation && conversation.tags) {
        conversation.tags = conversation.tags.filter((t) => t !== tag);
        // Persist to localStorage
        if (typeof window !== "undefined") {
          let conversations: Conversation[] = [];
          try {
            const raw = JSON.parse(localStorage.getItem("conversations") || "[]");
            conversations = Array.isArray(raw) ? raw : [];
            if (!Array.isArray(raw)) {
              logger.warn('[removeTag] Unexpected schema in localStorage key "conversations"; clearing key.');
              localStorage.removeItem("conversations");
            }
          } catch {
            logger.warn('[removeTag] Malformed JSON in localStorage key "conversations"; clearing key.');
            localStorage.removeItem("conversations");
          }
          const index = conversations.findIndex(
            (c: Conversation) => c.id === conversationId,
          );
          if (index !== -1) {
            conversations[index] = conversation;
            localStorage.setItem(
              "conversations",
              JSON.stringify(conversations),
            );
          }
        }
      }
    },
    setSelectedTags: (state, action: PayloadAction<string[]>) => {
      state.selectedTags = action.payload;
    },
    toggleConversationPin: (state, action: PayloadAction<string>) => {
      const conversation = state.conversations.find((item) => item.id === action.payload);
      if (!conversation) return;
      const nextPinned = !conversation.pinned;
      conversation.pinned = nextPinned;
      conversation.pinnedAt = nextPinned ? new Date().toISOString() : undefined;
      if (typeof window !== "undefined") {
        try {
          const stored = JSON.parse(localStorage.getItem("conversations") || "[]");
          const conversations = Array.isArray(stored) ? stored : [];
          const index = conversations.findIndex(
            (item: Conversation) => item.id === conversation.id,
          );
          if (index >= 0) conversations[index] = conversation;
          else conversations.unshift(conversation);
          localStorage.setItem("conversations", JSON.stringify(conversations));
        } catch {
          localStorage.setItem("conversations", JSON.stringify(state.conversations));
        }
      }
    },
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    queueMessage: (
      state,
      action: PayloadAction<{ id: string; query: string }>,
    ) => {
      state.messageQueue.push({
        id: action.payload.id,
        query: action.payload.query,
        timestamp: new Date().toISOString(),
      });
      // Persist queue to localStorage
      if (typeof window !== "undefined") {
        const storageError = persistOfflineStorage("messageQueue", state.messageQueue, "queued message");
        if (storageError) {
          state.error = storageError;
        } else {
          state.error = null;
        }
      }
    },
    dequeueMessage: (state, action: PayloadAction<string>) => {
      state.messageQueue = state.messageQueue.filter(
        (msg) => msg.id !== action.payload,
      );
      // Persist queue to localStorage
      if (typeof window !== "undefined") {
        const storageError = persistOfflineStorage("messageQueue", state.messageQueue, "queued message");
        if (storageError) {
          state.error = storageError;
        } else {
          state.error = null;
        }
      }
    },
    clearMessageQueue: (state) => {
      state.messageQueue = [];
      if (typeof window !== "undefined") {
        const storageError = persistOfflineStorage("messageQueue", state.messageQueue, "queued message");
        if (storageError) {
          state.error = storageError;
        } else {
          state.error = null;
        }
        if (!storageError) {
          localStorage.removeItem("messageQueue");
        }
      }
    },
    loadMessageQueue: (state) => {
      if (typeof window !== "undefined") {
        const savedQueue = localStorage.getItem("messageQueue");
        if (savedQueue) {
          try {
            const parsed = JSON.parse(savedQueue);
            if (Array.isArray(parsed)) {
              state.messageQueue = parsed;
            } else {
              // Unexpected schema (e.g. object from a schema change) — clear only this key.
              logger.warn('[loadMessageQueue] Unexpected schema in localStorage key "messageQueue"; clearing key and recovering to empty queue.');
              localStorage.removeItem("messageQueue");
              state.messageQueue = [];
            }
          } catch {
            logger.warn('[loadMessageQueue] Malformed JSON in localStorage key "messageQueue"; clearing key and recovering to empty queue.');
            localStorage.removeItem("messageQueue");
            state.messageQueue = [];
          }
        }
      }
    },
    addPendingMessage: (state, action: PayloadAction<string>) => {
      state.pendingMessages.add(action.payload);
    },
    removePendingMessage: (state, action: PayloadAction<string>) => {
      state.pendingMessages.delete(action.payload);
    },
    storeOptimisticUpdate: (state, action: PayloadAction<ChatMessage>) => {
      state.optimisticUpdates.set(action.payload.id, action.payload);
    },
    removeOptimisticUpdate: (state, action: PayloadAction<string>) => {
      state.optimisticUpdates.delete(action.payload);
    },
    /** Move a user message to another delivery state if the transition is allowed (#266). */
    setMessageDelivery: (state, action: PayloadAction<{ id: string; delivery: DeliveryState }>) => {
      const message = state.messages.find((m) => m.id === action.payload.id);
      if (message) transitionDelivery(message, action.payload.delivery);
    },
    /**
     * Replace the in-flight streamed text (#261). `text` is the full text so far, so repeated
     * deltas are idempotent. Deltas for a request that already settled or was cancelled are ignored.
     */
    streamingDelta: (state, action: PayloadAction<{ requestId: string; text: string }>) => {
      if (state.streamingResponse?.requestId === action.payload.requestId) {
        state.streamingResponse.text = action.payload.text;
      }
    },
    /** Merge server-delivered messages (live or resynced) with dedupe against local/optimistic copies (#277). */
    mergeSyncedMessages: (state, action: PayloadAction<ChatMessage[]>) => {
      state.messages = mergeIncomingMessages(state.messages, action.payload);
      for (const message of action.payload) {
        const optimisticId = message.metadata?.optimisticId ?? message.metadata?.tempId;
        if (optimisticId) {
          state.optimisticUpdates.delete(optimisticId);
          state.pendingMessages.delete(optimisticId);
        }
      }
    },
    resolveOptimisticUpdate: (
      state,
      action: PayloadAction<{ clientId: string; serverMessage: ChatMessage }>,
    ) => {
      const { clientId, serverMessage } = action.payload;
      // Remove optimistic update and add resolved message
      state.optimisticUpdates.delete(clientId);
      // Remove the old optimistic message if it exists
      state.messages = state.messages.filter((msg) => msg.id !== clientId);
      // Add the server version and resort
      state.messages.push(serverMessage);
      state.messages = sortMessagesByTimestamp(state.messages);
    },
  },
  extraReducers: (builder) => {
    builder
      // Drop the previous user's chat data from memory on logout; storage is cleared by
      // clearUserScopedStorage (#256). Online status is device state and is kept.
      .addCase(logout.fulfilled, (state) => ({
        ...initialState,
        isOnline: state.isOnline,
        pendingMessages: new Set<string>(),
        optimisticUpdates: new Map<string, ChatMessage>(),
      }))
      .addCase(fetchChatHistory.pending, (state) => {
        state.historyStatus = "loading";
        state.historyError = null;
      })
      .addCase(fetchChatHistory.fulfilled, (state, action) => {
        state.historyStatus = "succeeded";
        state.messages = mergeMessagesById(state.messages, action.payload.messages);
        state.historyCursor = action.payload.nextCursor;
        state.historyHasMore = action.payload.hasMore;
        state.olderHistoryError = null;
      })
      .addCase(loadOlderHistory.pending, (state) => {
        state.isLoadingOlderHistory = true;
        state.olderHistoryError = null;
      })
      .addCase(loadOlderHistory.fulfilled, (state, action) => {
        const { page, cursor } = action.payload;
        state.isLoadingOlderHistory = false;
        // Merge by id: duplicate or overlapping pages never create duplicate rows,
        // and sorting puts out-of-order pages back in chronological order.
        state.messages = mergeMessagesById(state.messages, page.messages);

        // Only advance from the cursor this page was requested with. A late response for an
        // older cursor (e.g. after a refresh) must not move the cursor backwards.
        if (state.historyCursor === cursor) {
          // A server returning the same cursor would loop forever; treat it as the end
          const stuck = page.nextCursor === cursor;
          state.historyCursor = stuck ? null : page.nextCursor;
          state.historyHasMore = !stuck && page.hasMore;
        }
      })
      .addCase(loadOlderHistory.rejected, (state, action) => {
        state.isLoadingOlderHistory = false;
        state.olderHistoryError = (action.payload as string) ?? action.error.message ?? "Failed to load older messages";
      })
      .addCase(fetchChatHistory.rejected, (state, action) => {
        // Keep cached messages; only record the failure
        state.historyStatus = "failed";
        state.historyError = (action.payload as string) ?? action.error.message ?? "Failed to load chat history";
      })
      // Removed server conversation extraReducers - now handled client-side

      // Get or Create Active Conversation
      .addCase(getOrCreateActiveConversation.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getOrCreateActiveConversation.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentConversation = action.payload;
        state.messages = action.payload.messages || [];
        state.error = null;
      })
      .addCase(getOrCreateActiveConversation.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })

      // Send Message
      .addCase(sendMessage.pending, (state, action) => {
        state.isLoading = true;
        state.isTyping = true;
        state.error = null;
        state.streamingResponse = { requestId: action.meta.requestId, text: "" };

        const query = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg.query;
        const tempId = typeof action.meta.arg === 'object' && action.meta.arg.tempId
          ? action.meta.arg.tempId
          : `msg_optimistic_${action.meta.requestId}`;
        const clientTimestamp = typeof action.meta.arg === 'object' && action.meta.arg.clientTimestamp
          ? action.meta.arg.clientTimestamp
          : Date.now();

        // Check if optimistic message already exists
        const exists = state.messages.some(
          m => m.id === tempId || m.metadata?.optimisticId === tempId || m.metadata?.tempId === tempId
        );
        if (!exists) {
          const optimisticUserMessage: ChatMessage = {
            id: tempId,
            type: 'user',
            content: query,
            timestamp: new Date(clientTimestamp).toISOString(),
            metadata: {
              status: 'pending',
              delivery: 'sending',
              clientTimestamp: clientTimestamp,
              optimisticId: tempId,
              tempId: tempId,
            },
          };
          state.messages.push(optimisticUserMessage);
          state.messages = sortMessagesChronologically(state.messages);
        } else {
          // A queued, failed or retried message being (re)sent: reuse its row (#266, #262).
          // The delivery state only moves where the state machine allows (a `sent` row stays sent).
          const existing = state.messages.find(
            m => m.id === tempId || m.metadata?.optimisticId === tempId || m.metadata?.tempId === tempId
          );
          if (existing) {
            transitionDelivery(existing, 'sending');
            existing.metadata = { ...existing.metadata, error: undefined };
          }
        }
        state.pendingMessages.add(tempId);
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isTyping = false;
        state.currentConversation = action.payload.conversation;
        if (action.payload.conversation?.id) {
          clearChatDraft(action.payload.conversation.id);
        // The final agent message replaces the streamed preview in the same update, so the
        // reply is never shown twice (#261)
        if (state.streamingResponse?.requestId === action.meta.requestId) {
          state.streamingResponse = null;
        }

        // Debug logging to see what the server is returning
        logger.debug("[ChatSlice] Full response:", action.payload.response);
        logger.debug(
          "[ChatSlice] Response result:",
          action.payload.response.result,
        );
        logger.debug(
          "[ChatSlice] Response data:",
          action.payload.response.result.data,
        );

        // Handle different response formats
        let content = action.payload.response.result.data;

        // If the response data is an object with structured data, use it directly
        if (typeof content === "object" && content !== null) {
          // The content is already structured, use it as is
          logger.debug("[ChatSlice] Using structured content:", content);
        } else if (typeof content === "string") {
          // Try to parse if it's a JSON string
          try {
            const parsed = JSON.parse(content);
            if (typeof parsed === "object" && parsed !== null) {
              content = parsed;
              logger.debug("[ChatSlice] Parsed JSON content:", content);
            }
          } catch {
            // Not JSON, use as string
            logger.debug("[ChatSlice] Using string content:", content);
          }
        }

        const { userMessage, agentMessage, tempId } = action.payload;

        // Resolve optimistic user message
        const optimisticIdx = state.messages.findIndex(
          (m) =>
            m.id === tempId ||
            m.id === userMessage?.id ||
            m.metadata?.optimisticId === tempId ||
            m.metadata?.tempId === tempId,
        );

        // The server copy may already be present (e.g. via a socket event or history load):
        // keep one row only (#266)
        const serverIdx = userMessage?.metadata?.serverId
          ? state.messages.findIndex((m, i) => i !== optimisticIdx && m.id === userMessage.metadata!.serverId)
          : -1;

        state.pendingMessages.delete(tempId);
        state.optimisticUpdates.delete(tempId);

        if (serverIdx !== -1 && userMessage) {
          state.messages[serverIdx] = {
            ...state.messages[serverIdx],
            ...userMessage,
            metadata: { ...state.messages[serverIdx].metadata, ...userMessage.metadata, delivery: 'sent', status: 'success' },
          };
          if (optimisticIdx !== -1) state.messages.splice(optimisticIdx, 1);
        } else if (optimisticIdx !== -1 && userMessage) {
          state.messages[optimisticIdx] = {
            ...state.messages[optimisticIdx],
            ...userMessage,
            metadata: {
              ...state.messages[optimisticIdx].metadata,
              ...userMessage.metadata,
              status: "success",
            },
          };
        } else if (userMessage) {
          state.messages.push(userMessage);
        }

        if (agentMessage) {
          state.messages.push(agentMessage);
        }

        // Re-sort all messages chronologically based on serverTimestamp
        state.messages = sortMessagesChronologically(state.messages);

        // Save chat history after each message
        if (state.currentConversation) {
          state.chatHistory[state.currentConversation.id] = [...state.messages];
          if (typeof window !== "undefined") {
            localStorage.setItem(
              "chat_history",
              JSON.stringify(state.chatHistory),
            );
          }
        }

        state.error = null;
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.isLoading = false;
        state.isTyping = false;
        // Drop the streamed preview for this request, whatever the outcome (#261)
        if (state.streamingResponse?.requestId === action.meta.requestId) {
          state.streamingResponse = null;
        }

        // The conversation was deleted mid-request: nothing to show or mark as failed (#269)
        if (action.payload === CONVERSATION_DELETED) {
          return;
        }

        const tempId = typeof action.meta.arg === 'object' && action.meta.arg.tempId
          ? action.meta.arg.tempId
          : `msg_optimistic_${action.meta.requestId}`;

        // Find the optimistic message and mark it as failed
        const optimisticIdx = state.messages.findIndex(
          m => m.id === tempId || m.metadata?.optimisticId === tempId || m.metadata?.tempId === tempId
        );

        state.pendingMessages.delete(tempId);
        if (action.payload === ABORT_ERROR || action.meta.aborted) {
          state.error = null;
          if (optimisticIdx !== -1) {
            state.messages[optimisticIdx].metadata = {
              ...state.messages[optimisticIdx].metadata,
              status: "cancelled",
              // Cancelled by the user: no delivery badge rather than a stuck "Sending..." (#266)
              delivery: undefined,
            };
          }
          return;
        }

        state.error = action.payload as string;

        if (optimisticIdx !== -1) {
          // sending → failed; retry is offered only in this state (#266)
          transitionDelivery(state.messages[optimisticIdx], 'failed');
          state.messages[optimisticIdx].metadata = {
            ...state.messages[optimisticIdx].metadata,
            error: String(action.payload),
          };
        }

        // Add error message with friendly content
        const errorContent =
          action.payload instanceof Error
            ? action.payload.message
            : String(action.payload);

        // Convert technical error messages to user-friendly ones
        let friendlyMessage = errorContent;
        if (errorContent.toLowerCase().includes('network') || errorContent.toLowerCase().includes('connection')) {
          friendlyMessage = "I'm having trouble connecting. Please check your internet connection and try again.";
        } else if (errorContent.includes('invalid query')) {
          friendlyMessage = "I didn't understand that. Could you please rephrase your question?";
        } else if (errorContent.includes('Failed to send message')) {
          friendlyMessage = "I'm having trouble processing your request. Please try again.";
        } else if (errorContent.includes('User not authenticated')) {
          friendlyMessage = "Please log in to continue the conversation.";
        }

        const failedQuery = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg.query;
        const errorMessage: ChatMessage = {
          id: `msg_err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "agent",
          content: friendlyMessage,
          timestamp: new Date().toISOString(),
          serverTimestamp: Date.now(),
          metadata: {
            success: false,
            type: "error",
            status: "failed",
            error: errorContent,
            ...retryMetadata(
              failedQuery,
              tempId,
              clientRequestIdFor(action.meta.arg, action.meta.requestId),
              classifyAgentError({ message: errorContent }),
            ),
            // If the user's message never reached the service, its own "Not sent" Retry (#266)
            // handles the resend; don't offer a second retry on this error reply (#262)
            ...(optimisticIdx !== -1 && getDeliveryState(state.messages[optimisticIdx]) === 'failed'
              ? { retryable: false }
              : {}),
          },
        };
        state.messages.push(errorMessage);
        state.messages = sortMessagesChronologically(state.messages);
      })
      .addCase(regenerateLastResponse.pending, (state) => {
        state.isLoading = true;
        state.isTyping = true;
        state.error = null;
      })
      .addCase(regenerateLastResponse.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isTyping = false;
        const index = state.messages.findIndex((message) => message.id === action.payload.agentId);
        if (index !== -1) {
          state.messages[index] = {
            ...state.messages[index],
            content: action.payload.content,
            metadata: {
              ...state.messages[index].metadata,
              status: "success",
              success: action.payload.response.result.success,
              error: action.payload.response.result.error,
              executionTrace: action.payload.response.result.executionTrace,
            },
          };
        }
      })
      .addCase(regenerateLastResponse.rejected, (state, action) => {
        state.isLoading = false;
        state.isTyping = false;
        if (action.payload === ABORT_ERROR || action.payload === "busy" || action.payload === "inactive") {
          state.error = null;
          return;
        }
        state.error = action.payload as string;
      })

      // ── sendVoiceMessage ───────────────────────────────────────────────────
      .addCase(sendVoiceMessage.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(sendVoiceMessage.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentConversation = action.payload.conversation;

        state.messages.push(action.payload.voiceMessage);

        if (action.payload.agentMessage) {
          state.messages.push(action.payload.agentMessage);
        }

        if (state.currentConversation) {
          state.chatHistory[state.currentConversation.id] = [...state.messages];
          if (typeof window !== 'undefined') {
            localStorage.setItem('chat_history', JSON.stringify(state.chatHistory));
          }
        }

        state.error = null;
      })
      .addCase(sendVoiceMessage.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  clearError,
  addMessage,
  addUserMessage,
  addSystemMessage,
  clearMessages,
  setMessages,
  setConversations,
  setCurrentConversation,
  setTyping,
  updateMessage,
  setMessageFeedback,
  removeMessage,
  updateAgentStatus,
  setAgentConnected,
  startNewChat,
  loadChatHistory,
  saveChatHistory,
  deleteChatHistory,
  initializeChatHistory,
  saveConversationLocally,
  loadConversationsLocally,
  deleteConversationLocally,
  addTag,
  removeTag,
  setSelectedTags,
  toggleConversationPin,
  setOnlineStatus,
  queueMessage,
  dequeueMessage,
  clearMessageQueue,
  loadMessageQueue,
  addPendingMessage,
  removePendingMessage,
  storeOptimisticUpdate,
  removeOptimisticUpdate,
  resolveOptimisticUpdate,
  setMessageDelivery,
  streamingDelta,
  mergeSyncedMessages,
} = chatSlice.actions;
export default chatSlice.reducer;
