"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { getTransactionHistory } from "@/store/slices/accountSlice";
import { StellarTransaction } from "@/types";import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { formatDate, formatTokenAmount, filterTransactionsByHash } from "@/utils/format";
import { RefreshCw, ReceiptText, Search, X } from "lucide-react";

export default function TransactionsPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { status, transactions } = useSelector(
    (state: RootState) => state.account,
  );

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (status?.publicKey) {
      dispatch(getTransactionHistory(status.publicKey));
    }
  }, [dispatch, status?.publicKey]);

  const filtered = useMemo(
    () => filterTransactionsByHash(transactions.transactions, searchQuery) as StellarTransaction[],
    [transactions.transactions, searchQuery],
  );

  const getStatusColor = (successful: boolean) =>
    successful ? "text-green-600" : "text-red-600";

  const getOperationType = (type: string) => {
    switch (type) {
      case "create_account": return "Funding";
      case "payment":        return "Payment";
      case "trust":          return "Trust";
      default:               return type.replace("_", " ").toUpperCase();
    }
  };

  if (transactions.isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Transaction History</h1>
        <div className="text-center">Loading transactions...</div>
      </div>
    );
  }

  if (transactions.error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Transaction History</h1>
        <Card className="border-red-200 dark:border-red-900">
          <div role="alert" className="space-y-4">
            <p className="text-red-700 dark:text-red-300">Error: {transactions.error}</p>
            {status?.publicKey && (
              <Button
                type="button"
                onClick={() => dispatch(getTransactionHistory(status.publicKey))}
                className="inline-flex items-center gap-2"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                Retry
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Transaction History</h1>

      {transactions.transactions.length === 0 ? (
        <EmptyState
          icon={<ReceiptText aria-hidden="true" className="h-8 w-8" />}
          title="No transactions yet"
          description="Your completed transactions will appear here. Start with a wallet transfer or payment."
          action={{ label: "Go to dashboard", onClick: () => router.push("/dashboard") }}
        />
      ) : (
        <div className="space-y-4">
          {/* Search field */}
          <div className="relative">
            <label htmlFor="tx-search" className="sr-only">
              Search by transaction hash
            </label>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
            />
            <input
              id="tx-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by transaction hash…"
              className="w-full pl-9 pr-10 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="off"
              spellCheck={false}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* No-match state */}
          {filtered.length === 0 ? (
            <Card className="text-center py-10">
              <p className="text-gray-500 dark:text-gray-400 mb-3">
                No transactions match{" "}
                <span className="font-mono text-sm break-all">{searchQuery}</span>
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSearchQuery("")}
                className="inline-flex items-center gap-2"
              >
                <X aria-hidden="true" className="h-4 w-4" />
                Clear search
              </Button>
            </Card>
          ) : (
            <>
              {searchQuery && (
                <p className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
                  {filtered.length} result{filtered.length !== 1 ? "s" : ""} for{" "}
                  <span className="font-mono break-all">{searchQuery}</span>
                </p>
              )}

              {filtered.map((tx) => (
                <Card key={tx.id} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">
                        Transaction{" "}
                        <span className="font-mono">{tx.hash.slice(0, 8)}…</span>
                      </h3>
                      <p className="text-sm text-gray-600">{formatDate(tx.created_at)}</p>
                    </div>
                    <div className={`font-semibold ${getStatusColor(tx.successful)}`}>
                      {tx.successful ? "Confirmed" : "Failed"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {tx.operations.map((op) => (
                      <div
                        key={op.id}
                        className="flex justify-between items-center bg-gray-50 p-2 rounded"
                      >
                        <div>
                          <span className="font-medium">{getOperationType(op.type)}</span>
                          {op.amount && (
                            <span className="ml-2 text-sm">
                              {formatTokenAmount(op.amount)} {op.asset || "XLM"}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          {op.to   && `To: ${op.to.slice(0, 8)}…`}
                          {op.from && `From: ${op.from.slice(0, 8)}…`}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 text-xs text-gray-500">
                    Fee: {formatTokenAmount(tx.fee_charged)} XLM | Ledger: {tx.ledger}
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
