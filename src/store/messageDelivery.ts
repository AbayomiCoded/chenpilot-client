import type { ChatMessage } from '@/types';

/**
 * Delivery state of a user chat message (#266). See src/docs/MESSAGE_ORDERING.md.
 *
 *   (new) ──► queued ──► sending ──► sent
 *     │          │          │
 *     └──────────┴──► failed ◄┘
 *                       │
 *                       ├──► sending   (retry while online)
 *                       └──► queued    (retry while offline)
 *
 * `sent` means the service acknowledged the message (an HTTP response came back), even if the
 * agent's answer was an error. `failed` means it never reached the service.
 */
export type DeliveryState = 'queued' | 'sending' | 'sent' | 'failed';

export const DELIVERY_TRANSITIONS: Readonly<Record<DeliveryState, readonly DeliveryState[]>> = {
  queued: ['sending', 'failed'],
  sending: ['sent', 'failed'],
  failed: ['sending', 'queued'],
  sent: [],
};

/** Whether `from → to` is allowed; a message without a state may start as queued or sending. */
export function canTransition(from: DeliveryState | undefined, to: DeliveryState): boolean {
  if (from === undefined) return to === 'queued' || to === 'sending';
  return DELIVERY_TRANSITIONS[from].includes(to);
}

/** Current delivery state, mapping the legacy `status` field for older stored messages. */
export function getDeliveryState(message: Pick<ChatMessage, 'type' | 'metadata'>): DeliveryState | undefined {
  if (message.type !== 'user') return undefined;
  const meta = message.metadata;
  if (meta?.delivery) return meta.delivery;
  switch (meta?.status) {
    case 'pending':
      return 'sending';
    case 'failed':
      return 'failed';
    case 'success':
      return 'sent';
    default:
      return undefined;
  }
}

/** Retry is offered only for messages that never reached the service. */
export function canRetry(message: Pick<ChatMessage, 'type' | 'metadata'>): boolean {
  return getDeliveryState(message) === 'failed';
}
