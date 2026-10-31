'use client';
import { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, differenceInCalendarDays } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { StatusBadge, Avatar } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { TASK_STATUSES } from '@/lib/enums';
import { cn, fmtDate, humanize } from '@/lib/utils';
import type { Task } from '@/types';

const overdue = (t: Task) => t.status !== 'COMPLETED' && new Date(t.dueDate) < new Date();
const PRI_DOT: Record<string, string> = { URGENT: 'bg-danger', HIGH: 'bg-warning', MEDIUM: 'bg-info', LOW: 'bg-line' };

export function KanbanView({ tasks, onOpen, onChanged }: { tasks: Task[]; onOpen: (t: Task) => void; onChanged: () => void }) {
  const [over, setOver] = useState<string | null>(null);
  const move = async (id: string, status: string) => {
    try { await api.patch(`/tasks/${id}`, { status }); notify.ok(`Moved to ${humanize(status)}`); onChanged(); } catch (e) { notify.err(e); }
  };
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {TASK_STATUSES.map((s) => {
        const items = tasks.filter((t) => t.status === s);
        return (
          <div key={s} className={cn('flex-1 min-w-[225px] rounded-xl bg-surface-2/70 p-3', over === s && 'bg-gold-soft')} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)} onDrop={(e) => { setOver(null); const id = e.dataTransfer.getData('text/plain'); const t = tasks.find((x) => x.id === id); if (t && t.status !== s) void move(id, s); }}>
            <div className="flex items-center justify-between mb-3 px-1"><StatusBadge status={s} /><span className="text-xs text-ink-soft tabular-nums">{items.length}</span></div>
            <div className="space-y-2.5 max-h-[62vh] overflow-y-auto">
              {items.map((t) => (
                <button key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)} onClick={() => onOpen(t)} className="w-full text-left card p-3 hover:shadow-pop cursor-grab active:cursor-grabbing">
                  <div className="flex items-start gap-2"><span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', PRI_DOT[t.priority])} /><p className="text-sm font-medium leading-snug">{t.name}</p></div>
                  <p className="text-[11px] text-ink-soft mt-1.5 ml-4">{humanize(t.category)}</p>
                  <div className="flex items-center justify-between mt-2 ml-4"><span className={cn('text-xs', overdue(t) ? 'text-danger font-medium' : 'text-ink-soft')}>{fmtDate(t.dueDate, 'dd MMM')}</span>{t.owner && <Avatar name={t.owner.name} size={22} />}</div>
                </button>
              ))}
              {!items.length && <p className="text-xs text-ink-soft text-center py-4">No tasks</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ListView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const cols = useMemo<ColumnDef<Task, unknown>[]>(() => [
    { id: 'name', header: 'Task', accessorFn: (t) => t.name, cell: ({ row: { original: t } }) => <div><p className="font-medium">{t.name}</p><p className="text-xs text-ink-soft">{humanize(t.category)}{t.event ? ` · ${t.event.name}` : ''}</p></div> },
    { id: 'owner', header: 'Owner', accessorFn: (t) => t.owner?.name ?? '', cell: ({ row: { original: t } }) => t.owner ? <span className="inline-flex items-center gap-2"><Avatar name={t.owner.name} size={24} />{t.owner.name}</span> : <span className="text-ink-soft">Unassigned</span> },
    { id: 'dueDate', header: 'Due', accessorFn: (t) => t.dueDate, cell: ({ row: { original: t } }) => <span className={overdue(t) ? 'text-danger font-medium' : ''}>{fmtDate(t.dueDate)}</span> },
    { id: 'priority', header: 'Priority', accessorFn: (t) => ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].indexOf(t.priority), cell: ({ row: { original: t } }) => <StatusBadge status={t.priority} /> },
    { id: 'vendor', header: 'Vendor', enableSorting: false, cell: ({ row: { original: t } }) => t.weddingVendor?.vendor?.name ?? '—' },
    { id: 'status', header: 'Status', accessorFn: (t) => t.status, cell: ({ row: { original: t } }) => <StatusBadge status={t.status} /> },
  ], []);
  return <DataTable columns={cols} data={tasks} onRowClick={onOpen} emptyTitle="No tasks match" />;
}

export function CalendarView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const [month, setMonth] = useState(() => { const d = tasks[0] ? new Date(tasks[0].dueDate) : new Date(); return startOfMonth(d); });
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  return (
    <div>
      <div className="flex items-center justify-between mb-3"><h3 className="font-serif text-lg">{format(month, 'MMMM yyyy')}</h3><div className="flex gap-1"><button className="btn-secondary btn-sm !px-2" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button><button className="btn-secondary btn-sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</button><button className="btn-secondary btn-sm !px-2" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button></div></div>
      <div className="grid grid-cols-7 border-l border-t border-line rounded-lg overflow-hidden">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="text-[11px] uppercase tracking-wider text-ink-soft bg-surface-2/60 px-2 py-2 border-r border-b border-line">{d}</div>)}
        {days.map((d) => {
          const items = tasks.filter((t) => format(new Date(t.dueDate), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd'));
          return (
            <div key={d.toISOString()} className={cn('min-h-[104px] p-1.5 border-r border-b border-line bg-white', !isSameMonth(d, month) && 'bg-surface-2/40')}>
              <span className={cn('inline-grid place-items-center h-6 w-6 text-xs rounded-full', isToday(d) ? 'bg-burgundy text-white' : 'text-ink-soft')}>{format(d, 'd')}</span>
              <div className="space-y-1 mt-1">{items.slice(0, 3).map((t) => <button key={t.id} onClick={() => onOpen(t)} className={cn('w-full truncate text-left text-[11px] rounded px-1.5 py-0.5', t.status === 'COMPLETED' ? 'bg-success-soft text-success line-through' : overdue(t) ? 'bg-danger-soft text-danger' : 'bg-gold-soft text-burgundy')}>{t.name}</button>)}{items.length > 3 && <p className="text-[10px] text-ink-soft px-1">+{items.length - 3} more</p>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TimelineView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const sorted = useMemo(() => [...tasks].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)), [tasks]);
  if (!sorted.length) return <p className="text-sm text-ink-soft py-6 text-center">No tasks to plot.</p>;
  const start = new Date(sorted[0].dueDate); const end = new Date(sorted[sorted.length - 1].dueDate);
  const span = Math.max(1, differenceInCalendarDays(end, start));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] space-y-1.5">
        <div className="flex justify-between text-[11px] text-ink-soft pl-[240px] pr-2"><span>{fmtDate(start, 'dd MMM yyyy')}</span><span>{fmtDate(end, 'dd MMM yyyy')}</span></div>
        {sorted.map((t) => {
          const left = (differenceInCalendarDays(new Date(t.dueDate), start) / span) * 100;
          return (
            <button key={t.id} onClick={() => onOpen(t)} className="flex items-center w-full group text-left">
              <span className="w-[240px] shrink-0 pr-3 truncate text-xs group-hover:text-burgundy">{t.name}</span>
              <span className="relative flex-1 h-5 bg-surface-2/60 rounded">
                <span className={cn('absolute top-0.5 h-4 w-4 rounded-full -translate-x-1/2 ring-2 ring-white', t.status === 'COMPLETED' ? 'bg-success' : overdue(t) ? 'bg-danger' : t.status === 'IN_PROGRESS' ? 'bg-info' : 'bg-gold')} style={{ left: `${left}%` }} title={`${t.name} · ${fmtDate(t.dueDate)}`} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
