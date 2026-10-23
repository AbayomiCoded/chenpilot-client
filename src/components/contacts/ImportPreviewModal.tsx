'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { ContactsImportPreview, ValidImportRow, InvalidImportRow, DuplicateImportRow } from '@/utils/contactsImport';

interface ImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: ContactsImportPreview | null;
  isImporting: boolean;
  onConfirm: () => void;
}

export function ImportPreviewModal({
  isOpen,
  onClose,
  preview,
  isImporting,
  onConfirm,
}: ImportPreviewModalProps) {
  if (!preview) return null;

  const { rows, validCount, invalidCount, duplicateCount } = preview;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Preview" size="lg">
      <div className="space-y-4">
        {/* Summary bar */}
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            {validCount} valid
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <XCircle className="h-4 w-4" aria-hidden="true" />
            {invalidCount} invalid
          </span>
        </div>

        {validCount === 0 && (
          <p className="text-sm text-gray-400">
            No valid contacts to import. Fix the errors below and try again.
          </p>
        )}

        {/* Row table */}
        <div
          role="table"
          aria-label="Import preview rows"
          className="max-h-80 overflow-y-auto rounded-lg border border-gray-700 text-sm"
        >
          {/* header */}
          <div
            role="row"
            className="grid grid-cols-[2rem_1fr_1fr_6rem_1fr] gap-2 border-b border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400"
          >
            <span role="columnheader">#</span>
            <span role="columnheader">Name</span>
            <span role="columnheader">Address</span>
            <span role="columnheader">Token</span>
            <span role="columnheader">Status</span>
          </div>

          {rows.map((row) => {
            const isValid = row.status === 'valid';
            const isDuplicate = row.status === 'duplicate';

            const name =
              row.status !== 'invalid'
                ? (row as ValidImportRow | DuplicateImportRow).data.name
                : (typeof (row as InvalidImportRow).raw === 'object' &&
                    (row as InvalidImportRow).raw !== null
                    ? String(((row as InvalidImportRow).raw as Record<string, unknown>).name ?? '—')
                    : '—');

            const address =
              row.status !== 'invalid'
                ? (row as ValidImportRow | DuplicateImportRow).data.address
                : (typeof (row as InvalidImportRow).raw === 'object' &&
                    (row as InvalidImportRow).raw !== null
                    ? String(((row as InvalidImportRow).raw as Record<string, unknown>).address ?? '—')
                    : '—');

            const tokenType =
              row.status !== 'invalid'
                ? (row as ValidImportRow | DuplicateImportRow).data.tokenType
                : '—';

            return (
              <div
                key={row.rowIndex}
                role="row"
                className={`grid grid-cols-[2rem_1fr_1fr_6rem_1fr] gap-2 border-b border-gray-800 px-3 py-2 last:border-b-0 ${
                  isValid ? '' : isDuplicate ? 'bg-amber-950/20' : 'bg-red-950/20'
                }`}
              >
                <span role="cell" className="text-gray-500">{row.rowIndex + 1}</span>
                <span role="cell" className="truncate text-white">{name}</span>
                <span role="cell" className="truncate font-mono text-xs text-gray-300">
                  {address.length > 12
                    ? `${address.slice(0, 6)}…${address.slice(-4)}`
                    : address}
                </span>
                <span role="cell" className="text-gray-300">{tokenType}</span>
                <span role="cell">
                  {isValid && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle className="h-3 w-3" aria-hidden="true" /> Valid
                    </span>
                  )}
                  {isDuplicate && (
                    <span
                      className="flex items-center gap-1 text-amber-400"
                      title={`"${(row as DuplicateImportRow).conflictingName}" already uses this address`}
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Duplicate
                    </span>
                  )}
                  {row.status === 'invalid' && (
                    <span
                      className="flex items-center gap-1 text-red-400"
                      title={(row as InvalidImportRow).errors.join('; ')}
                    >
                      <XCircle className="h-3 w-3" aria-hidden="true" /> Invalid
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* Error detail for invalid rows */}
        {invalidCount > 0 && (
          <details className="text-xs text-red-400">
            <summary className="cursor-pointer select-none">Show validation errors</summary>
            <ul className="mt-2 space-y-1 pl-4">
              {rows
                .filter((r): r is InvalidImportRow => r.status === 'invalid')
                .map((r) => (
                  <li key={r.rowIndex}>
                    Row {r.rowIndex + 1}: {r.errors.join('; ')}
                  </li>
                ))}
            </ul>
          </details>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={validCount === 0 || isImporting}
          >
            {isImporting ? 'Importing…' : `Import ${validCount} contact${validCount !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
