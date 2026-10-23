import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('highlight.js/styles/atom-one-dark.css', () => ({}));
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
