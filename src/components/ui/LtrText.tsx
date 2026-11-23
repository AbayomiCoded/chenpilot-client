'use client';

import React from 'react';
import { cn } from '@/utils/cn';

export interface LtrTextProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

/**
 * Isolates inherently left-to-right wallet values (Stellar public keys,
 * transaction hashes, token amounts, fees, ticker codes, ledger numbers)
 * inside RTL layouts such as Arabic without reversing semantic values (#293).
 */
export function LtrText({ children, className, ...props }: LtrTextProps) {
  return (
    <bdi
      dir="ltr"
      className={cn('bidi-ltr-isolate', className)}
      {...props}
    >
      {children}
    </bdi>
  );
}

/**
 * Shared props for inputs accepting LTR identifiers or numeric amounts
 * (e.g., Stellar addresses, transaction hashes, decimal token amounts)
 * so typing and pasting remain predictable in Arabic RTL layouts (#293).
 */
export const BIDI_LTR_INPUT_PROPS = {
  dir: 'ltr' as const,
};
