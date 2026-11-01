import { RoyalCardSkeleton, RoyalSkeleton, RoyalTableSkeleton } from '@/components/ui/royal-skeleton';

export default function PaymentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <RoyalSkeleton className="h-8 w-56" />
          <RoyalSkeleton className="h-4 w-96" />
        </div>
        <RoyalSkeleton className="h-10 w-44 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <RoyalCardSkeleton />
        <RoyalCardSkeleton />
        <RoyalCardSkeleton />
      </div>

      <RoyalTableSkeleton rows={10} cols={6} />
    </div>
  );
}

