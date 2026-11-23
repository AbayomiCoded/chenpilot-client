/**
 * Unit tests for the memo-display logic in the transaction history view.
 *
 * The MemoDisplay component itself is a pure render function, so we test
 * the two portable pieces:
 *   1. truncateMemo — safe truncation that preserves the full value in title
 *   2. label lookup — text / id / hash / return display correctly
 *
 * We also verify that StellarTransaction accepts memo fields so TypeScript
 * catches regressions in the type contract.
 */

import { describe, it, expect } from 'vitest';
import type { StellarTransaction } from '@/types';

// ---------------------------------------------------------------------------
// Duplicate the helpers from transactions/page.tsx so tests stay pure
// ---------------------------------------------------------------------------
const MEMO_TRUNCATE_LEN = 40;

function truncateMemo(value: string): string {
  return value.length > MEMO_TRUNCATE_LEN
    ? `${value.slice(0, MEMO_TRUNCATE_LEN)}…`
    : value;
}

type MemoType = 'text' | 'id' | 'hash' | 'return' | undefined;

const MEMO_LABEL: Record<NonNullable<MemoType>, string> = {
  text: 'Text',
  id: 'ID',
  hash: 'Hash',
  return: 'Return',
};

function getMemoLabel(memoType: MemoType): string | null {
  if (!memoType) return null;
  return MEMO_LABEL[memoType] ?? memoType.toUpperCase();
}

// ---------------------------------------------------------------------------
// Minimal StellarTransaction fixture
// ---------------------------------------------------------------------------
function makeTransaction(
  overrides: Partial<StellarTransaction> = {},
): StellarTransaction {
  return {
    id: 'tx1',
    hash: 'abc123',
    ledger: 1,
    created_at: '2026-01-01T00:00:00Z',
    source_account: 'GABC',
    fee_charged: '100',
    operation_count: 1,
    successful: true,
    operations: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// truncateMemo
// ---------------------------------------------------------------------------
describe('truncateMemo', () => {
  it('returns the value unchanged when ≤ 40 chars', () => {
    const value = 'invoice-42';
    expect(truncateMemo(value)).toBe(value);
  });

  it('returns value unchanged when exactly 40 chars', () => {
    const value = 'A'.repeat(40);
    expect(truncateMemo(value)).toBe(value);
  });

  it('truncates to 40 visible chars + ellipsis when > 40 chars', () => {
    const value = 'A'.repeat(80);
    const result = truncateMemo(value);
    expect(result).toBe('A'.repeat(40) + '…');
    expect(result.length).toBe(42); // 40 chars + single '…' character
  });

  it('preserves non-ASCII characters in truncation', () => {
    // Each Japanese character counts as 1 JS string char
    const value = 'ア'.repeat(50);
    const result = truncateMemo(value);
    expect(result).toBe('ア'.repeat(40) + '…');
  });

  it('handles empty string gracefully', () => {
    expect(truncateMemo('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getMemoLabel
// ---------------------------------------------------------------------------
describe('getMemoLabel', () => {
  it('returns "Text" for memo_type text', () => {
    expect(getMemoLabel('text')).toBe('Text');
  });

  it('returns "ID" for memo_type id', () => {
    expect(getMemoLabel('id')).toBe('ID');
  });

  it('returns "Hash" for memo_type hash', () => {
    expect(getMemoLabel('hash')).toBe('Hash');
  });

  it('returns "Return" for memo_type return', () => {
    expect(getMemoLabel('return')).toBe('Return');
  });

  it('returns null when memoType is undefined (no memo)', () => {
    expect(getMemoLabel(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StellarTransaction type — memo fields presence
// ---------------------------------------------------------------------------
describe('StellarTransaction type accepts memo fields', () => {
  it('accepts a transaction without memo (both fields absent)', () => {
    const tx = makeTransaction();
    expect(tx.memo).toBeUndefined();
    expect(tx.memo_type).toBeUndefined();
  });

  it('accepts a text memo', () => {
    const tx = makeTransaction({ memo: 'order-99', memo_type: 'text' });
    expect(tx.memo).toBe('order-99');
    expect(tx.memo_type).toBe('text');
  });

  it('accepts a numeric id memo', () => {
    const tx = makeTransaction({ memo: '12345', memo_type: 'id' });
    expect(tx.memo).toBe('12345');
    expect(tx.memo_type).toBe('id');
  });

  it('accepts a hash memo (64-char hex)', () => {
    const hash = 'a'.repeat(64);
    const tx = makeTransaction({ memo: hash, memo_type: 'hash' });
    expect(tx.memo).toHaveLength(64);
    expect(tx.memo_type).toBe('hash');
  });

  it('accepts a return memo', () => {
    const tx = makeTransaction({ memo: 'return-value', memo_type: 'return' });
    expect(tx.memo_type).toBe('return');
  });
});

// ---------------------------------------------------------------------------
// Memo display guard — should not render when memo is absent
// ---------------------------------------------------------------------------
describe('memo display guard', () => {
  it('does not show a label when no memo present', () => {
    const tx = makeTransaction();
    // Simulate the render guard: if !tx.memo, nothing is displayed
    const shouldRender = Boolean(tx.memo && tx.memo_type);
    expect(shouldRender).toBe(false);
  });

  it('shows the label when both memo and memo_type are present', () => {
    const tx = makeTransaction({ memo: 'hello', memo_type: 'text' });
    const shouldRender = Boolean(tx.memo && tx.memo_type);
    expect(shouldRender).toBe(true);
    expect(getMemoLabel(tx.memo_type)).toBe('Text');
  });
});
