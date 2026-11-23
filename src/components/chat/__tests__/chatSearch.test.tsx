// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { findMatches } from '@/hooks/useChatSearch';
import { HighlightedText } from '@/components/chat/HighlightedText';

// ─── findMatches unit tests ───────────────────────────────────────────────────

describe('findMatches', () => {
  it('returns an empty array when query is empty', () => {
    expect(findMatches('Hello world', '')).toEqual([]);
  });

  it('returns an empty array when text is not a string', () => {
    expect(findMatches(null, 'foo')).toEqual([]);
    expect(findMatches(undefined, 'foo')).toEqual([]);
    expect(findMatches(42, 'foo')).toEqual([]);
    expect(findMatches({ key: 'val' }, 'foo')).toEqual([]);
    expect(findMatches(['a', 'b'], 'foo')).toEqual([]);
  });

  it('returns an empty array when query is empty string even with valid text', () => {
    expect(findMatches('anything', '')).toEqual([]);
  });

  it('finds a single match', () => {
    expect(findMatches('Hello world', 'world')).toEqual([{ start: 6, end: 11 }]);
  });

  it('is case-insensitive', () => {
    expect(findMatches('Hello WORLD', 'world')).toEqual([{ start: 6, end: 11 }]);
    expect(findMatches('Hello world', 'WORLD')).toEqual([{ start: 6, end: 11 }]);
    expect(findMatches('Hello World', 'wOrLd')).toEqual([{ start: 6, end: 11 }]);
  });

  it('finds multiple non-overlapping matches', () => {
    expect(findMatches('abc abc abc', 'abc')).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ]);
  });

  it('finds overlapping matches', () => {
    // "aa" appears at positions 0, 1, 2 inside "aaaa"
    expect(findMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 1, end: 3 },
      { start: 2, end: 4 },
    ]);
  });

  it('returns an empty array when there is no match', () => {
    expect(findMatches('Hello world', 'xyz')).toEqual([]);
  });

  it('handles query equal to the entire text', () => {
    expect(findMatches('abc', 'abc')).toEqual([{ start: 0, end: 3 }]);
  });

  it('handles query longer than the text', () => {
    expect(findMatches('ab', 'abcdef')).toEqual([]);
  });

  it('handles special regex characters in the query safely', () => {
    // The helper uses indexOf, not a regex, so these must not throw.
    expect(() => findMatches('a.b.c', '.')).not.toThrow();
    expect(findMatches('a.b.c', '.')).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 4 },
    ]);
    expect(() => findMatches('a(b)c', '(')).not.toThrow();
  });

  it('handles empty string text', () => {
    expect(findMatches('', 'foo')).toEqual([]);
  });

  it('handles unicode characters', () => {
    expect(findMatches('café au lait', 'é')).toEqual([{ start: 3, end: 4 }]);
  });
});

// ─── HighlightedText component tests ─────────────────────────────────────────

describe('HighlightedText', () => {
  it('renders plain text when query is empty', () => {
    render(
      <HighlightedText
        text="Hello world"
        query=""
        activeIndex={-1}
        matchOffset={0}
      />
    );
    expect(screen.getByText('Hello world')).toBeDefined();
    expect(document.querySelectorAll('mark')).toHaveLength(0);
  });

  it('renders plain text when there are no matches', () => {
    render(
      <HighlightedText
        text="Hello world"
        query="xyz"
        activeIndex={-1}
        matchOffset={0}
      />
    );
    expect(screen.getByText('Hello world')).toBeDefined();
    expect(document.querySelectorAll('mark')).toHaveLength(0);
  });

  it('renders a <mark> element for a single match', () => {
    render(
      <HighlightedText
        text="Hello world"
        query="world"
        activeIndex={-1}
        matchOffset={0}
      />
    );
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('world');
  });

  it('renders multiple <mark> elements for multiple matches', () => {
    render(
      <HighlightedText
        text="abc abc abc"
        query="abc"
        activeIndex={-1}
        matchOffset={0}
      />
    );
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(3);
  });

  it('highlights match case-insensitively and preserves original case in output', () => {
    render(
      <HighlightedText
        text="Hello WORLD"
        query="world"
        activeIndex={-1}
        matchOffset={0}
      />
    );
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    // The rendered mark text preserves original case from the source string.
    expect(marks[0].textContent).toBe('WORLD');
  });

  it('applies the active style to the match at activeIndex (global)', () => {
    render(
      <HighlightedText
        text="abc abc"
        query="abc"
        activeIndex={1}
        matchOffset={0}
      />
    );
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    // Global index 0 → inactive (yellow)
    expect(marks[0].className).toContain('bg-yellow-300');
    // Global index 1 → active (orange)
    expect(marks[1].className).toContain('bg-orange-400');
  });

  it('uses matchOffset to map local match indices to global active index', () => {
    // This simulates a second message where the global active match is index 3,
    // but the first 3 matches are in a preceding message (matchOffset=3).
    // Local index 0 maps to global 3 → should be active.
    render(
      <HighlightedText
        text="hello hello"
        query="hello"
        activeIndex={3}
        matchOffset={3}
      />
    );
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    // local 0 → global 3 → active
    expect(marks[0].className).toContain('bg-orange-400');
    // local 1 → global 4 → inactive
    expect(marks[1].className).toContain('bg-yellow-300');
  });

  it('does not crash when text is a non-string (structured content)', () => {
    // Regression: HighlightedText must handle non-string text gracefully
    // and render nothing rather than throw.
    const { container: c1 } = render(
      <HighlightedText
        text={null as any}
        query="foo"
        activeIndex={-1}
        matchOffset={0}
      />
    );
    expect(c1.textContent).toBe('');

    const { container: c2 } = render(
      <HighlightedText
        text={{ key: 'value' } as any}
        query="foo"
        activeIndex={-1}
        matchOffset={0}
      />
    );
    expect(c2.textContent).toBe('');

    const { container: c3 } = render(
      <HighlightedText
        text={42 as any}
        query="foo"
        activeIndex={-1}
        matchOffset={0}
      />
    );
    expect(c3.textContent).toBe('');
  });

  it('sets data-search-match attribute with the correct global index', () => {
    render(
      <HighlightedText
        text="foo bar foo"
        query="foo"
        activeIndex={-1}
        matchOffset={5}
      />
    );
    const marks = document.querySelectorAll('mark');
    expect(marks[0].getAttribute('data-search-match')).toBe('5');
    expect(marks[1].getAttribute('data-search-match')).toBe('6');
  });
});
