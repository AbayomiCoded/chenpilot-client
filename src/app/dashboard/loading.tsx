import { SkeletonCard, SkeletonTable } from '@/components/ui/Skeleton';

/**
 * Dashboard loading skeleton (#149).
 * Next.js renders this automatically while the dashboard page suspends.
 * Layout matches the real page: a row of KPI cards followed by the
 * transaction table.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6" aria-label="Loading dashboard">
      {/* KPI card row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Recent transactions table */}
      <SkeletonTable rows={6} />
    </div>
  );
}
