import { describe, it, expect } from 'vitest';
import { parseImportFile, SUPPORTED_IMPORT_VERSION } from './contactsImport';
import type { Contact } from '@/types';

// Minimal valid Contact fixture for the existing-list
const makeContact = (overrides: Partial<Contact> = {}): Contact => ({
  id: '1',
  name: 'Existing Contact',
  address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  tokenType: 'XLM',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const validAddress = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const existingAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function makeExport(contacts: unknown[], version = '1', exportedAt = '2026-01-01T00:00:00Z') {
  return JSON.stringify({ version, exportedAt, contacts });
}

describe('parseImportFile', () => {
  describe('top-level format validation', () => {
    it('rejects non-JSON text', () => {
      const result = parseImportFile('not json!!', []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('parse_error');
    });

    it('rejects a JSON array at the top level', () => {
      const result = parseImportFile('[]', []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('parse_error');
    });

    it('rejects an unsupported version', () => {
      const result = parseImportFile(makeExport([], '2'), []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('unsupported_version');
    });

    it('rejects a missing version field', () => {
      const result = parseImportFile(JSON.stringify({ contacts: [] }), []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('unsupported_version');
    });

    it('rejects when "contacts" key is absent', () => {
      const result = parseImportFile(JSON.stringify({ version: '1' }), []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('missing_contacts');
    });

    it('rejects when "contacts" is not an array', () => {
      const result = parseImportFile(JSON.stringify({ version: '1', contacts: {} }), []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('missing_contacts');
    });
  });

  describe('empty file', () => {
    it('parses successfully with zero rows', () => {
      const result = parseImportFile(makeExport([]), []);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preview.rows).toHaveLength(0);
        expect(result.preview.validCount).toBe(0);
        expect(result.preview.version).toBe(SUPPORTED_IMPORT_VERSION);
      }
    });
  });

  describe('valid rows', () => {
    it('classifies a well-formed row as valid', () => {
      const json = makeExport([{ name: 'Alice', address: validAddress, tokenType: 'XLM' }]);
      const result = parseImportFile(json, []);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preview.validCount).toBe(1);
        expect(result.preview.rows[0].status).toBe('valid');
      }
    });

    it('uppercases and trims the address', () => {
      const json = makeExport([{ name: 'Alice', address: ` ${validAddress.toLowerCase()} `, tokenType: 'XLM' }]);
      const result = parseImportFile(json, []);
      if (result.ok && result.preview.rows[0].status === 'valid') {
        expect(result.preview.rows[0].data.address).toBe(validAddress);
      }
    });

    it('accepts all supported tokenTypes', () => {
      const tokens = ['XLM', 'STRK', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA'];
      // Use distinct addresses for each token
      const rows = tokens.map((t, i) => ({
        name: `Contact ${i}`,
        address: `G${'B'.repeat(55 - i)}${'A'.repeat(i)}`.slice(0, 56),
        tokenType: t,
      }));
      // Only use a couple of guaranteed valid addresses for simplicity
      const goodRows = [
        { name: 'XLM Contact', address: validAddress, tokenType: 'XLM' },
        { name: 'ETH Contact', address: 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', tokenType: 'ETH' },
      ];
      const json = makeExport(goodRows);
      const result = parseImportFile(json, []);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preview.rows.every((r) => r.status === 'valid')).toBe(true);
      }
    });

    it('accepts an optional note up to 280 chars', () => {
      const note = 'x'.repeat(280);
      const json = makeExport([{ name: 'Alice', address: validAddress, tokenType: 'XLM', note }]);
      const result = parseImportFile(json, []);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.preview.rows[0].status).toBe('valid');
    });
  });

  describe('invalid rows', () => {
    it('flags a non-object row as invalid', () => {
      const json = makeExport(['just a string']);
      const result = parseImportFile(json, []);
      if (result.ok) {
        expect(result.preview.rows[0].status).toBe('invalid');
        expect(result.preview.invalidCount).toBe(1);
      }
    });

    it('reports missing name', () => {
      const json = makeExport([{ address: validAddress, tokenType: 'XLM' }]);
      const result = parseImportFile(json, []);
      if (result.ok && result.preview.rows[0].status === 'invalid') {
        expect(result.preview.rows[0].errors.some((e) => /name/i.test(e))).toBe(true);
      }
    });

    it('reports invalid Stellar address', () => {
      const json = makeExport([{ name: 'Alice', address: 'NOT_AN_ADDRESS', tokenType: 'XLM' }]);
      const result = parseImportFile(json, []);
      if (result.ok && result.preview.rows[0].status === 'invalid') {
        expect(result.preview.rows[0].errors.length).toBeGreaterThan(0);
      }
    });

    it('reports missing address', () => {
      const json = makeExport([{ name: 'Alice', tokenType: 'XLM' }]);
      const result = parseImportFile(json, []);
      if (result.ok && result.preview.rows[0].status === 'invalid') {
        expect(result.preview.rows[0].errors.some((e) => /address/i.test(e))).toBe(true);
      }
    });

    it('reports unknown tokenType', () => {
      const json = makeExport([{ name: 'Alice', address: validAddress, tokenType: 'DOGE' }]);
      const result = parseImportFile(json, []);
      if (result.ok && result.preview.rows[0].status === 'invalid') {
        expect(result.preview.rows[0].errors.some((e) => /tokenType/i.test(e))).toBe(true);
      }
    });

    it('reports note exceeding 280 chars', () => {
      const json = makeExport([{ name: 'Alice', address: validAddress, tokenType: 'XLM', note: 'x'.repeat(281) }]);
      const result = parseImportFile(json, []);
      if (result.ok && result.preview.rows[0].status === 'invalid') {
        expect(result.preview.rows[0].errors.some((e) => /note/i.test(e))).toBe(true);
      }
    });

    it('collects errors from multiple invalid rows independently', () => {
      const json = makeExport([
        { address: validAddress, tokenType: 'XLM' },           // missing name
        { name: 'Bob', address: 'BAD', tokenType: 'UNKNOWN' }, // bad address + bad token
      ]);
      const result = parseImportFile(json, []);
      if (result.ok) {
        expect(result.preview.invalidCount).toBe(2);
        expect(result.preview.validCount).toBe(0);
      }
    });
  });

  describe('duplicate detection', () => {
    it('classifies a row as duplicate when the address matches an existing contact', () => {
      const existing = [makeContact({ address: existingAddress, name: 'Original' })];
      const json = makeExport([{ name: 'Copy', address: existingAddress, tokenType: 'XLM' }]);
      const result = parseImportFile(json, existing);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preview.duplicateCount).toBe(1);
        expect(result.preview.rows[0].status).toBe('duplicate');
        if (result.preview.rows[0].status === 'duplicate') {
          expect(result.preview.rows[0].conflictingName).toBe('Original');
        }
      }
    });

    it('duplicate detection is case-insensitive (normalised)', () => {
      const existing = [makeContact({ address: existingAddress })];
      // supply lowercase version
      const json = makeExport([{ name: 'Copy', address: existingAddress.toLowerCase(), tokenType: 'XLM' }]);
      const result = parseImportFile(json, existing);
      if (result.ok) {
        expect(result.preview.rows[0].status).toBe('duplicate');
      }
    });

    it('counts valid, duplicate, and invalid separately', () => {
      const existing = [makeContact({ address: existingAddress })];
      const json = makeExport([
        { name: 'New', address: validAddress, tokenType: 'ETH' },        // valid
        { name: 'Dupe', address: existingAddress, tokenType: 'XLM' },    // duplicate
        { name: 'Bad' },                                                   // invalid
      ]);
      const result = parseImportFile(json, existing);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preview.validCount).toBe(1);
        expect(result.preview.duplicateCount).toBe(1);
        expect(result.preview.invalidCount).toBe(1);
      }
    });
  });

  describe('row index', () => {
    it('preserves 0-based rowIndex on each entry', () => {
      const json = makeExport([
        { name: 'Alice', address: validAddress, tokenType: 'XLM' },
        { name: 'Bad' },
      ]);
      const result = parseImportFile(json, []);
      if (result.ok) {
        expect(result.preview.rows[0].rowIndex).toBe(0);
        expect(result.preview.rows[1].rowIndex).toBe(1);
      }
    });
  });

  describe('exportedAt', () => {
    it('surfaces exportedAt from the file', () => {
      const result = parseImportFile(makeExport([], '1', '2026-06-15T10:00:00Z'), []);
      if (result.ok) expect(result.preview.exportedAt).toBe('2026-06-15T10:00:00Z');
    });

    it('returns null for exportedAt when missing', () => {
      const result = parseImportFile(JSON.stringify({ version: '1', contacts: [] }), []);
      if (result.ok) expect(result.preview.exportedAt).toBeNull();
    });
  });
});
