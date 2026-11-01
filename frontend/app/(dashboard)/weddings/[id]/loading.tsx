import { RoyalHeroSkeleton, RoyalSkeleton } from '@/components/ui/royal-skeleton';

export default function WeddingDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Wedding Hero Banner Skeleton + 11-Tab Navigation + 3-Column Overview Grid */}
      <RoyalHeroSkeleton />

      {/* Additional tab content cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="card p-6 border border-line bg-white space-y-4">
          <RoyalSkeleton className="h-5 w-32" />
          <RoyalSkeleton className="h-20 w-full rounded-xl" />
          <RoyalSkeleton className="h-4 w-40" />
        </div>
        <div className="card p-6 border border-line bg-white space-y-4">
          <RoyalSkeleton className="h-5 w-32" />
          <RoyalSkeleton className="h-20 w-full rounded-xl" />
          <RoyalSkeleton className="h-4 w-40" />
        </div>
        <div className="card p-6 border border-line bg-white space-y-4">
          <RoyalSkeleton className="h-5 w-32" />
          <RoyalSkeleton className="h-20 w-full rounded-xl" />
          <RoyalSkeleton className="h-4 w-40" />
        </div>
      </div>
    </div>
  );
}

