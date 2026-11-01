'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, StatusBadge } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { useApi } from '@/hooks/use-api';
import { useWedding } from '@/lib/wedding-context';
import { fmtDate, fmtTime } from '@/lib/utils';
import { CalendarGrid, gridRange, type CalItem } from './calendar-grid';
import { Async } from './shared';
import type { CalendarTask, EventFunction } from './types';

const FN_TONE = { UPCOMING: 'info', IN_PROGRESS: 'warning', COMPLETED: 'success', CANCELLED: 'neutral' } as const;
const TASK_TONE = (t: CalendarTask) => (t.status === 'DONE' ? 'success' : new Date(t.dueDate) < new Date() ? 'danger' : 'burgundy') as CalItem['tone'];

export function CalendarView() {
  const { weddings } = useWedding();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [pick, setPick] = useState<Date | null>(new Date());
  const [wedding, setWedding] = useState('');
  const [show, setShow] = useState({ functions: true, tasks: true, mine: false });
  const { from, to } = gridRange(month);
  const { data, loading, error, reload } = useApi<{ functions: EventFunction[]; tasks: CalendarTask[] }>('/events/calendar', { from: from.toISOString(), to: to.toISOString(), weddingId: wedding || undefined, mine: show.mine || undefined });

  const items = useMemo<CalItem[]>(() => [
    ...(show.functions ? (data?.functions ?? []).map((f) => ({ id: `f-${f.id}`, at: new Date(f.date), label: `${fmtTime(f.date)} ${f.name}`, tone: FN_TONE[f.status] as CalItem['tone'] })) : []),
    ...(show.tasks ? (data?.tasks ?? []).map((t) => ({ id: `t-${t.id}`, at: new Date(t.dueDate), label: t.name, tone: TASK_TONE(t) })) : []),
  ], [data, show]);
  const same = (d: string) => pick && new Date(d).toDateString() === pick.toDateString();
  const dayFns = show.functions ? (data?.functions ?? []).filter((f) => same(f.date)) : [];
  const dayTasks = show.tasks ? (data?.tasks ?? []).filter((t) => same(t.dueDate)) : [];

  return (
    <div className="grid xl:grid-cols-[1fr_320px] gap-5">
      <Card pad={false} title={format(month, 'MMMM yyyy')} action={
        <div className="flex flex-wrap items-center gap-2 pr-4">
          <Select className="!w-44 !h-8 !text-xs" value={wedding} onChange={setWedding} options={weddings.map((w) => ({ v: w.id, l: w.name }))} placeholder="All weddings" />
          <button className="btn-ghost btn-sm !px-2" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></button>
          <button className="btn-secondary btn-sm" onClick={() => { setMonth(startOfMonth(new Date())); setPick(new Date()); }}>Today</button>
          <button className="btn-ghost btn-sm !px-2" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></button>
        </div>}>
        <div className="flex flex-wrap gap-4 px-5 pb-3 text-sm">
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={show.functions} onChange={(e) => setShow({ ...show, functions: e.target.checked })} />Functions</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={show.tasks} onChange={(e) => setShow({ ...show, tasks: e.target.checked })} />Task deadlines</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={show.mine} onChange={(e) => setShow({ ...show, mine: e.target.checked })} />Only my tasks</label>
        </div>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data} rows={2}><CalendarGrid month={month} items={items} selected={pick} onSelect={setPick} /></Async>
      </Card>
      <Card title={pick ? fmtDate(pick, 'EEEE, dd MMM') : 'Select a day'}>
        {!pick ? <p className="text-sm text-ink-soft">Pick a day to see its agenda.</p> : dayFns.length + dayTasks.length === 0 ? <p className="text-sm text-ink-soft">Nothing scheduled on this day.</p> : (
          <div className="space-y-4">
            {dayFns.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-ink-soft mb-2">Functions</p><ul className="space-y-2.5">{dayFns.map((f) => <li key={f.id}><p className="text-sm font-medium flex flex-wrap items-center gap-2">{f.name}<StatusBadge status={f.status} /></p><p className="text-xs text-ink-soft">{fmtTime(f.date)} · {f.wedding.name}{f.venue ? ` · ${f.venue}` : ''}</p></li>)}</ul><Link href="/event-functions" className="text-xs text-burgundy hover:underline mt-2 inline-block">Open Event Functions</Link></div>}
            {dayTasks.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-ink-soft mb-2">Tasks due</p><ul className="space-y-2.5">{dayTasks.map((t) => <li key={t.id}><p className="text-sm font-medium flex flex-wrap items-center gap-2">{t.name}<StatusBadge status={t.status} /></p><p className="text-xs text-ink-soft">{t.wedding.name} · {t.owner?.name ?? 'Unassigned'}</p></li>)}</ul><Link href="/tasks" className="text-xs text-burgundy hover:underline mt-2 inline-block">Open Tasks</Link></div>}
          </div>
        )}
      </Card>
    </div>
  );
}
