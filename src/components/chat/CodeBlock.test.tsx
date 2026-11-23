import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('highlight.js/styles/atom-one-dark.css', () => ({}));
// Highlighting always fails here, which forces the escaped fallback path (#263). The copy
// tests (#268) only need the raw code text, so they run under the same mock.
vi.mock('highlight.js', () => ({
  default: {
    getLanguage: vi.fn(() => undefined),
    highlight: vi.fn(),
    highlightAuto: vi.fn(() => {
      throw new Error('highlighter crashed');
    }),
  },
}));

import { CodeBlock } from './CodeBlock';

describe('CodeBlock safety (#263)', () => {
  it('escapes code when highlighting fails instead of injecting raw HTML', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <CodeBlock className="language-unknown">{'<img src=x onerror="alert(1)">'}</CodeBlock>,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('code')?.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it('drops unsafe language tags from class names and the badge', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <CodeBlock className={'language-js" onmouseover="alert(1)'}>{'let a = 1;'}</CodeBlock>,
    );

    const code = container.querySelector('code')!;
    expect(code.className).toBe('font-mono text-gray-100 hljs');
    expect(container.innerHTML).not.toContain('onmouseover');
  });

  it('renders inline code as text', () => {
    const { container } = render(<CodeBlock inline>{'<b>x</b>'}</CodeBlock>);
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('<b>x</b>');
  });
});

const CODE = 'const amount = 10;';

const setClipboard = (writeText?: (text: string) => Promise<void>) => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText: vi.fn(writeText) } : undefined,
  });
};

const status = () => screen.getByRole('status');
const clickCopy = () => fireEvent.click(screen.getByRole('button', { name: /Copy code|Copied/ }));

describe('CodeBlock copy feedback (#268)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.getSelection()?.removeAllRanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('confirms only after the clipboard write completes', async () => {
    let finish: () => void = () => {};
    setClipboard(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<CodeBlock className="language-js">{CODE}</CodeBlock>);

    clickCopy();
    expect(status()).toHaveTextContent('');

    await act(async () => finish());

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(CODE);
    expect(status()).toHaveTextContent('Code copied to clipboard');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('reports a denied permission and selects the code for manual copying', async () => {
    setClipboard(() => Promise.reject(Object.assign(new Error('Write permission denied.'), { name: 'NotAllowedError' })));
    render(<CodeBlock className="language-js">{CODE}</CodeBlock>);

    await act(async () => clickCopy());

    expect(status()).toHaveTextContent("Couldn't copy automatically");
    expect(window.getSelection()?.toString()).toContain('amount');
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
  });

  it('falls back when the Clipboard API is unavailable', async () => {
    setClipboard(undefined);
    render(<CodeBlock>{CODE}</CodeBlock>);

    await act(async () => clickCopy());

    expect(status()).toHaveTextContent("Couldn't copy automatically");
    expect(window.getSelection()?.toString()).toContain('amount');
  });

  it('clears the feedback after a short delay', async () => {
    vi.useFakeTimers();
    setClipboard(() => Promise.resolve());
    render(<CodeBlock>{CODE}</CodeBlock>);

    await act(async () => clickCopy());
    expect(status()).toHaveTextContent('Code copied');

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(status()).toHaveTextContent('');
  });

  it('keeps the code selectable', () => {
    render(<CodeBlock>{CODE}</CodeBlock>);
    expect(document.querySelector('pre')).toHaveClass('select-text');
  });
});
