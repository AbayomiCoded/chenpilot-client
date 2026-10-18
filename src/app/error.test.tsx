import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// next/navigation is a server/client-only module — stub it for the test env.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }));

describe('#147 — ErrorPage', () => {
  it('renders the fallback heading and retry / home buttons', async () => {
    const { default: ErrorPage } = await import('./error');
    const reset = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(ErrorPage, {
        error: Object.assign(new Error('kaboom'), { digest: 'abc123' }),
        reset,
      })
    );

    expect(markup).toContain('Something went wrong');
    expect(markup).toContain('Try again');
    expect(markup).toContain('Go to dashboard');
    expect(markup).toContain('abc123');
  });

  it('omits the digest section when no digest is supplied', async () => {
    const { default: ErrorPage } = await import('./error');
    const markup = renderToStaticMarkup(
      createElement(ErrorPage, {
        error: new Error('no digest'),
        reset: vi.fn(),
      })
    );

    expect(markup).not.toContain('Error ID:');
  });
});

describe('#147 — GlobalError', () => {
  it('renders the global fallback with a reload button', async () => {
    vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }));
    const { default: GlobalError } = await import('./global-error');
    const markup = renderToStaticMarkup(
      createElement(GlobalError, {
        error: new Error('global'),
        reset: vi.fn(),
      })
    );

    expect(markup).toContain('Application error');
    expect(markup).toContain('Reload application');
    expect(markup).toContain('<html');
    expect(markup).toContain('<body');
  });
});
