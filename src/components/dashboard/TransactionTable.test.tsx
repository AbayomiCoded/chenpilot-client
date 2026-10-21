import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StellarTransaction } from '@/types';

// Mutable "selected application language" exposed to the mocked store so that a
// language change can be simulated without booting the real Redux store.
const appState = vi.hoisted(() => ({ language: 'en' as string }));

vi.mock('@/store', () => ({
  useAppSelector: (selector: (state: { ui: { language: string } }) => unknown) =>
    selector({ ui: { language: appState.language } }),
}));

import TransactionTable from './TransactionTable';

const transactions: StellarTransaction[] = [
  {
    id: 'tx-1',
    hash: 'GABCDEF12345678901234567890123456789012345678901234567890',
    ledger: 123456,
    created_at: '2026-05-15T14:30:00Z',
    source_account: 'GSOURCEACCOUNT',
    fee_charged: '100',
    operation_count: 1,
    successful: true,
    operations: [
      {
        id: 'op-1',
        type: 'payment',
        amount: '1234567.89',
        asset: 'XLM',
        source_account: 'GSOURCEACCOUNT',
      },
    ],
  },
];

const baseProps = {
  transactions,
  isLoading: false,
  error: null,
  currentPage: 1,
  pageSize: 10,
  totalCount: 1,
  onPageChange: vi.fn(),
  onPageSizeChange: vi.fn(),
};

describe('TransactionTable locale-aware formatting', () => {
  beforeEach(() => {
    appState.language = 'en';
    baseProps.onPageChange.mockClear();
    baseProps.onPageSizeChange.mockClear();
  });

  it('formats amounts, fees and dates with English locale separators and XLM precision', () => {
    render(<TransactionTable {...baseProps} />);

    expect(screen.getByText('1,234,567.8900000 XLM')).toBeInTheDocument();
    expect(screen.getByText(/^Fee: 100\.0000000 XLM$/)).toBeInTheDocument();
    expect(screen.getByText(/May 15, 2026/)).toBeInTheDocument();
  });

  it('re-renders amounts, fees and dates with the newly selected language', () => {
    const { unmount } = render(<TransactionTable {...baseProps} />);
    expect(screen.getByText('1,234,567.8900000 XLM')).toBeInTheDocument();
    unmount();

    appState.language = 'fr';
    render(<TransactionTable {...baseProps} />);

    // French: space grouping, comma decimal, 7-decimal XLM precision
    expect(
      screen.getByText(/1[\s\u00a0\u202f]234[\s\u00a0\u202f]567,8900000 XLM/)
    ).toBeInTheDocument();
    expect(screen.getByText(/^Fee: 100,0000000 XLM$/)).toBeInTheDocument();
    expect(screen.getByText(/15 mai 2026/)).toBeInTheDocument();
    expect(screen.queryByText('1,234,567.8900000 XLM')).not.toBeInTheDocument();
    expect(screen.queryByText(/May 15, 2026/)).not.toBeInTheDocument();
  });

  it('preserves pagination display and callbacks', () => {
    render(<TransactionTable {...baseProps} totalCount={25} pageSize={10} />);

    expect(
      screen.getByText('Showing 1 to 10 of 25 transactions')
    ).toBeInTheDocument();
    expect(screen.getByText('Per page:')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('10');
  });
});
