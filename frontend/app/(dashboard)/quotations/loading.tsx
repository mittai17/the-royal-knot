import { RoyalSkeleton } from '@/components/ui/royal-skeleton';

export default function QuotationsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <RoyalSkeleton className="h-8 w-64" />
          <RoyalSkeleton className="h-4 w-96" />
        </div>
        <RoyalSkeleton className="h-10 w-48 rounded-xl" />
      </div>

      {/* 3-Vendor Quotation Comparison Matrix Skeleton */}
      <div className="card overflow-hidden border border-line bg-white shadow-card">
        {/* Sticky Header Cards for 3 Vendors */}
        <div className="grid grid-cols-4 gap-4 p-5 border-b border-line bg-surface-2/30">
          <div className="space-y-2">
            <RoyalSkeleton className="h-5 w-32" />
            <RoyalSkeleton className="h-4 w-40" />
          </div>
          {/* Vendor 1 */}
          <div className="card p-4 border border-line bg-white space-y-2">
            <RoyalSkeleton className="h-5 w-36" />
            <RoyalSkeleton className="h-6 w-24" />
            <RoyalSkeleton className="h-4 w-28" />
          </div>
          {/* Vendor 2 */}
          <div className="card p-4 border border-line bg-white space-y-2">
            <RoyalSkeleton className="h-5 w-36" />
            <RoyalSkeleton className="h-6 w-24" />
            <RoyalSkeleton className="h-4 w-28" />
          </div>
          {/* Vendor 3 */}
          <div className="card p-4 border border-line bg-white space-y-2">
            <RoyalSkeleton className="h-5 w-36" />
            <RoyalSkeleton className="h-6 w-24" />
            <RoyalSkeleton className="h-4 w-28" />
          </div>
        </div>

        {/* 8 Line-Item Comparison Rows */}
        <div className="divide-y divide-line/60 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-4 gap-4 py-3.5 items-center">
              <div className="space-y-1">
                <RoyalSkeleton className="h-4 w-44" />
                <RoyalSkeleton className="h-3 w-28" />
              </div>
              <RoyalSkeleton className="h-5 w-24" />
              <RoyalSkeleton className="h-5 w-24" />
              <RoyalSkeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

