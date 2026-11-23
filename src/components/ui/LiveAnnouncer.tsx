'use client';

import React from 'react';

export type AnnouncementTone = 'polite' | 'assertive';

export interface Announcement {
  text: string;
  tone: AnnouncementTone;
}

/**
 * Visually hidden live region for async status (#307). Pending and success messages are
 * `polite` (role="status"); errors are `assertive` (role="alert"). Screen readers announce
 * only when the text changes, so re-rendering the same status never repeats it.
 */
export function LiveAnnouncer({ announcement, id }: { announcement: Announcement | null; id?: string }) {
  const tone = announcement?.tone ?? 'polite';
  return (
    <div
      id={id}
      role={tone === 'assertive' ? 'alert' : 'status'}
      aria-live={tone}
      aria-atomic="true"
      className="sr-only"
      data-testid="live-announcer"
    >
      {announcement?.text ?? ''}
    </div>
  );
}

/**
 * Toast options for messages that a LiveAnnouncer already announces (#307). react-hot-toast
 * makes every toast a polite live region by default; this keeps the toast visible but silent
 * to assistive technology, so the outcome is announced once.
 */
export const SILENT_TOAST = { ariaProps: { role: 'status' as const, 'aria-live': 'off' as const } };

export default LiveAnnouncer;
