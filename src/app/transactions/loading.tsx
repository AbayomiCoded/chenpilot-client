import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton';

/**
 * Transactions loading skeleton (#149).
 */
export default function TransactionsLoading() {
  return (
    <div className="space-y-6 p-6" aria-label="Loading transactions">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Filter bar */}
      <div className="flex gap-3">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 flex-1 max-w-xs rounded-lg" />
      </div>

      <SkeletonTable rows={10} />
    </div>
  );
}
