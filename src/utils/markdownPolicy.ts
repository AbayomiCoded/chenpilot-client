/**
 * Safe rendering policy for untrusted agent Markdown (#263).
 *
 * - Raw HTML in Markdown is never rendered (react-markdown `skipHtml`); there is no rehype-raw
 *   and no sanitizer, so HTML stays off until one is added deliberately.
 * - Link URLs must use an allowed protocol; anything else (javascript:, data:, vbscript:,
 *   file:, blob:, protocol-relative //host, ...) is dropped and the link renders as plain text.
 * - External links open in a new tab with `rel="noopener noreferrer nofollow ugc"`.
 * - Images are never loaded (tracking pixels, IP leaks); they render as a link to the image.
 * - Code is highlighted by highlight.js, which escapes its input; un-highlighted fallbacks are
 *   escaped with `escapeHtml` before any `innerHTML` use.
 *
 * See docs/MARKDOWN_SAFETY.md.
 */

/** Protocols allowed in agent-provided links. */
export const SAFE_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const;

/** Attributes applied to every link that leaves the app. */
export const EXTERNAL_LINK_REL = 'noopener noreferrer nofollow ugc';

// Control characters and whitespace browsers strip before parsing a scheme ("java\tscript:")
// eslint-disable-next-line no-control-regex
const STRIPPED_CHARS = /[\u0000- \u007f-\u009f]/g;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Return the URL if it is safe to use as a link `href`, otherwise `null`.
 * Allows http(s)/mailto URLs and in-page `#fragment` anchors. Relative paths are rejected
 * because agent output should not navigate inside the app.
 */
export function sanitizeLinkUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(STRIPPED_CHARS, '');
  if (normalized.startsWith('#')) return trimmed;
  if (normalized.startsWith('//')) return null;

  const scheme = SCHEME.exec(normalized)?.[1]?.toLowerCase();
  if (!scheme) return null;
  return (SAFE_LINK_PROTOCOLS as readonly string[]).includes(`${scheme}:`) ? trimmed : null;
}

/** Whether a (sanitized) link leaves the current page. */
export function isExternalLink(url: string): boolean {
  return !url.startsWith('#') && !url.toLowerCase().startsWith('mailto:');
}

/** `urlTransform` for react-markdown: unsafe URLs become empty strings. */
export function markdownUrlTransform(url: string): string {
  return sanitizeLinkUrl(url) ?? '';
}

/** Escape text for safe insertion into HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Restrict a fenced code block's language tag to a safe identifier (used in class names). */
export function sanitizeLanguage(language: string | undefined): string {
  const value = (language ?? '').trim().toLowerCase();
  return /^[a-z0-9+#_-]{1,32}$/.test(value) ? value : '';
}
