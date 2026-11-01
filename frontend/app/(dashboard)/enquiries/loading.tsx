import { RoyalSkeleton, RoyalTableSkeleton } from '@/components/ui/royal-skeleton';

export default function EnquiriesLoading() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <RoyalSkeleton className="h-8 w-48" />
          <RoyalSkeleton className="h-4 w-80" />
        </div>
        <RoyalSkeleton className="h-10 w-36 rounded-xl" />
      </div>

      {/* Filter Bar + 10-Row Table */}
      <RoyalTableSkeleton rows={10} cols={6} />
    </div>
  );
}

