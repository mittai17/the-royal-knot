'use client';
import { useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { Card, ErrorState, Skeleton, EmptyState, ProgressBar } from '@/components/ui/primitives';
import { Segmented, Select, SearchInput } from '@/components/shared/form-bits';
import { CalendarView, KanbanView, ListView, TimelineView } from './views';
import { TaskDetail } from './task-detail';
import { useApi, asRows } from '@/hooks/use-api';
import { useLive } from '@/hooks/use-live';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { TASK_CATEGORIES } from '@/lib/enums';
import type { Task } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';

type View = 'kanban' | 'list' | 'calendar' | 'timeline';

export function TasksPanel({ weddingId }: { weddingId: string }) {
  const [view, setView] = useState<View>('kanban');
  const [category, setCategory] = useState('');
  const [mine, setMine] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Task | null>(null);
  const [gen, setGen] = useState(false);
  const r = useApi<unknown>(`/weddings/${weddingId}/tasks`, { pageSize: 500 });
  useLive(weddingId, (e) => { if (e === 'task.updated') void r.reload(); });

  const all = asRows<Task>(r.data);
  const tasks = all.filter((t) => (!category || t.category === category) && (!mine || t.owner?.id === mine) && (!search || t.name.toLowerCase().includes(search.toLowerCase())));
  const owners = [...new Map(all.filter((t) => t.owner).map((t) => [t.owner!.id, t.owner!.name])).entries()].map(([v, l]) => ({ v, l }));
  const done = all.filter((t) => t.status === 'COMPLETED').length;
  const onSaved = async () => { await r.reload(); setOpen(null); };

  const generate = async () => {
    setGen(true);
    try { const res = await api.post<{ created: number; skipped: number }>(`/weddings/${weddingId}/tasks/generate`); notify.ok(res.data.created ? `${res.data.created} tasks generated` : `Checklist already generated; ${res.data.skipped} existing tasks left untouched`); r.reload(); }
    catch (e) { notify.err(e); } finally { setGen(false); }
  };

  if (r.error) return <Card><ErrorState message={r.error} onRetry={r.reload} /></Card>;
  return (
    <>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <SearchInput value={search} onChange={setSearch} placeholder="Filter tasks…" />
          <Select className="w-44" value={category} onChange={setCategory} options={TASK_CATEGORIES} placeholder="All categories" />
          <Select className="w-40" value={mine} onChange={setMine} options={owners} placeholder="All owners" />
          <div className="ml-auto flex items-center gap-3">
            {all.length > 0 && <div className="hidden md:flex items-center gap-2 w-40"><ProgressBar value={(done / all.length) * 100} /><span className="text-xs text-ink-soft tabular-nums whitespace-nowrap">{done}/{all.length}</span></div>}
            <Segmented value={view} onChange={setView} options={[{ v: 'kanban', l: 'Kanban' }, { v: 'list', l: 'List' }, { v: 'calendar', l: 'Calendar' }, { v: 'timeline', l: 'Timeline' }]} />
          </div>
        </div>
        <div className="p-4">
          {r.loading ? <Skeleton className="h-72" /> : all.length === 0 ? (
            <EmptyState title="No planning tasks yet" hint="Tasks generate automatically once the booking payment is recorded. You can also generate the checklist now; it never creates duplicates." action={<Can roles={G.PLANNING}><button className="btn-primary" onClick={generate} disabled={gen}>{gen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}Generate checklist</button></Can>} />
          ) : view === 'kanban' ? <KanbanView tasks={tasks} onOpen={setOpen} onChanged={r.reload} />
            : view === 'list' ? <ListView tasks={tasks} onOpen={setOpen} />
            : view === 'calendar' ? <CalendarView tasks={tasks} onOpen={setOpen} />
            : <TimelineView tasks={tasks} onOpen={setOpen} />}
        </div>
      </Card>
      <TaskDetail task={open} all={all} onClose={() => setOpen(null)} onSaved={onSaved} />
    </>
  );
}
