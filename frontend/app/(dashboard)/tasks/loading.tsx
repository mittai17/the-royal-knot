import { RoyalSkeleton } from '@/components/ui/royal-skeleton';

export default function TasksLoading() {
  const columns = ['To Plan', 'In Progress', 'Waiting for Vendor', 'Under Review', 'Completed'];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <RoyalSkeleton className="h-8 w-56" />
          <RoyalSkeleton className="h-4 w-80" />
        </div>
        <div className="flex items-center gap-2">
          <RoyalSkeleton className="h-10 w-32 rounded-xl" />
          <RoyalSkeleton className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      {/* 5-Column Kanban Board Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
        {columns.map((col, cIdx) => (
          <div key={col} className="rounded-2xl border border-line bg-surface-2/40 p-3 space-y-3 min-w-[240px]">
            {/* Column Header */}
            <div className="flex items-center justify-between px-1 py-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                {col}
              </span>
              <RoyalSkeleton className="h-4 w-6 rounded-full" />
            </div>

            {/* 4 Task Cards in Column */}
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card p-4 border border-line bg-white shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <RoyalSkeleton className="h-4 w-16 rounded-full" />
                    <RoyalSkeleton className="h-4 w-4 rounded-full" />
                  </div>
                  <RoyalSkeleton className="h-4 w-full" />
                  <RoyalSkeleton className="h-3 w-3/4" />
                  <div className="flex items-center justify-between pt-1">
                    <RoyalSkeleton className="h-5 w-20 rounded-md" />
                    <RoyalSkeleton className="h-6 w-6 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

