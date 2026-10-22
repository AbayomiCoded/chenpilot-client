'use client';

import React, { useContext } from 'react';
import { ReactReduxContext } from 'react-redux';
import { StellarTransaction, StellarOperation, TransactionDirection } from '@/types';
import {
  formatAddress,
  formatTokenAmount,
  formatTransactionAmount as formatLocaleAmount,
  formatTransactionDate,
  formatTransactionFee,
  ASSET_PRECISION,
  FormatAmountOptions,
} from '@/utils/format';
import { useAppSelector } from '@/store';
import { Language } from '@/lib/i18n/i18n';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  ExternalLink,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface TransactionTableProps {
  transactions: StellarTransaction[];
  isLoading: boolean;
  error: string | null;
  currentPage: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  language?: Language;
  locale?: string;
  activeAccountAddress?: string;
  accountAddress?: string;
}

const OPERATION_TYPE_LABELS: { [key: string]: string } = {
  payment: 'Payment',
  create_account: 'Create Account',
  account_merge: 'Account Merge',
  manage_offer: 'Manage Offer',
  create_passive_offer: 'Create Passive Offer',
  set_options: 'Set Options',
  change_trust: 'Change Trust',
  allow_trust: 'Allow Trust',
  account_created: 'Account Created',
  invoke_host_function: 'Invoke Host Function',
  bump_sequence: 'Bump Sequence',
  ext_soroban_op: 'Soroban Operation',
};

/**
 * Normalizes an address string for safe comparison.
 */
function normalizeAddress(address?: string | null): string {
  return address ? address.trim().toLowerCase() : '';
}

/**
 * Classifies an individual operation's direction relative to the active account address.
 *
 * Rules:
 * - 'self': both source and destination match the active address.
 * - 'incoming': destination matches active address, and source does not.
 * - 'outgoing': source matches active address, and destination is present and does not match active address.
 * - 'unknown': missing active address, missing operation accounts, non-transfer ops, or neither matches.
 */
export function getOperationDirection(
  operation?: Partial<StellarOperation> | null,
  activeAccountAddress?: string | null,
  txSourceAccount?: string | null
): TransactionDirection {
  const normActive = normalizeAddress(activeAccountAddress);
  if (!normActive) {
    return 'unknown';
  }

  if (!operation) {
    return 'unknown';
  }

  // Derive source account: explicit `from`, then operation `source_account`, then fallback to txSourceAccount
  const rawSource =
    operation.from ||
    operation.source_account ||
    ((operation as Record<string, unknown>).funder as string | undefined) ||
    txSourceAccount;

  // Derive destination account: explicit `to`, or Horizon alternatives `account`, `into`
  const rawDest =
    operation.to ||
    ((operation as Record<string, unknown>).account as string | undefined) ||
    ((operation as Record<string, unknown>).into as string | undefined);

  const normSource = normalizeAddress(rawSource);
  const normDest = normalizeAddress(rawDest);

  // Missing operation accounts: neither source nor destination present
  if (!normSource && !normDest) {
    return 'unknown';
  }

  // Self-transfer: Both source and destination match the active account
  if (normSource === normActive && normDest === normActive) {
    return 'self';
  }

  // Incoming: Funds received at active account
  if (normDest === normActive && normSource !== normActive) {
    return 'incoming';
  }

  // Outgoing: Funds sent from active account to a different destination
  if (normSource === normActive && normDest && normDest !== normActive) {
    return 'outgoing';
  }

  // Missing destination (e.g. non-transfer operation, change_trust, or incomplete record)
  // or neither matches the active account
  return 'unknown';
}

/**
 * Classifies a transaction's direction relative to the active account address.
 * Inspects transaction operations and resolves direction.
 */
export function getTransactionDirection(
  tx: StellarTransaction,
  activeAccountAddress?: string | null
): TransactionDirection {
  const normActive = normalizeAddress(activeAccountAddress);
  if (!normActive) {
    return tx.direction || 'unknown';
  }

  if (!tx.operations || tx.operations.length === 0) {
    return 'unknown';
  }

  // Locate primary operation with transfer details (amount, to, or from)
  const primaryOp =
    tx.operations.find((op) => op.amount || op.to || op.from) || tx.operations[0];

  return getOperationDirection(primaryOp, activeAccountAddress, tx.source_account);
}

/**
 * Formats a transaction amount consistently with directional prefix and asset symbol.
 * - incoming: "+<amount> <asset>"
 * - outgoing: "-<amount> <asset>"
 * - self: "<amount> <asset>"
 * - unknown: "<amount> <asset>" (or "-" if amount is missing)
 */
export function formatTransactionAmount(
  amount?: string | number | null,
  direction: TransactionDirection = 'unknown',
  asset: string = 'XLM',
  decimals?: number,
  options?: FormatAmountOptions
): string {
  if (amount === undefined || amount === null || amount === '') {
    return '-';
  }

  if (options?.language || options?.locale) {
    const rawFormatted = formatLocaleAmount(amount, {
      ...options,
      asset,
      decimals:
        decimals !== undefined
          ? decimals
          : asset
          ? ASSET_PRECISION[asset.toUpperCase()]
          : undefined,
    });
    if (rawFormatted === '-') return '-';

    if (direction === 'incoming' && !rawFormatted.startsWith('+')) {
      return `+${rawFormatted}`;
    }
    if (direction === 'outgoing' && !rawFormatted.startsWith('-')) {
      return `-${rawFormatted}`;
    }
    return rawFormatted;
  }

  const tokenFormatted = formatTokenAmount(amount, decimals !== undefined ? decimals : 2);
  const assetSuffix = asset ? ` ${asset}` : '';

  if (direction === 'incoming') {
    return `+${tokenFormatted}${assetSuffix}`;
  }

  if (direction === 'outgoing') {
    return `-${tokenFormatted}${assetSuffix}`;
  }

  return `${tokenFormatted}${assetSuffix}`;
}

export default function TransactionTable({
  transactions,
  isLoading,
  error,
  currentPage,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  language,
  locale,
  activeAccountAddress,
  accountAddress,
}: TransactionTableProps) {
  const reduxLanguage = useAppSelector((state) => state.ui?.language) as Language | undefined;
  const currentLanguage = language || reduxLanguage || 'en';

  const reduxContext = useContext(ReactReduxContext);
  const storeState = reduxContext?.store?.getState?.() as
    | {
        auth?: { user?: { address?: string; publicKey?: string } };
        account?: { status?: { address?: string; publicKey?: string } };
      }
    | undefined;

  const resolvedActiveAddress =
    activeAccountAddress ||
    accountAddress ||
    storeState?.auth?.user?.address ||
    storeState?.auth?.user?.publicKey ||
    storeState?.account?.status?.address ||
    storeState?.account?.status?.publicKey;

  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    toast.success('Transaction hash copied');
  };

  const getOperationType = (operations?: StellarOperation[]): string => {
    if (!operations || operations.length === 0) return 'Unknown';
    const mainOp = operations[0];
    return OPERATION_TYPE_LABELS[mainOp.type] || mainOp.type;
  };

  const getDirectionIcon = (direction: TransactionDirection, successful: boolean) => {
    if (!successful) {
      return <AlertCircle className="h-4 w-4 text-red-400" />;
    }
    switch (direction) {
      case 'incoming':
        return <ArrowDownLeft className="h-4 w-4 text-emerald-400" />;
      case 'outgoing':
        return <ArrowUpRight className="h-4 w-4 text-blue-400" />;
      case 'self':
        return <ArrowLeftRight className="h-4 w-4 text-purple-400" />;
      case 'unknown':
      default:
        return <ArrowUpRight className="h-4 w-4 text-gray-400" />;
    }
  };

  const getDirectionContainerClass = (direction: TransactionDirection, successful: boolean) => {
    if (!successful) {
      return 'bg-red-500/20';
    }
    switch (direction) {
      case 'incoming':
        return 'bg-emerald-500/20';
      case 'outgoing':
        return 'bg-blue-500/20';
      case 'self':
        return 'bg-purple-500/20';
      case 'unknown':
      default:
        return 'bg-gray-800';
    }
  };

  if (error) {
    return (
      <Card className="p-6 bg-red-950/20 border-red-900/50">
        <div className="flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      </Card>
    );
  }

  if (isLoading && transactions.length === 0) {
    return (
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-gray-400">Loading transactions...</p>
        </div>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center">
          <p className="text-gray-400">No transactions found</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Transaction History
        </h2>

        {/* Transaction Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Type
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Direction
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Hash
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Amount
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Ledger
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Date
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-300">
                  Status
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-300">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const direction = getTransactionDirection(tx, resolvedActiveAddress);
                const primaryOp =
                  tx.operations && tx.operations.length > 0 ? tx.operations[0] : null;
                const formattedAmount = formatTransactionAmount(
                  primaryOp?.amount,
                  direction,
                  primaryOp?.asset || 'XLM',
                  undefined,
                  { language: currentLanguage, locale }
                );

                return (
                  <tr
                    key={tx.id}
                    className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <div
                          className={`p-2 rounded-full ${getDirectionContainerClass(
                            direction,
                            tx.successful
                          )}`}
                        >
                          {getDirectionIcon(direction, tx.successful)}
                        </div>
                        <div>
                          <p className="font-medium text-white">
                            {getOperationType(tx.operations)}
                          </p>
                          <p className="text-xs text-gray-400">
                            {tx.operation_count}
                            {tx.operation_count === 1 ? ' op' : ' ops'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        data-testid={`tx-direction-${tx.id}`}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          direction === 'incoming'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : direction === 'outgoing'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : direction === 'self'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-gray-800 text-gray-400 border border-gray-700'
                        }`}
                      >
                        {direction === 'self' ? 'Self-Transfer' : direction}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleCopyHash(tx.hash)}
                        className="font-mono text-xs text-blue-400 hover:text-blue-300 truncate max-w-xs"
                        title={tx.hash}
                      >
                        {formatAddress(tx.hash)}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        data-testid={`tx-amount-${tx.id}`}
                        className={`font-mono text-sm block ${
                          direction === 'incoming'
                            ? 'text-emerald-400 font-medium'
                            : direction === 'outgoing'
                            ? 'text-rose-400 font-medium'
                            : direction === 'self'
                            ? 'text-purple-300 font-medium'
                            : 'text-gray-300'
                        }`}
                      >
                        {formattedAmount}
                      </span>
                      {tx.fee_charged && (
                        <span className="text-xs text-gray-500 block">
                          Fee: {formatTransactionFee(tx.fee_charged, { language: currentLanguage, locale, asset: 'XLM' })}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-300">#{tx.ledger}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-300">
                        {formatTransactionDate(tx.created_at, {
                          language: currentLanguage,
                          locale,
                        })}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {tx.successful ? (
                        <div className="flex items-center space-x-1">
                          <Check className="h-4 w-4 text-green-400" />
                          <span className="text-green-400 font-medium">Success</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1">
                          <AlertCircle className="h-4 w-4 text-red-400" />
                          <span className="text-red-400 font-medium">Failed</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <a
                        href={`https://stellar.expert/explorer/public/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors text-xs text-blue-400 hover:text-blue-300"
                      >
                        <span>View</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-800">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-400">
              Showing {startIndex} to {endIndex} of {totalCount} transactions
            </span>
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-300">Per page:</label>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
                className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white hover:border-gray-500 transition-colors"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              className={`!p-2 ${currentPage === 1 || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => onPageChange(pageNum)}
                    disabled={isLoading}
                    className={`px-2 py-1 rounded text-sm transition-colors ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                    } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || isLoading}
              className={`!p-2 ${currentPage >= totalPages || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
