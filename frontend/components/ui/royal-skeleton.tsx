import { cn } from '@/lib/utils';

export function RoyalSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-[#E9E4DE]/60 animate-pulse before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent',
        className
      )}
      {...props}
    />
  );
}

export function RoyalCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('card p-6 space-y-4 border border-line bg-white/70 shadow-card', className)}>
      <div className="flex items-center justify-between">
        <RoyalSkeleton className="h-4 w-28" />
        <RoyalSkeleton className="h-8 w-8 rounded-full" />
      </div>
      <RoyalSkeleton className="h-8 w-36" />
      <div className="pt-2 flex items-center justify-between">
        <RoyalSkeleton className="h-3 w-20" />
        <RoyalSkeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export function RoyalTableSkeleton({ rows = 8, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn('card overflow-hidden border border-line bg-white', className)}>
      <div className="flex items-center justify-between p-4 border-b border-line bg-surface-2/40">
        <div className="flex items-center gap-3">
          <RoyalSkeleton className="h-9 w-64 rounded-lg" />
          <RoyalSkeleton className="h-9 w-32 rounded-lg" />
          <RoyalSkeleton className="h-9 w-32 rounded-lg" />
        </div>
        <RoyalSkeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="p-4 space-y-3">
        {/* Table Header */}
        <div className="grid gap-4 pb-2 border-b border-line" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <RoyalSkeleton key={`th-${c}`} className="h-4 w-3/4" />
          ))}
        </div>
        {/* Table Rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`tr-${r}`} className="grid gap-4 py-3 border-b border-line/60 last:border-0 items-center" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((_, c) => (
              <RoyalSkeleton key={`td-${r}-${c}`} className={cn('h-4', c === 0 ? 'w-5/6' : c === cols - 1 ? 'w-1/2' : 'w-2/3')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoyalChartSkeleton({ className, title = 'Analytics' }: { className?: string; title?: string }) {
  return (
    <div className={cn('card p-6 space-y-4 border border-line bg-white', className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink-soft">{title}</p>
          <RoyalSkeleton className="h-6 w-32" />
        </div>
        <RoyalSkeleton className="h-7 w-24 rounded-lg" />
      </div>
      <div className="h-64 flex items-end gap-3 pt-6 px-2 border-b border-l border-line/60">
        {[40, 65, 30, 85, 95, 60, 75, 50, 90, 70, 80, 100].map((h, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end items-center gap-1.5 h-full">
            <RoyalSkeleton className="w-full rounded-t-sm" style={{ height: `${h}%` }} />
            <RoyalSkeleton className="h-2.5 w-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoyalHeroSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('card overflow-hidden border border-line bg-white p-6 space-y-6', className)}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <RoyalSkeleton className="h-5 w-24 rounded-full" />
            <RoyalSkeleton className="h-5 w-32 rounded-full" />
          </div>
          <RoyalSkeleton className="h-8 w-72" />
          <RoyalSkeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-3">
          <RoyalSkeleton className="h-10 w-32 rounded-lg" />
          <RoyalSkeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      {/* 11-Tab Bar Skeleton */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-line">
        {Array.from({ length: 8 }).map((_, i) => (
          <RoyalSkeleton key={i} className="h-8 w-24 rounded-lg shrink-0" />
        ))}
      </div>
      {/* 3-Column Overview Grid */}
      <div className="grid md:grid-cols-3 gap-5">
        <RoyalSkeleton className="h-44 rounded-xl" />
        <RoyalSkeleton className="h-44 rounded-xl" />
        <RoyalSkeleton className="h-44 rounded-xl" />
      </div>
    </div>
  );
}

