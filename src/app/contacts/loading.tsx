import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';

/**
 * Contacts loading skeleton (#149).
 */
export default function ContactsLoading() {
  return (
    <div className="space-y-6 p-6" aria-label="Loading contacts">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      {/* Search */}
      <Skeleton className="h-9 w-full max-w-sm rounded-lg" />

      {/* Contact list */}
      <div
        aria-busy="true"
        aria-label="Loading contact list"
        className={cn(
          'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden'
        )}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
