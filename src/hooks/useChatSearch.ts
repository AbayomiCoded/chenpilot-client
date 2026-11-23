'use client';

import { useState, useCallback, useRef } from 'react';

export interface MatchRange {
  /** Byte/character offset where the match starts (within the string). */
  start: number;
  /** Byte/character offset where the match ends (exclusive). */
  end: number;
}

/**
 * Find all (possibly overlapping) case-insensitive occurrences of `query`
 * inside `text`. Returns an empty array when `query` is empty or `text` is
 * not a string.
 */
export function findMatches(text: unknown, query: string): MatchRange[] {
  if (typeof text !== 'string' || query.length === 0) return [];

  const results: MatchRange[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let idx = 0;

  while (idx <= lowerText.length - lowerQuery.length) {
    const found = lowerText.indexOf(lowerQuery, idx);
    if (found === -1) break;
    results.push({ start: found, end: found + lowerQuery.length });
    // Advance by 1 to allow overlapping matches.
    idx = found + 1;
  }

  return results;
}

export interface SearchState {
  query: string;
  /** Total match count across all messages. */
  totalMatches: number;
  /** 0-based index of the currently focused match. -1 when no matches. */
  activeIndex: number;
}

export interface UseChatSearchReturn {
  searchState: SearchState;
  isSearchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (q: string) => void;
  setTotalMatches: (n: number) => void;
  goToNext: () => void;
  goToPrev: () => void;
  /** Ref callback – attach to the search <input> so it auto-focuses on open. */
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function useChatSearch(): UseChatSearchReturn {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [totalMatches, setTotalMatchesState] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
    // Focus after the DOM has updated.
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setQueryState('');
    setTotalMatchesState(0);
    setActiveIndex(-1);
  }, []);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    // Reset active index when query changes; it will be recalculated once
    // child components report their match counts.
    setActiveIndex(q.length > 0 ? 0 : -1);
  }, []);

  const setTotalMatches = useCallback((n: number) => {
    setTotalMatchesState(n);
    setActiveIndex((prev) => {
      if (n === 0) return -1;
      if (prev === -1) return 0;
      return Math.min(prev, n - 1);
    });
  }, []);

  const goToNext = useCallback(() => {
    setActiveIndex((prev) => {
      if (totalMatches === 0) return -1;
      return (prev + 1) % totalMatches;
    });
  }, [totalMatches]);

  const goToPrev = useCallback(() => {
    setActiveIndex((prev) => {
      if (totalMatches === 0) return -1;
      return (prev - 1 + totalMatches) % totalMatches;
    });
  }, [totalMatches]);

  return {
    searchState: { query, totalMatches, activeIndex },
    isSearchOpen,
    openSearch,
    closeSearch,
    setQuery,
    setTotalMatches,
    goToNext,
    goToPrev,
    searchInputRef,
  };
}
