/** Notification preferences stored on the account (#301). */
export interface NotificationPreferences {
  /** Notify when transactions complete. */
  transactions: boolean;
  /** Notify about new AI agent responses. */
  chat: boolean;
}
