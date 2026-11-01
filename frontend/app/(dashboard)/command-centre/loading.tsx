import { RoyalSkeleton } from '@/components/ui/royal-skeleton';

export default function CommandCentreLoading() {
  return (
    <div className="space-y-6">
      {/* Live Status Header Bar */}
      <div className="card p-5 border border-line bg-gradient-to-r from-white to-surface-2 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-success animate-ping" />
            <RoyalSkeleton className="h-4 w-32 rounded-full" />
          </div>
          <RoyalSkeleton className="h-7 w-64" />
        </div>
        <div className="flex items-center gap-3">
          <RoyalSkeleton className="h-10 w-44 rounded-xl" />
          <RoyalSkeleton className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      {/* Grid: Left Vertical Timeline + Right Vendor Arrivals & Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: 2 Columns - Vertical Timeline */}
        <div className="lg:col-span-2 card p-6 border border-line bg-white space-y-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <RoyalSkeleton className="h-5 w-40" />
            <RoyalSkeleton className="h-7 w-28 rounded-lg" />
          </div>

          <div className="space-y-4 pl-4 border-l-2 border-line/80 relative">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="relative space-y-2">
                <span className="absolute -left-[23px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-burgundy/60" />
                <div className="flex items-center justify-between">
                  <RoyalSkeleton className="h-4 w-36" />
                  <RoyalSkeleton className="h-4 w-20" />
                </div>
                <RoyalSkeleton className="h-16 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>

        {/* Right: 1 Column - Vendor Arrivals & Active Incidents */}
        <div className="space-y-5">
          {/* Vendor Arrival Board */}
          <div className="card p-5 border border-line bg-white space-y-4">
            <div className="flex items-center justify-between">
              <RoyalSkeleton className="h-5 w-36" />
              <RoyalSkeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-line bg-surface-2/40">
                  <div className="space-y-1">
                    <RoyalSkeleton className="h-4 w-28" />
                    <RoyalSkeleton className="h-3 w-20" />
                  </div>
                  <RoyalSkeleton className="h-6 w-20 rounded-md" />
                </div>
              ))}
            </div>
          </div>

          {/* Incidents Ticker */}
          <div className="card p-5 border border-line bg-white space-y-4">
            <div className="flex items-center justify-between">
              <RoyalSkeleton className="h-5 w-32" />
              <RoyalSkeleton className="h-5 w-14 rounded-full" />
            </div>
            <RoyalSkeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

