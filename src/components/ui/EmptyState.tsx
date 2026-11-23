'use client';

import { useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
}

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
  /** `error` renders a failure state (alert role, error styling) instead of "nothing here" (#265). */
  tone?: 'default' | 'error';
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  className = '',
  tone = 'default',
}: EmptyStateProps) {
  const titleId = useId();
  const isError = tone === 'error';
  return (
    <section
      aria-labelledby={titleId}
      role={isError ? 'alert' : undefined}
      data-tone={tone}
      className={`flex min-h-64 flex-col items-center justify-center rounded-xl border px-6 py-12 text-center ${
        isError
          ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
          : 'border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800'
      } ${className}`}
    >
      {icon && (
        <div
          className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
            isError
              ? 'bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-300'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          {icon}
        </div>
      )}
      <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-sm text-gray-600 dark:text-gray-300">
        {description}
      </p>
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action && (
            <Button type="button" variant={action.variant} onClick={action.onClick} className="gap-2">
              {action.icon}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button type="button" variant={secondaryAction.variant ?? 'secondary'} onClick={secondaryAction.onClick} className="gap-2">
              {secondaryAction.icon}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
