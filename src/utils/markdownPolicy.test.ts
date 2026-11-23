import { describe, it, expect } from 'vitest';
import {
  sanitizeLinkUrl,
  isExternalLink,
  markdownUrlTransform,
  escapeHtml,
  sanitizeLanguage,
} from './markdownPolicy';

describe('markdown safe URL policy (#263)', () => {
  it.each([
    'https://stellar.org/docs',
    'http://example.com',
    'mailto:support@example.com',
    '#section-2',
    'HTTPS://EXAMPLE.COM',
  ])('allows %s', (url) => {
    expect(sanitizeLinkUrl(url)).toBe(url);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0000javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'file:///etc/passwd',
    'blob:https://example.com/uuid',
    '//evil.example.com/path',
    '/settings/delete-account',
    'relative/path',
    '',
  ])('rejects %j', (url) => {
    expect(sanitizeLinkUrl(url)).toBeNull();
    expect(markdownUrlTransform(url)).toBe('');
  });

  it('rejects non-string values', () => {
    expect(sanitizeLinkUrl(undefined)).toBeNull();
    expect(sanitizeLinkUrl(null)).toBeNull();
  });

  it('classifies external links', () => {
    expect(isExternalLink('https://example.com')).toBe(true);
    expect(isExternalLink('#top')).toBe(false);
    expect(isExternalLink('mailto:a@b.c')).toBe(false);
  });

  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
    );
  });

  it('only accepts safe language identifiers', () => {
    expect(sanitizeLanguage('typescript')).toBe('typescript');
    expect(sanitizeLanguage('c++')).toBe('c++');
    expect(sanitizeLanguage('js" onmouseover="alert(1)')).toBe('');
    expect(sanitizeLanguage(undefined)).toBe('');
  });
});
