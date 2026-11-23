/**
 * Tests for the local contact-export feature.
 *
 * The export is pure client-side JSON — no data is sent to any server.
 * We exercise the envelope structure directly without rendering the page.
 */

import { describe, it, expect } from 'vitest';
import type { Contact, ContactExportEnvelope } from '@/types';

// ---------------------------------------------------------------------------
// Duplicate the export helper here so we can test it without DOM side-effects.
// In production code this lives inside contacts/page.tsx.
// ---------------------------------------------------------------------------
function buildExportEnvelope(contacts: Contact[]): ContactExportEnvelope {
  return {
    format: 'chenpilot-contacts-v1',
    exportedAt: new Date().toISOString(),
    contacts: contacts.map((c) => ({
      name: c.name,
      address: c.address,
      tokenType: c.tokenType,
      defaultMemo: c.defaultMemo,
      defaultMemoType: c.defaultMemoType,
      isFavorite: c.isFavorite,
      createdAt: c.createdAt,
    })),
  };
}

const ADDR = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890123456';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    name: 'Alice',
    address: ADDR,
    tokenType: 'XLM',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Empty list
// ---------------------------------------------------------------------------
describe('buildExportEnvelope — empty list', () => {
  it('produces a valid envelope with no contacts', () => {
    const env = buildExportEnvelope([]);
    expect(env.format).toBe('chenpilot-contacts-v1');
    expect(env.contacts).toHaveLength(0);
    expect(env.exportedAt).toBeTruthy();
  });

  it('serialises to parseable JSON', () => {
    const env = buildExportEnvelope([]);
    const round = JSON.parse(JSON.stringify(env)) as ContactExportEnvelope;
    expect(round.format).toBe('chenpilot-contacts-v1');
  });
});

// ---------------------------------------------------------------------------
// Single typical contact
// ---------------------------------------------------------------------------
describe('buildExportEnvelope — single contact', () => {
  it('includes only documented user-owned fields, not internal ids', () => {
    const env = buildExportEnvelope([makeContact()]);
    const rec = env.contacts[0];

    expect(rec).toHaveProperty('name', 'Alice');
    expect(rec).toHaveProperty('address', ADDR);
    expect(rec).toHaveProperty('tokenType', 'XLM');
    expect(rec).toHaveProperty('createdAt');

    // Internal / server-assigned fields must NOT be exported
    expect(rec).not.toHaveProperty('id');
    expect(rec).not.toHaveProperty('updatedAt');
  });
});

// ---------------------------------------------------------------------------
// Non-ASCII names
// ---------------------------------------------------------------------------
describe('buildExportEnvelope — non-ASCII characters', () => {
  const names = [
    'Ñoño García',
    '田中太郎',
    'Ëlsa Østerberg',
    'Αλέξανδρος',
    'محمد علي',
  ];

  for (const name of names) {
    it(`round-trips "${name}" through JSON`, () => {
      const env = buildExportEnvelope([makeContact({ name })]);
      const round = JSON.parse(JSON.stringify(env)) as ContactExportEnvelope;
      expect(round.contacts[0].name).toBe(name);
    });
  }
});

// ---------------------------------------------------------------------------
// Larger list (100 contacts)
// ---------------------------------------------------------------------------
describe('buildExportEnvelope — larger list', () => {
  it('exports 100 contacts without data loss', () => {
    const contacts = Array.from({ length: 100 }, (_, i) =>
      makeContact({ id: String(i), name: `Contact ${i}` }),
    );
    const env = buildExportEnvelope(contacts);
    expect(env.contacts).toHaveLength(100);
    // Spot check a few entries
    expect(env.contacts[0].name).toBe('Contact 0');
    expect(env.contacts[99].name).toBe('Contact 99');
  });

  it('serialised JSON is parseable for 100 contacts', () => {
    const contacts = Array.from({ length: 100 }, (_, i) =>
      makeContact({ id: String(i), name: `Contact ${i}` }),
    );
    const json = JSON.stringify(buildExportEnvelope(contacts));
    const parsed = JSON.parse(json) as ContactExportEnvelope;
    expect(parsed.contacts).toHaveLength(100);
  });
});

// ---------------------------------------------------------------------------
// Memo preset fields
// ---------------------------------------------------------------------------
describe('buildExportEnvelope — memo preset', () => {
  it('includes defaultMemo and defaultMemoType when present', () => {
    const c = makeContact({ defaultMemo: 'inv-99', defaultMemoType: 'text' });
    const env = buildExportEnvelope([c]);
    expect(env.contacts[0].defaultMemo).toBe('inv-99');
    expect(env.contacts[0].defaultMemoType).toBe('text');
  });

  it('omits defaultMemo/defaultMemoType when absent', () => {
    const env = buildExportEnvelope([makeContact()]);
    // Should be undefined in the exported record, not an empty string
    expect(env.contacts[0].defaultMemo).toBeUndefined();
    expect(env.contacts[0].defaultMemoType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isFavorite field
// ---------------------------------------------------------------------------
describe('buildExportEnvelope — isFavorite', () => {
  it('includes isFavorite:true when set', () => {
    const env = buildExportEnvelope([makeContact({ isFavorite: true })]);
    expect(env.contacts[0].isFavorite).toBe(true);
  });

  it('isFavorite is undefined when not set', () => {
    const env = buildExportEnvelope([makeContact()]);
    expect(env.contacts[0].isFavorite).toBeUndefined();
  });
});
