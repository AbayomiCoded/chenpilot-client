import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentMarkdown } from './AgentMarkdown';

vi.mock('highlight.js/styles/atom-one-dark.css', () => ({}));

const renderMd = (markdown: string) => render(<AgentMarkdown>{markdown}</AgentMarkdown>).container;

describe('AgentMarkdown safe rendering (#263)', () => {
  it('does not render raw HTML or script tags', () => {
    const container = renderMd(
      'Hello <script>window.__pwned = true</script><img src=x onerror="window.__pwned=true"><b>bold</b>',
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it.each([
    ['javascript', '[click](javascript:alert(1))'],
    ['mixed-case javascript', '[click](JaVaScRiPt:alert(1))'],
    ['data URL', '[click](data:text/html;base64,PHNjcmlwdD4=)'],
    ['vbscript', '[click](vbscript:msgbox(1))'],
    ['protocol-relative', '[click](//evil.example.com)'],
    ['app-relative path', '[click](/settings/delete-account)'],
  ])('renders a %s link as plain text', (_label, markdown) => {
    const container = renderMd(markdown);

    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('click');
  });

  it('opens external links in a new tab with safe rel attributes', () => {
    const container = renderMd('See [Stellar docs](https://developers.stellar.org).');
    const link = container.querySelector('a')!;

    expect(link.getAttribute('href')).toBe('https://developers.stellar.org');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc');
  });

  it('applies the same attributes to autolinked URLs', () => {
    const container = renderMd('Visit https://example.com today');
    const link = container.querySelector('a')!;

    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc');
  });

  it('keeps mailto and in-page anchors in the same tab', () => {
    const container = renderMd('[email](mailto:help@example.com) and [jump](#details)');
    const [mail, anchor] = Array.from(container.querySelectorAll('a'));

    expect(mail.getAttribute('href')).toBe('mailto:help@example.com');
    expect(mail.hasAttribute('target')).toBe(false);
    expect(anchor.getAttribute('href')).toBe('#details');
    expect(anchor.hasAttribute('target')).toBe(false);
  });

  it('never loads images, showing a safe link instead', () => {
    const container = renderMd('![chart](https://tracker.example.com/pixel.png) ![x](javascript:alert(1))');

    expect(container.querySelector('img')).toBeNull();
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://tracker.example.com/pixel.png');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer nofollow ugc');
    expect(container.textContent).toContain('[x]');
  });

  it('renders HTML inside code as escaped text', () => {
    const container = renderMd('```html\n<script>alert(1)</script>\n```\n\nand `<b>inline</b>`');

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('<b>inline</b>');
  });
});
