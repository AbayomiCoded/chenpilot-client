import { RefObject, useCallback, useLayoutEffect, useRef } from 'react';

interface ScrollSnapshot {
  scrollTop: number;
  scrollHeight: number;
}

/**
 * Scroll position that keeps the same content in view after `addedHeight` pixels are
 * inserted above it (#264).
 */
export function computeAnchoredScrollTop(
  snapshot: ScrollSnapshot,
  nextScrollHeight: number
): number {
  return snapshot.scrollTop + Math.max(0, nextScrollHeight - snapshot.scrollHeight);
}

/**
 * Preserve the viewport anchor while older items are prepended to a scroll container (#264).
 * Call `capture()` right before requesting older items; when `firstItemKey` changes (new items
 * landed at the top), scrollTop is shifted by the added height so the user's view doesn't jump.
 */
export function usePrependScrollAnchor(
  containerRef: RefObject<HTMLElement | null>,
  firstItemKey: string | undefined
) {
  const snapshotRef = useRef<ScrollSnapshot | null>(null);

  const capture = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      snapshotRef.current = { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight };
    }
  }, [containerRef]);

  const release = useCallback(() => {
    snapshotRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const snapshot = snapshotRef.current;
    if (!el || !snapshot) return;
    if (el.scrollHeight !== snapshot.scrollHeight) {
      el.scrollTop = computeAnchoredScrollTop(snapshot, el.scrollHeight);
      snapshotRef.current = null;
    }
  }, [containerRef, firstItemKey]);

  return { capture, release };
}
