import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders a consistent themed empty state and the supplied action', () => {
    const onClick = vi.fn();
    const markup = renderToStaticMarkup(createElement(EmptyState, {
      title: 'No transactions yet',
      description: 'Your transactions will appear here.',
      action: { label: 'Go to dashboard', onClick },
    }));

    expect(markup).toContain('No transactions yet');
    expect(markup).toContain('Your transactions will appear here.');
    expect(markup).toContain('Go to dashboard');
    expect(markup).toContain('dark:bg-gray-800');
  });

  it('omits action controls when no actions are supplied', () => {
    const markup = renderToStaticMarkup(createElement(EmptyState, {
      title: 'No contacts',
      description: 'Add a contact to get started.',
    }));

    expect(markup).not.toContain('<button');
    expect(markup).toContain('Add a contact to get started.');
  });
});

describe('EmptyState error tone (#265)', () => {
  it('renders an alert with error styling when tone is error', () => {
    const markup = renderToStaticMarkup(createElement(EmptyState, {
      title: "Couldn't load history",
      description: 'Try again.',
      tone: 'error',
      action: { label: 'Try again', onClick: vi.fn() },
    }));

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-tone="error"');
    expect(markup).toContain('bg-red-50');
    expect(markup).not.toContain('border-dashed');
  });

  it('defaults to the neutral tone without an alert role', () => {
    const markup = renderToStaticMarkup(createElement(EmptyState, {
      title: 'Nothing here',
      description: 'Empty.',
    }));

    expect(markup).not.toContain('role="alert"');
    expect(markup).toContain('data-tone="default"');
  });
});
