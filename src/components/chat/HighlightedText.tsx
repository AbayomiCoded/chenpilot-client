'use client';

import React from 'react';
import { findMatches } from '@/hooks/useChatSearch';

interface HighlightedTextProps {
  /** The text to display. Non-string values are rendered as-is. */
  text: unknown;
  /** The search query. Passing an empty string renders unmodified text. */
  query: string;
  /**
   * The 0-based global match index that should receive the "active" style.
   * Pass -1 to apply no active style.
   */
  activeIndex: number;
  /**
   * The global offset of the FIRST match that falls inside this text node.
   * The parent component is responsible for tracking this offset so the
   * active highlight can be identified across multiple text nodes.
   */
  matchOffset: number;
  /** Called with the number of matches found inside this node. */
  onMatchCount?: (count: number) => void;
}

/**
 * Splits `text` around all case-insensitive matches of `query` and renders
 * each match as a `<mark>` element (no dangerouslySetInnerHTML).
 *
 * The component is intentionally a pure presentational leaf – it does not
 * manage any search state itself.
 */
export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  query,
  activeIndex,
  matchOffset,
  onMatchCount,
}) => {
  // Guard: only operate on strings. Non-string values (null, objects, numbers)
  // are not valid React children in arbitrary forms, so render nothing.
  if (typeof text !== 'string') {
    return null;
  }

  const matches = findMatches(text, query);

  // Report match count upward (only when it changes would be ideal, but
  // keeping this pure avoids effects inside render – callers deduplicate).
  // We call it synchronously; the caller must handle idempotency.
  onMatchCount?.(matches.length);

  if (matches.length === 0 || query.length === 0) {
    return <>{text}</>;
  }

  const segments: React.ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, localIdx) => {
    // Text before the match.
    if (match.start > cursor) {
      segments.push(text.slice(cursor, match.start));
    }

    const globalIdx = matchOffset + localIdx;
    const isActive = globalIdx === activeIndex;

    segments.push(
      <mark
        key={`match-${localIdx}`}
        data-search-match={globalIdx}
        className={
          isActive
            ? 'bg-orange-400 text-black rounded-sm px-0.5'
            : 'bg-yellow-300 text-black rounded-sm px-0.5'
        }
      >
        {text.slice(match.start, match.end)}
      </mark>
    );

    cursor = match.end;
  });

  // Remaining text after the last match.
  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return <>{segments}</>;
};

export default HighlightedText;
