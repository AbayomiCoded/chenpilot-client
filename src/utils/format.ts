import { Language, getLocaleForLanguage } from '@/lib/i18n/i18n';
import type { ChatMessage } from '@/types';

/**
 * Standard asset decimal precisions on Stellar and supported networks.
 */
export const ASSET_PRECISION: Record<string, number> = {
  XLM: 7,
  USDC: 7,
  USDT: 7,
  AQUA: 7,
  BTC: 8,
  ETH: 18,
  STRK: 18,
};

export interface FormatAmountOptions {
  locale?: string;
  language?: Language | string;
  decimals?: number;
  minDecimals?: number;
  maxDecimals?: number;
  asset?: string;
  trimTrailingZeros?: boolean;
}

export interface FormatFeeOptions {
  locale?: string;
  language?: Language | string;
  decimals?: number;
  asset?: string;
  trimTrailingZeros?: boolean;
}

export interface FormatDateOptions extends Intl.DateTimeFormatOptions {
  locale?: string;
  language?: Language | string;
  timeZone?: string;
}

/**
 * Low-level exact decimal string formatter.
 * Formats arbitrary-precision decimal strings using BigInt for integer grouping
 * and character mappings for fractional digits, avoiding IEEE 754 floating-point loss.
 */
function formatExactDecimal(
  amountStr: string,
  locale: string,
  targetDecimals?: number,
  minDecimals?: number,
  trimTrailingZeros: boolean = false
): string {
  const trimmed = amountStr.trim();
  const isNegative = trimmed.startsWith('-');
  const unsigned = trimmed.replace(/^[+-]/, '');

  const [rawInt = '0', rawFrac = ''] = unsigned.split('.');
  let cleanInt = rawInt.replace(/^0+(?=\d)/, '') || '0';
  let cleanFrac = rawFrac;

  // Exact string + BigInt rounding / truncation without binary float conversion
  if (targetDecimals !== undefined) {
    if (cleanFrac.length > targetDecimals) {
      if (targetDecimals === 0) {
        const nextDigit = parseInt(cleanFrac[0], 10);
        if (nextDigit >= 5) {
          cleanInt = (BigInt(cleanInt) + 1n).toString();
        }
        cleanFrac = '';
      } else {
        const nextDigit = parseInt(cleanFrac[targetDecimals], 10);
        const truncatedFrac = cleanFrac.slice(0, targetDecimals);
        if (nextDigit >= 5) {
          const combined = BigInt(cleanInt + truncatedFrac) + 1n;
          const combinedStr = combined.toString();
          const totalDigits = cleanInt.length + targetDecimals;
          const padded = combinedStr.padStart(totalDigits, '0');
          cleanInt = padded.slice(0, padded.length - targetDecimals) || '0';
          cleanFrac = padded.slice(padded.length - targetDecimals);
        } else {
          cleanFrac = truncatedFrac;
        }
      }
    } else if (cleanFrac.length < targetDecimals && !trimTrailingZeros) {
      cleanFrac = cleanFrac.padEnd(targetDecimals, '0');
    }
  }

  // Handle minDecimals
  if (minDecimals !== undefined && cleanFrac.length < minDecimals) {
    cleanFrac = cleanFrac.padEnd(minDecimals, '0');
  }

  // Trim trailing zeros if requested
  if (trimTrailingZeros && cleanFrac.length > 0) {
    cleanFrac = cleanFrac.replace(/0+$/, '');
    if (minDecimals !== undefined && cleanFrac.length < minDecimals) {
      cleanFrac = cleanFrac.padEnd(minDecimals, '0');
    }
  }

  // Format integer portion with BigInt and locale (handles thousands grouping)
  let formattedInt: string;
  try {
    formattedInt = new Intl.NumberFormat(locale, { useGrouping: true }).format(BigInt(cleanInt));
  } catch {
    formattedInt = cleanInt;
  }

  // Retrieve locale's exact decimal separator and minus sign
  let decimalSeparator = '.';
  let minusSign = '-';
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(-1.1);
    const dec = parts.find((p) => p.type === 'decimal');
    if (dec) decimalSeparator = dec.value;
    const min = parts.find((p) => p.type === 'minusSign');
    if (min) minusSign = min.value;
  } catch {
    decimalSeparator = '.';
  }

  // Localize fractional digits for numbering systems that differ from Latin (e.g. Arabic-Indic)
  let formattedFrac = cleanFrac;
  try {
    const digitMap = Array.from({ length: 10 }, (_, i) =>
      new Intl.NumberFormat(locale).format(i)
    );
    formattedFrac = cleanFrac
      .split('')
      .map((d) => (/\d/.test(d) ? digitMap[parseInt(d, 10)] : d))
      .join('');
  } catch {
    formattedFrac = cleanFrac;
  }

  let result =
    formattedFrac.length > 0 ? `${formattedInt}${decimalSeparator}${formattedFrac}` : formattedInt;

  // Avoid displaying negative zero (-0)
  const isZero = cleanInt === '0' && cleanFrac.replace(/0/g, '').length === 0;
  if (isNegative && !isZero) {
    result = `${minusSign}${result}`;
  }

  return result;
}

/**
 * Format a transaction amount using the application's locale and explicit asset precision.
 * Preserves high precision and avoids floating-point conversion loss.
 *
 * @param amount - Number or decimal string representation of the amount.
 * @param options - Locale, language, asset symbol, and precision options.
 * @returns Formatted amount string, or '-' for missing/invalid input.
 */
export function formatTransactionAmount(
  amount: string | number | null | undefined,
  options?: FormatAmountOptions
): string {
  if (amount === null || amount === undefined || amount === '') {
    return '-';
  }

  let amountStr: string;
  if (typeof amount === 'number') {
    if (isNaN(amount) || !isFinite(amount)) {
      return '-';
    }
    amountStr = amount.toString();
  } else {
    amountStr = amount.trim();
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(amountStr)) {
      return '-';
    }
  }

  const locale = getLocaleForLanguage(options?.language || options?.locale);

  // Determine target precision
  let targetDecimals = options?.decimals;
  if (targetDecimals === undefined && options?.asset) {
    const knownPrecision = ASSET_PRECISION[options.asset.toUpperCase()];
    if (knownPrecision !== undefined) {
      targetDecimals = knownPrecision;
    }
  }
  if (targetDecimals === undefined && options?.maxDecimals !== undefined) {
    targetDecimals = options.maxDecimals;
  }

  const formattedValue = formatExactDecimal(
    amountStr,
    locale,
    targetDecimals,
    options?.minDecimals,
    options?.trimTrailingZeros ?? false
  );

  if (!options?.asset) {
    return formattedValue;
  }

  // For Arabic locales, embed a Left-to-Right mark (\u200E) before Latin asset symbols to ensure clean bidirectional rendering
  if (locale.startsWith('ar')) {
    return `${formattedValue} \u200E${options.asset}`;
  }

  return `${formattedValue} ${options.asset}`;
}

/**
 * Format a transaction fee using the application's locale and explicit asset precision.
 * Defaults to XLM precision (7 decimals) when no specific asset is given.
 *
 * @param fee - Number or string representation of the fee charged.
 * @param options - Formatting and locale options.
 * @returns Formatted fee string.
 */
export function formatTransactionFee(
  fee: string | number | null | undefined,
  options?: FormatFeeOptions
): string {
  const asset = options?.asset || 'XLM';
  const decimals = options?.decimals ?? (ASSET_PRECISION[asset.toUpperCase()] ?? 7);

  return formatTransactionAmount(fee, {
    ...options,
    asset,
    decimals,
  });
}

/**
 * Format a transaction timestamp using the application's selected locale and consistent UTC timezone.
 *
 * @param date - Date object, ISO 8601 string, or timestamp.
 * @param options - Locale, language, and Intl.DateTimeFormatOptions.
 * @returns Formatted date and time string, or '-' for missing/invalid input.
 */
export function formatTransactionDate(
  date: string | Date | number | null | undefined,
  options?: FormatDateOptions
): string {
  if (date === null || date === undefined || date === '') {
    return '-';
  }

  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) {
    return '-';
  }

  const locale = getLocaleForLanguage(options?.language || options?.locale);

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: options?.timeZone || 'UTC', // Application-consistent timezone policy
  };

  const { timeZone, ...restOptions } = options || {};
  const customOptions: Intl.DateTimeFormatOptions = restOptions;

  return new Intl.DateTimeFormat(locale, {
    ...defaultOptions,
    ...customOptions,
    timeZone: timeZone || 'UTC',
  }).format(dateObj);
}

/**
 * Format a Starknet address for display
 * @param address - The full Starknet address
 * @param startChars - Number of characters to show at the start (default: 6)
 * @param endChars - Number of characters to show at the end (default: 4)
 * @returns Formatted address string
 */
export function formatAddress(address: string, startChars: number = 6, endChars: number = 4): string {
  if (!address || address.length < startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format a token amount for display.
 * Maintained for backward compatibility with existing components and tests.
 *
 * @param amount - The amount as a string or number
 * @param decimals - Number of decimal places to show (default: 4)
 * @param tokenSymbol - Token symbol to append (optional)
 * @param options - Optional locale formatting options
 * @returns Formatted amount string
 */
export function formatTokenAmount(
  amount: string | number,
  decimals: number = 4,
  tokenSymbol?: string,
  options?: { locale?: string; language?: Language | string }
): string {
  if (options?.locale || options?.language) {
    const formatted = formatTransactionAmount(amount, {
      locale: options.locale,
      language: options.language,
      decimals,
      trimTrailingZeros: true,
      asset: tokenSymbol,
    });
    return formatted === '-' ? '0' : formatted;
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return '0';
  }

  const formatted = numAmount.toFixed(decimals);
  const trimmed = parseFloat(formatted).toString();
  
  return tokenSymbol ? `${trimmed} ${tokenSymbol}` : trimmed;
}

/**
 * Format a large number with appropriate suffixes (K, M, B)
 * @param num - The number to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted number string
 */
export function formatLargeNumber(num: number, decimals: number = 1): string {
  if (num >= 1e9) {
    return (num / 1e9).toFixed(decimals) + 'B';
  }
  if (num >= 1e6) {
    return (num / 1e6).toFixed(decimals) + 'M';
  }
  if (num >= 1e3) {
    return (num / 1e3).toFixed(decimals) + 'K';
  }
  return num.toString();
}

/**
 * Format a date for display
 * @param date - Date string or Date object
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  return dateObj.toLocaleDateString('en-US', { ...defaultOptions, ...options });
}

/**
 * Format a relative time (e.g., "2 hours ago")
 * @param date - Date string or Date object
 * @param now - Reference point for "now" (default: current time). Pass a fixed Date in tests for determinism.
 * @returns Relative time string
 */
export function formatRelativeTime(date: string | Date, now: Date = new Date()): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`;
  }

  return formatDate(dateObj, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Format an exact, fully-localized timestamp suitable for accessible labels and audit trails.
 * @param date - Date string or Date object
 * @param locale - BCP 47 locale tag (default: 'en-US')
 * @returns ISO-8601 datetime string for machine consumption and a human-readable label.
 */
export function formatExactTime(
  date: string | Date,
  locale: string = 'en-US',
): { iso: string; label: string } {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const iso = dateObj.toISOString();
  const label = dateObj.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
  return { iso, label };
}

/**
 * Format a transaction hash for display
 * @param hash - The transaction hash
 * @param startChars - Number of characters to show at the start (default: 8)
 * @param endChars - Number of characters to show at the end (default: 8)
 * @returns Formatted hash string
 */
export function formatTransactionHash(hash: string, startChars: number = 8, endChars: number = 8): string {
  if (!hash || hash.length < startChars + endChars) {
    return hash;
  }
  return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
}

/**
 * Format a percentage for display
 * @param value - The percentage value (0-100)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a file size in bytes to human readable format
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted file size string
 */
export function formatFileSize(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Filter transactions by full hash, case-insensitively.
 * An empty query returns all transactions unchanged.
 * @param transactions - List of Stellar transactions to filter
 * @param query - Substring to match against each transaction hash
 */
export function filterTransactionsByHash(
  transactions: { hash: string }[],
  query: string,
): { hash: string }[] {
  const trimmed = query.trim();
  if (!trimmed) return transactions;
  const lower = trimmed.toLowerCase();
  return transactions.filter((tx) => tx.hash.toLowerCase().includes(lower));
}

/**
 * Capitalize the first letter of a string
 * @param str - The string to capitalize
 * @returns Capitalized string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert a string to title case
 * @param str - The string to convert
 * @returns Title case string
 */
export function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

/**
 * Truncate text to a specified length
 * @param text - The text to truncate
 * @param maxLength - Maximum length of the text
 * @param suffix - Suffix to add when truncating (default: '...')
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - suffix.length) + suffix;
}

export const CHAT_DRAFTS_STORAGE_KEY = "chat_drafts_v1";
export const CHAT_DRAFT_LIMIT = 20;

export interface StoredChatDraft {
  text: string;
  updatedAt: number;
}

export type ChatDraftMap = Record<string, StoredChatDraft>;

function isStoredChatDraft(value: unknown): value is StoredChatDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as { text?: unknown; updatedAt?: unknown };
  return typeof draft.text === "string" && typeof draft.updatedAt === "number";
}

export function readChatDrafts(): ChatDraftMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CHAT_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const drafts: ChatDraftMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isStoredChatDraft(value)) drafts[id] = value;
    }
    return drafts;
  } catch {
    return {};
  }
}

export function pruneChatDrafts(
  drafts: ChatDraftMap,
  activeId?: string | null,
  limit: number = CHAT_DRAFT_LIMIT,
): ChatDraftMap {
  const recent = Object.entries(drafts)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, limit);
  const kept = Object.fromEntries(recent) as ChatDraftMap;
  if (activeId && drafts[activeId] && !kept[activeId]) {
    kept[activeId] = drafts[activeId];
  }
  return kept;
}

export function writeChatDrafts(drafts: ChatDraftMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAT_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

export function getChatDraft(conversationId: string): string {
  return readChatDrafts()[conversationId]?.text ?? "";
}

export function setChatDraft(conversationId: string, text: string, now: number = Date.now()): void {
  const drafts = readChatDrafts();
  if (!text) {
    delete drafts[conversationId];
  } else {
    drafts[conversationId] = { text, updatedAt: now };
  }
  writeChatDrafts(pruneChatDrafts(drafts, conversationId));
}

export function clearChatDraft(conversationId: string): void {
  const drafts = readChatDrafts();
  if (!(conversationId in drafts)) return;
  delete drafts[conversationId];
  writeChatDrafts(drafts);
}

// ── Conversation export (#96) ────────────────────────────────────────────────
// Pure helpers: they serialise a ChatMessage[] taken from state.chat.messages, so
// an export cannot drift from the rendered conversation.

export type ConversationExportFormat = 'markdown' | 'json';

const EXPORT_EXTENSIONS: Record<ConversationExportFormat, string> = {
  markdown: 'md',
  json: 'json',
};

export const EXPORT_MIME_TYPES: Record<ConversationExportFormat, string> = {
  markdown: 'text/markdown;charset=utf-8',
  json: 'application/json;charset=utf-8',
};

/** Deterministic name, e.g. `chenpilot-conversation-abc123-2026-10-28.md`. */
export function conversationExportFileName(
  conversationId: string,
  format: ConversationExportFormat,
  date: string | Date,
): string {
  const day = (typeof date === 'string' ? new Date(date) : date).toISOString().slice(0, 10);
  const safeId = conversationId.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'conversation';
  return `chenpilot-conversation-${safeId}-${day}.${EXPORT_EXTENSIONS[format]}`;
}

/** JSON export: the `ChatMessage[]` itself, so `JSON.parse` returns every field unchanged. */
export function serializeConversationJson(messages: ChatMessage[]): string {
  return `${JSON.stringify(messages, null, 2)}\n`;
}

const ROLE_HEADINGS: Record<ChatMessage['type'], string> = {
  user: 'User',
  agent: 'Agent',
  system: 'System',
};

function fenced(language: string, body: string): string {
  // A fence longer than any backtick run in the body keeps the block intact.
  const longest = (body.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${body}\n${fence}`;
}

/** Content that is a JSON object or array is structured; everything else is prose. */
function structuredContent(content: string): string | null {
  const trimmed = content.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null ? JSON.stringify(parsed, null, 2) : null;
  } catch {
    return null;
  }
}

function traceSummary(trace: NonNullable<ChatMessage['metadata']>['executionTrace']): string[] {
  if (!trace) return [];
  const lines = [
    `**Execution trace**: ${trace.steps.length} step${trace.steps.length === 1 ? '' : 's'}, ${trace.totalTime} ms (${trace.startTime} to ${trace.endTime})`,
    '',
  ];
  const walk = (steps: typeof trace.steps, depth: number) => {
    for (const step of steps) {
      lines.push(`${'  '.repeat(depth)}- [${step.type}] ${step.name} (${step.duration} ms): ${step.description}`);
      if (step.substeps?.length) walk(step.substeps, depth + 1);
    }
  };
  walk(trace.steps, 0);
  return lines;
}

/** Markdown transcript: role headings, ISO timestamps, fenced structured content and trace summaries. */
export function serializeConversationMarkdown(
  messages: ChatMessage[],
  options: { title?: string } = {},
): string {
  const out: string[] = [`# ${options.title?.trim() || 'ChenPilot conversation'}`, ''];

  for (const message of messages) {
    out.push(`## ${ROLE_HEADINGS[message.type] ?? message.type} · ${message.timestamp}`, '');

    if (message.messageType === 'voice') {
      const transcript = message.voice?.transcript?.trim();
      out.push(
        transcript ? transcript : '_Voice message (no transcript)._',
        '',
        `_Voice: ${message.voice?.duration ?? 0}s, ${message.voice?.mimeType ?? 'unknown format'}_`,
        '',
      );
    } else {
      const structured = structuredContent(message.content);
      out.push(structured ? fenced('json', structured) : message.content, '');
    }

    const meta = message.metadata;
    if (meta?.transactionHash) out.push(`- Transaction: \`${meta.transactionHash}\``);
    if (meta?.amount) out.push(`- Amount: ${meta.amount}${meta.tokenType ? ` ${meta.tokenType}` : ''}`);
    if (meta?.status) out.push(`- Status: ${meta.status}`);
    if (meta?.error) out.push(`- Error: ${meta.error}`);
    if (meta?.transactionHash || meta?.amount || meta?.status || meta?.error) out.push('');

    const trace = traceSummary(meta?.executionTrace);
    if (trace.length > 0) out.push(...trace, '');
  }

  return `${out.join('\n').trimEnd()}\n`;
}

/** Triggers a browser download of `content`. Kept separate from the serialisers so they stay pure. */
export function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
