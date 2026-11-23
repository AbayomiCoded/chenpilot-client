import { useAppDispatch } from '@/store';
import { mergeSyncedMessages } from '@/store/slices/chatSlice';
import { ChatMessage } from '@/types';
import { useSocketEvent, useSocketResync } from './useSocket';

/** Socket event carrying a server chat message. Must include a cursor for resync (#277). */
export const CHAT_MESSAGE_EVENT = 'chat:message';

export interface ChatMessageEventPayload {
  cursor: string;
  message: ChatMessage;
}

/**
 * Feed live and resynced `chat:message` events into the chat store. Both paths go through
 * `mergeSyncedMessages`, which dedupes against local and optimistic copies (#277).
 */
export function useChatResync() {
  const dispatch = useAppDispatch();

  useSocketEvent(CHAT_MESSAGE_EVENT, (payload: unknown) => {
    const message = (payload as Partial<ChatMessageEventPayload> | null)?.message;
    if (message?.id) {
      dispatch(mergeSyncedMessages([message]));
    }
  });

  return useSocketResync();
}
