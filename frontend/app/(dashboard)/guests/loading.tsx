import { RoyalSkeleton, RoyalTableSkeleton } from '@/components/ui/royal-skeleton';

export default function GuestsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <RoyalSkeleton className="h-8 w-48" />
          <RoyalSkeleton className="h-4 w-80" />
        </div>
        <div className="flex items-center gap-2">
          <RoyalSkeleton className="h-10 w-28 rounded-xl" />
          <RoyalSkeleton className="h-10 w-36 rounded-xl" />
        </div>
      </div>
      <RoyalTableSkeleton rows={10} cols={6} />
    </div>
  );
}

