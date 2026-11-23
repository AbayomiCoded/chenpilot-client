// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { computeAnchoredScrollTop, usePrependScrollAnchor } from './usePrependScrollAnchor';

const fakeContainer = (scrollTop: number, scrollHeight: number) => {
  const el = document.createElement('div');
  let height = scrollHeight;
  Object.defineProperty(el, 'scrollHeight', { get: () => height, configurable: true });
  el.scrollTop = scrollTop;
  return {
    el,
    grow: (by: number) => {
      height += by;
    },
  };
};

describe('computeAnchoredScrollTop (#264)', () => {
  it('shifts scrollTop by the height added above', () => {
    expect(computeAnchoredScrollTop({ scrollTop: 40, scrollHeight: 1000 }, 1600)).toBe(640);
  });

  it('never scrolls up when content shrinks', () => {
    expect(computeAnchoredScrollTop({ scrollTop: 40, scrollHeight: 1000 }, 900)).toBe(40);
  });
});

describe('usePrependScrollAnchor (#264)', () => {
  it('restores the anchor after items are prepended', () => {
    const { el, grow } = fakeContainer(10, 1000);
    const ref = { current: el };
    const { result, rerender } = renderHook(({ first }) => usePrependScrollAnchor(ref, first), {
      initialProps: { first: 'm5' },
    });

    result.current.capture();
    grow(500);
    rerender({ first: 'm3' });

    expect(el.scrollTop).toBe(510);
  });

  it('does nothing without a captured snapshot', () => {
    const { el, grow } = fakeContainer(10, 1000);
    const ref = { current: el };
    const { rerender } = renderHook(({ first }) => usePrependScrollAnchor(ref, first), {
      initialProps: { first: 'm5' },
    });

    grow(500);
    rerender({ first: 'm3' });

    expect(el.scrollTop).toBe(10);
  });

  it('release() discards a snapshot when nothing was prepended', () => {
    const { el, grow } = fakeContainer(10, 1000);
    const ref = { current: el };
    const { result, rerender } = renderHook(({ first }) => usePrependScrollAnchor(ref, first), {
      initialProps: { first: 'm5' },
    });

    result.current.capture();
    result.current.release();
    grow(500);
    rerender({ first: 'm3' });

    expect(el.scrollTop).toBe(10);
  });
});
