import { cn } from '@/utils/cn';

interface SkeletonProps {
  className?: string;
}

/**
 * Base skeleton shimmer block (#149).
 * The shimmer animation is suppressed for users who prefer reduced motion;
 * they see a static muted block instead.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-md bg-gray-200 dark:bg-gray-700',
        'motion-safe:animate-pulse',
        className
      )}
    />
  );
}

/** One skeleton card matching the Card component proportions. */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-3',
        className
      )}
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** One skeleton row matching a table/list row. */
export function SkeletonRow({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700',
        className
      )}
    >
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-16 shrink-0" />
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  className?: string;
}

/** A skeleton table with configurable row count. */
export function SkeletonTable({ rows = 5, className }: SkeletonTableProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading table data"
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden',
        className
      )}
    >
      {/* header */}
      <div className="flex gap-4 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-32 ml-auto" />
        <Skeleton className="h-3 w-20" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

/** A skeleton chat message bubble. */
export function SkeletonMessage({ align = 'left' }: { align?: 'left' | 'right' }) {
  return (
    <div
      aria-hidden="true"
      className={cn('flex gap-3', align === 'right' && 'flex-row-reverse')}
    >
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className={cn('space-y-2 max-w-xs', align === 'right' && 'items-end flex flex-col')}>
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  );
}
