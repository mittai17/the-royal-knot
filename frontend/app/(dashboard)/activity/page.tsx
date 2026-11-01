'use client';
import { useState } from 'react';
import { ClipboardList, Activity as ActivityIcon, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader, Card, EmptyState, StatCard, StatusBadge, Skeleton } from '@/components/ui/primitives';
import { WeddingGate } from '@/components/shared/wedding-gate';
import { RoleGate } from '@/components/shared/can';
import { UpdatesPanel } from '@/components/ops/updates-panel';
import { useAuth } from '@/lib/auth';
import { useWedding } from '@/lib/wedding-context';
import { useApi, asRows } from '@/hooks/use-api';
import { fmtDateTime } from '@/lib/utils';
import type { FieldReport } from '@/components/ops/types';

function GeneralActivityFeed() {
  const [filter, setFilter] = useState<'ALL' | 'DAILY' | 'TASK' | 'EVENT'>('ALL');
  const summary = useApi<{ updatesToday: number; myUpdates: number; myOpenTasks: number; myOverdueTasks: number }>('/checklists/updates/summary');
  const reportsApi = useApi<FieldReport[]>('/checklists/updates', {
    type: filter === 'ALL' ? undefined : filter,
  });
  const rows = asRows<FieldReport>(reportsApi.data);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Updates today" value={summary.data?.updatesToday ?? 0} icon={<ActivityIcon className="h-5 w-5" />} />
        <StatCard label="My updates" value={summary.data?.myUpdates ?? 0} icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="Open tasks" value={summary.data?.myOpenTasks ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Overdue tasks" value={summary.data?.myOpenTasks ? summary.data?.myOverdueTasks ?? 0 : 0} icon={<AlertCircle className="h-5 w-5" />} />
      </div>

      <Card
        title="Recent Activity"
        action={
          <div className="inline-flex rounded-lg bg-surface-2 p-1 text-xs">
            {(['ALL', 'DAILY', 'TASK', 'EVENT'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  filter === t ? 'bg-white text-burgundy shadow-card' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        }
      >
        {reportsApi.loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No activity recorded"
            hint="Daily reports, task completion updates, and event progress will appear here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="py-3 px-1 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={r.type === 'DAILY' ? 'PROGRESS' : r.type === 'TASK' ? 'SUCCESS' : 'INFO'}
                    />
                    <span className="font-semibold text-sm text-ink">{r.title}</span>
                    {r.wedding && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-ink-soft">
                        {r.wedding.name}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-soft shrink-0">
                    {fmtDateTime(r.createdAt)}
                  </span>
                </div>
                {r.summary && <p className="text-sm text-ink-soft whitespace-pre-wrap">{r.summary}</p>}
                <div className="flex items-center gap-3 text-xs text-ink-soft mt-1">
                  {r.author && <span>By {r.author.name}</span>}
                  {r.progress !== undefined && <span>Progress: {r.progress}%</span>}
                  {r.attendance !== undefined && <span>Attendance: {r.attendance}</span>}
                  {r.issues && <span className="text-burgundy font-medium">Issue: {r.issues}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function ActivityPage() {
  const { user } = useAuth();
  const { selected } = useWedding();
  const isOps = user?.role === 'OPERATIONS';

  return (
    <>
      <PageHeader
        title={isOps ? 'Daily Updates & Work Logs' : 'Activity Feed'}
        subtitle={
          isOps
            ? selected
              ? `${selected.name} · daily progress, task and event reports`
              : 'Daily progress, task and event reports'
            : 'Recent updates across weddings, tasks, vendors and daily operations.'
        }
      />
      {isOps ? (
        <RoleGate roles={['OPERATIONS']}>
          <WeddingGate>{(id) => <UpdatesPanel key={id} weddingId={id} />}</WeddingGate>
        </RoleGate>
      ) : (
        <GeneralActivityFeed />
      )}
    </>
  );
}
