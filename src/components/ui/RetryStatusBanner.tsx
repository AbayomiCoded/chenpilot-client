'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppSelector } from '@/store';

/**
 * Thin status strip shown automatically while the Axios retry interceptor is
 * waiting to re-attempt a failed request.
 *
 * Reads `state.ui.retryStatus` from Redux — the interceptor in api.ts sets it
 * before each backoff delay and clears it just before the re-attempt fires.
 *
 * Renders nothing when no retry is in-progress.
 */
export default function RetryStatusBanner() {
  const retryStatus = useAppSelector((state) => state.ui.retryStatus);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Tick a countdown based on nextRetryAt.
  useEffect(() => {
    if (!retryStatus) {
      setSecondsLeft(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((retryStatus.nextRetryAt - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };

    tick(); // run immediately
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [retryStatus]);

  if (!retryStatus) return null;

  const { attempt, maxAttempts, label } = retryStatus;
  const dots = Array.from({ length: attempt }, (_, i) => i);

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/25 text-amber-300 text-sm"
    >
      {/* Only this text is announced, once per attempt. The visible countdown below ticks every
          250ms and is kept out of the live region so it isn't re-read (#307). */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {`Retrying ${label}, attempt ${attempt} of ${maxAttempts}`}
      </span>
      {/* Spinning icon */}
      <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />

      {/* Message */}
      <span className="flex-1 min-w-0 truncate" aria-hidden="true">
        Retrying{' '}
        <span className="font-mono text-xs opacity-75">{label}</span>
        {' — '}attempt {attempt} of {maxAttempts}
        {secondsLeft > 0 && (
          <span className="opacity-60"> (in {secondsLeft}s)</span>
        )}
      </span>

      {/* Attempt pip indicators */}
      <div className="flex items-center gap-1 shrink-0" aria-hidden>
        {Array.from({ length: maxAttempts }, (_, i) => (
          <span
            key={i}
            className={
              i < attempt
                ? 'w-2 h-2 rounded-full bg-amber-400'
                : 'w-2 h-2 rounded-full bg-amber-900/60'
            }
          />
        ))}
      </div>
    </div>
  );
}
