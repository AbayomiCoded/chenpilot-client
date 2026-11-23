/**
 * Reusable transaction fixtures for the dashboard transaction table (#245).
 *
 * Covers the operation variants the UI has labels for (payment, account
 * creation, trust), the ones it does not recognise (which must still render),
 * and a transaction that mixes several operation types.
 */
import { StellarOperation, StellarTransaction } from '@/types';

const SOURCE_ACCOUNT = 'GBXKQ73U6I3Y2K5Z4W3V2U1T0S9R8Q7P6O5N4M3L2K1J0I9H8G7F6E5D4C3B2A1';
const COUNTERPARTY = 'GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6';

export const createStellarOperation = (
  overrides: Partial<StellarOperation> = {}
): StellarOperation => ({
  id: 'op-1',
  type: 'payment',
  source_account: SOURCE_ACCOUNT,
  ...overrides,
});

export const createStellarTransaction = (
  overrides: Partial<StellarTransaction> = {}
): StellarTransaction => {
  const operations = overrides.operations ?? [createStellarOperation()];
  return {
    id: 'tx-1',
    hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    ledger: 9845201,
    created_at: '2026-01-01T00:00:00Z',
    source_account: SOURCE_ACCOUNT,
    fee_charged: '100',
    successful: true,
    ...overrides,
    operation_count: overrides.operation_count ?? operations.length,
    operations,
  };
};

/** Labelled variant: a plain XLM payment. */
export const paymentTransaction = createStellarTransaction({
  id: 'tx-payment',
  operations: [
    createStellarOperation({
      id: 'op-payment',
      type: 'payment',
      amount: '25.5',
      asset: 'XLM',
      from: SOURCE_ACCOUNT,
      to: COUNTERPARTY,
    }),
  ],
});

/** Labelled variant: account creation. */
export const accountCreationTransaction = createStellarTransaction({
  id: 'tx-create-account',
  operations: [
    createStellarOperation({
      id: 'op-create-account',
      type: 'create_account',
      amount: '10',
      asset: 'XLM',
      to: COUNTERPARTY,
    }),
  ],
});

/** Labelled variant: trustline creation. */
export const trustTransaction = createStellarTransaction({
  id: 'tx-trust',
  operations: [
    createStellarOperation({
      id: 'op-trust',
      type: 'change_trust',
      asset: `USDC:${COUNTERPARTY}`,
    }),
  ],
});

/** Unrecognised Horizon type: falls back to the raw type string. */
export const unrecognizedOperationTransaction = createStellarTransaction({
  id: 'tx-unrecognized',
  operations: [createStellarOperation({ id: 'op-manage-data', type: 'manage_data' })],
});

/** Missing/empty type: falls back to the generic "Unknown" label. */
export const unlabeledOperationTransaction = createStellarTransaction({
  id: 'tx-unlabeled',
  operations: [createStellarOperation({ id: 'op-unlabeled', type: '' })],
});

/** Mixed transaction: labelled and unlabelled operations in one row. */
export const mixedOperationsTransaction = createStellarTransaction({
  id: 'tx-mixed',
  operations: [
    createStellarOperation({ id: 'op-mixed-1', type: 'payment', amount: '5', asset: 'XLM' }),
    createStellarOperation({
      id: 'op-mixed-2',
      type: 'change_trust',
      asset: `USDC:${COUNTERPARTY}`,
    }),
    createStellarOperation({ id: 'op-mixed-3', type: 'set_options' }),
  ],
});

export const supportedOperationFixtures: StellarTransaction[] = [
  paymentTransaction,
  accountCreationTransaction,
  trustTransaction,
];

export const unknownOperationFixtures: StellarTransaction[] = [
  unrecognizedOperationTransaction,
  unlabeledOperationTransaction,
];

export const transactionFixtures: StellarTransaction[] = [
  ...supportedOperationFixtures,
  ...unknownOperationFixtures,
  mixedOperationsTransaction,
];
