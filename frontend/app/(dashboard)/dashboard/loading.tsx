import { RoyalCardSkeleton, RoyalChartSkeleton, RoyalTableSkeleton, RoyalSkeleton } from '@/components/ui/royal-skeleton';

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <RoyalSkeleton className="h-8 w-64" />
          <RoyalSkeleton className="h-4 w-96" />
        </div>
        <div className="flex items-center gap-2">
          <RoyalSkeleton className="h-9 w-32 rounded-lg" />
          <RoyalSkeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>

      {/* 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RoyalCardSkeleton />
        <RoyalCardSkeleton />
        <RoyalCardSkeleton />
        <RoyalCardSkeleton />
      </div>

      {/* 2 Side-by-Side Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RoyalChartSkeleton title="Gross Contract Value & Revenue Pipeline" />
        <RoyalChartSkeleton title="Cash Flow & Expense Reconciliation" />
      </div>

      {/* Upcoming Payments & Milestones Table Skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <RoyalSkeleton className="h-5 w-48" />
          <RoyalSkeleton className="h-4 w-24" />
        </div>
        <RoyalTableSkeleton rows={5} cols={5} />
      </div>
    </div>
  );
}

