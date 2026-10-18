import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// next/link renders an <a> tag in static markup — no stub needed.
// Stub Button's peer dependency on cn/cn only if required.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('#148 — app NotFound', () => {
  it('renders the 404 heading and navigation links', async () => {
    const { default: NotFound } = await import('./not-found');
    const markup = renderToStaticMarkup(createElement(NotFound));

    expect(markup).toContain('404');
    expect(markup).toContain('Page not found');
    expect(markup).toContain('Go to dashboard');
    expect(markup).toContain('Open chat');
    expect(markup).toContain('href="/dashboard"');
    expect(markup).toContain('href="/chat"');
  });
});

describe('#148 — chat NotFound', () => {
  it('renders the chat-segment 404 with start-new-chat action', async () => {
    const { default: ChatNotFound } = await import('./chat/not-found');
    const markup = renderToStaticMarkup(createElement(ChatNotFound));

    expect(markup).toContain('Conversation not found');
    expect(markup).toContain('Start a new chat');
    expect(markup).toContain('Go to dashboard');
    expect(markup).toContain('href="/chat"');
    expect(markup).toContain('href="/dashboard"');
  });
});
