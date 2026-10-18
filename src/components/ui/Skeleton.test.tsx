import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkeletonCard, SkeletonTable, SkeletonMessage } from './Skeleton';

describe('#149 — Skeleton components', () => {
  it('SkeletonTable renders the specified number of placeholder rows', () => {
    const markup = renderToStaticMarkup(createElement(SkeletonTable, { rows: 7 }));
    // Each SkeletonRow contains a rounded-full avatar placeholder
    const avatarCount = (markup.match(/rounded-full/g) ?? []).length;
    // header row adds none; each data row contributes one avatar
    expect(avatarCount).toBe(7);
  });

  it('SkeletonTable defaults to 5 rows', () => {
    const markup = renderToStaticMarkup(createElement(SkeletonTable));
    const avatarCount = (markup.match(/rounded-full/g) ?? []).length;
    expect(avatarCount).toBe(5);
  });

  it('SkeletonCard renders a shimmer card with aria-hidden', () => {
    const markup = renderToStaticMarkup(createElement(SkeletonCard));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('rounded-lg');
  });

  it('SkeletonTable is marked aria-busy for assistive technology', () => {
    const markup = renderToStaticMarkup(createElement(SkeletonTable, { rows: 3 }));
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="Loading table data"');
  });

  it('SkeletonMessage renders on the right for outgoing messages', () => {
    const markup = renderToStaticMarkup(createElement(SkeletonMessage, { align: 'right' }));
    expect(markup).toContain('flex-row-reverse');
  });
});
