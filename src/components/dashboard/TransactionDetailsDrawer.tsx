"use client";

import { useEffect, useRef, type RefObject } from "react";
import { ExternalLink, X } from "lucide-react";
import toast from "react-hot-toast";
import type { StellarTransaction } from "@/types";
import { getStellarNetwork } from "@/config/stellarNetwork";
import { formatTransactionFee } from "@/utils/format";
import { Button } from "@/components/ui/Button";

export function getTransactionExplorerUrl(
  hash: string,
  network = getStellarNetwork(),
): string {
  const explorerNetwork = network === "testnet" ? "testnet" : "public";
  return `https://stellar.expert/explorer/${explorerNetwork}/tx/${encodeURIComponent(hash)}`;
}

interface TransactionDetailsDrawerProps {
  transaction: StellarTransaction;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export default function TransactionDetailsDrawer({
  transaction,
  onClose,
  returnFocusRef,
}: TransactionDetailsDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const close = () => {
    onClose();
    requestAnimationFrame(() => returnFocusRef?.current?.focus());
  };

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(transaction.hash);
      toast.success("Transaction hash copied");
    } catch {
      toast.error("Could not copy transaction hash");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        aria-labelledby="transaction-details-title"
        aria-modal="true"
        className="h-full w-full max-w-lg overflow-y-auto border-l border-gray-700 bg-gray-950 p-6 text-white shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="transaction-details-title" className="text-lg font-semibold">
              Transaction details
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-gray-400">
              {transaction.hash}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close transaction details"
            onClick={close}
            className="rounded-md p-2 text-gray-300 hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-400">Status</dt>
            <dd className={transaction.successful ? "text-green-400" : "text-red-400"}>
              {transaction.successful ? "Success" : "Failed"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400">Ledger</dt>
            <dd>#{transaction.ledger}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Fee charged</dt>
            <dd>{formatTransactionFee(transaction.fee_charged, { asset: "XLM" })}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Memo</dt>
            <dd className="break-words">{transaction.memo || "No memo"}</dd>
          </div>
        </dl>

        <h3 className="mt-8 text-sm font-semibold">Operations</h3>
        {transaction.operations.length ? (
          <ol className="mt-3 space-y-3">
            {transaction.operations.map((operation, index) => (
              <li key={operation.id} className="rounded-lg border border-gray-800 p-3">
                <p className="font-medium">
                  {index + 1}. {operation.type.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())}
                </p>
                <p className="mt-1 text-sm text-gray-300">
                  {operation.amount ?? "Amount unavailable"} {operation.asset ?? ""}
                </p>
                {(operation.from || operation.to || operation.source_account) && (
                  <p className="mt-1 break-all text-xs text-gray-400">
                    {operation.from ? `From: ${operation.from}` : ""}
                    {operation.from && operation.to ? " · " : ""}
                    {operation.to ? `To: ${operation.to}` : ""}
                    {!operation.from && !operation.to
                      ? `Counterparty: ${operation.source_account}`
                      : ""}
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-gray-400">No operation details are available.</p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={copyHash}>
            Copy hash
          </Button>
          <a
            href={getTransactionExplorerUrl(transaction.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-gray-700 px-4 py-2 text-sm text-blue-300 hover:bg-gray-900"
          >
            Open in Stellar explorer
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
      </section>
    </div>
  );
}
