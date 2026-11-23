/**
 * contactsImport.ts
 *
 * Parses and validates a versioned contacts export file, classifying each
 * row as valid, invalid, or duplicate against the existing contact list.
 *
 * Export format (version "1"):
 * {
 *   "version": "1",
 *   "exportedAt": "<ISO string>",
 *   "contacts": [
 *     { "name": "...", "address": "G...", "tokenType": "XLM", "note": "..." }
 *   ]
 * }
 */

import { Contact, CreateContactRequest } from '@/types';
import { validateContactAddress, normalizeContactAddress } from '@/utils/validation';

export const SUPPORTED_IMPORT_VERSION = '1' as const;

/** A single row that survived validation and is not a duplicate. */
export interface ValidImportRow {
  status: 'valid';
  rowIndex: number;
  data: CreateContactRequest;
}

/** A row that failed field-level validation. */
export interface InvalidImportRow {
  status: 'invalid';
  rowIndex: number;
  raw: unknown;
  errors: string[];
}

/** A row that is structurally valid but whose address already exists. */
export interface DuplicateImportRow {
  status: 'duplicate';
  rowIndex: number;
  data: CreateContactRequest;
  /** Name of the existing contact that owns this address. */
  conflictingName: string;
}

export type ImportRow = ValidImportRow | InvalidImportRow | DuplicateImportRow;

export interface ContactsImportPreview {
  version: string;
  exportedAt: string | null;
  rows: ImportRow[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
}

export interface ParseImportFileError {
  kind: 'parse_error' | 'unsupported_version' | 'missing_contacts';
  message: string;
}

export type ParseImportFileResult =
  | { ok: true; preview: ContactsImportPreview }
  | { ok: false; error: ParseImportFileError };

const TOKEN_TYPES = ['XLM', 'STRK', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA'] as const;
type TokenType = (typeof TOKEN_TYPES)[number];

function isValidTokenType(value: unknown): value is TokenType {
  return TOKEN_TYPES.includes(value as TokenType);
}

function validateRow(
  raw: unknown,
  rowIndex: number,
  existingAddresses: Map<string, string>,
): ImportRow {
  const errors: string[] = [];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { status: 'invalid', rowIndex, raw, errors: ['Row must be an object'] };
  }

  const obj = raw as Record<string, unknown>;

  // name
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) errors.push('Name is required');
  else if (name.length < 2) errors.push('Name must be at least 2 characters');
  else if (name.length > 50) errors.push('Name must be less than 50 characters');

  // address
  const rawAddress = typeof obj.address === 'string' ? obj.address : '';
  const addressErr = rawAddress ? validateContactAddress(rawAddress) : 'Address is required';
  if (addressErr) errors.push(addressErr);

  // tokenType
  const tokenType = typeof obj.tokenType === 'string' ? obj.tokenType.toUpperCase() : '';
  if (!isValidTokenType(tokenType)) {
    errors.push(`tokenType must be one of: ${TOKEN_TYPES.join(', ')}`);
  }

  // note (optional)
  const note = typeof obj.note === 'string' ? obj.note.trim() : undefined;
  if (note && note.length > 280) {
    errors.push('Note must be 280 characters or fewer');
  }

  if (errors.length > 0) {
    return { status: 'invalid', rowIndex, raw, errors };
  }

  const normalizedAddress = normalizeContactAddress(rawAddress);
  const data: CreateContactRequest = {
    name,
    address: normalizedAddress,
    tokenType: tokenType as TokenType,
    note: note || undefined,
  };

  const conflictingName = existingAddresses.get(normalizedAddress);
  if (conflictingName !== undefined) {
    return { status: 'duplicate', rowIndex, data, conflictingName };
  }

  return { status: 'valid', rowIndex, data };
}

/**
 * Parse raw JSON text from an import file and classify each contact row.
 *
 * @param jsonText    Raw file content as a string
 * @param existing    The current in-memory contact list (for duplicate detection)
 */
export function parseImportFile(
  jsonText: string,
  existing: Contact[],
): ParseImportFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      error: { kind: 'parse_error', message: 'File is not valid JSON.' },
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      error: { kind: 'parse_error', message: 'Expected a JSON object at the top level.' },
    };
  }

  const doc = parsed as Record<string, unknown>;

  const version = String(doc.version ?? '');
  if (version !== SUPPORTED_IMPORT_VERSION) {
    return {
      ok: false,
      error: {
        kind: 'unsupported_version',
        message: `Unsupported export version "${version}". Expected "${SUPPORTED_IMPORT_VERSION}".`,
      },
    };
  }

  if (!Array.isArray(doc.contacts)) {
    return {
      ok: false,
      error: { kind: 'missing_contacts', message: 'Export file is missing the "contacts" array.' },
    };
  }

  // Build a normalised-address → existing-name map for O(1) duplicate lookups
  const existingAddresses = new Map<string, string>(
    existing.map((c) => [normalizeContactAddress(c.address), c.name]),
  );

  const rows: ImportRow[] = (doc.contacts as unknown[]).map((raw, i) =>
    validateRow(raw, i, existingAddresses),
  );

  const validCount = rows.filter((r) => r.status === 'valid').length;
  const invalidCount = rows.filter((r) => r.status === 'invalid').length;
  const duplicateCount = rows.filter((r) => r.status === 'duplicate').length;

  return {
    ok: true,
    preview: {
      version,
      exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : null,
      rows,
      validCount,
      invalidCount,
      duplicateCount,
    },
  };
}
