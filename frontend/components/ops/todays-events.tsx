'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { AlertTriangle, CalendarCheck, ClipboardList, MapPin, Truck, Users } from 'lucide-react';
import { Card, EmptyState, StatCard, StatusBadge } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { fmtDate, fmtTime, humanize } from '@/lib/utils';
import { LiveWatch } from './live-watch';
import { Async, tzOffset } from './shared';
import type { ArrivalCounts, ArrivalRow, EventFunction, IncidentRow } from './types';

interface TodayData {
  date: string; serverTime: string;
  weddings: { id: string; name: string; venue?: string | null; location: string; status: string; expectedGuests: number; actualGuests: number | null }[];
  functions: EventFunction[];
  timeline: { id: string; title: string; scheduledAt: string; status: string; delayMinutes: number; responsible?: string | null; wedding: { id: string; name: string } }[];
  checkin: ArrivalCounts; arrivals: ArrivalRow[]; incidents: IncidentRow[]; guestsCheckedIn: number;
  tasks: { id: string; name: string; dueDate: string; priority: string; status: string; wedding: { id: string; name: string } }[];
}
const SLICES = [{ k: 'arrived', l: 'Arrived', c: '#21845A' }, { k: 'completed', l: 'Checked out', c: '#477BC4' }, { k: 'delayed', l: 'Delayed', c: '#D99A35' }, { k: 'pending', l: 'Pending', c: '#C9C2BA' }] as const;

export function TodaysEvents() {
  const tz = useMemo(tzOffset, []);
  const { data, loading, error, reload } = useApi<TodayData>('/events/today', { tz });
  const refresh = useCallback(() => { void reload(); }, [reload]);
  useEffect(() => { const t = setInterval(refresh, 30000); return () => clearInterval(t); }, [refresh]);

  const pie = data ? SLICES.map((s) => ({ name: s.l, value: data.checkin[s.k], color: s.c })).filter((s) => s.value > 0) : [];
  const done = data ? data.checkin.arrived + data.checkin.completed : 0;
  return (
    <Async loading={loading} error={error} onRetry={reload} hasData={!!data} rows={4}>
      {data && (
        <div className="space-y-5">
          {data.weddings.map((w) => <LiveWatch key={w.id} weddingId={w.id} onChange={refresh} />)}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Functions today" value={data.functions.length} icon={<CalendarCheck className="h-5 w-5" />} hint={`${data.weddings.length} wedding${data.weddings.length === 1 ? '' : 's'} live`} />
            <StatCard label="Vendors arrived" value={`${done}/${data.checkin.total}`} icon={<Truck className="h-5 w-5" />} hint={data.checkin.delayed ? `${data.checkin.delayed} delayed` : undefined} />
            <StatCard label="Open incidents" value={data.incidents.length} icon={<AlertTriangle className="h-5 w-5" />} />
            <StatCard label="Guests checked in" value={data.guestsCheckedIn} icon={<Users className="h-5 w-5" />} />
          </div>

          {data.weddings.length === 0 ? (
            <Card><EmptyState title="No events today" hint={`Nothing is scheduled for ${fmtDate(data.date)}. Upcoming functions are listed under Event Functions.`} /></Card>
          ) : (
            <div className="grid xl:grid-cols-[1.3fr_1fr] gap-5">
              <div className="space-y-5 min-w-0">
                <Card title="Today’s schedule" action={<span className="text-xs text-ink-soft">{fmtDate(data.date, 'EEEE, dd MMM')}</span>}>
                  {data.functions.length === 0 && data.timeline.length === 0 ? <p className="text-sm text-ink-soft">No functions or run-sheet items today.</p> : (
                    <div className="space-y-5">
                      {data.functions.length > 0 && <ul className="space-y-3">{data.functions.map((f) => (
                        <li key={f.id} className="flex items-start gap-3"><div className="w-20 text-right shrink-0 text-sm tabular-nums font-medium">{fmtTime(f.date)}</div>
                          <div className="min-w-0 flex-1"><p className="text-sm font-medium flex flex-wrap items-center gap-2">{f.name}<StatusBadge status={f.status} /></p><p className="text-xs text-ink-soft flex flex-wrap gap-x-3"><span>{f.wedding.name}</span>{f.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{f.venue}</span>}<span>{f.expectedGuests} guests</span></p></div></li>
                      ))}</ul>}
                      {data.timeline.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-ink-soft mb-2">Run sheet</p><ul className="divide-y divide-line">{data.timeline.map((t) => (
                        <li key={t.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1"><span className="w-20 text-right text-sm tabular-nums shrink-0">{fmtTime(t.scheduledAt)}</span><span className="text-sm flex-1 min-w-[10rem]">{t.title}<span className="block text-xs text-ink-soft">{[t.wedding.name, t.responsible].filter(Boolean).join(' · ')}</span></span>{t.delayMinutes > 0 && <span className="text-xs text-danger font-medium">+{t.delayMinutes} min</span>}<StatusBadge status={t.status} /></li>
                      ))}</ul></div>}
                    </div>
                  )}
                </Card>
                <Card title="My tasks" action={<Link href="/tasks" className="text-xs text-burgundy hover:underline">All tasks</Link>}>
                  {data.tasks.length === 0 ? <p className="text-sm text-ink-soft">Nothing due. You’re all caught up.</p> : <ul className="divide-y divide-line">{data.tasks.map((t) => (
                    <li key={t.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1"><ClipboardList className="h-4 w-4 text-ink-soft shrink-0" /><span className="text-sm flex-1 min-w-[10rem]">{t.name}<span className="block text-xs text-ink-soft">{t.wedding.name} · due {fmtDate(t.dueDate)}</span></span><StatusBadge status={t.priority} /><StatusBadge status={t.status} /></li>
                  ))}</ul>}
                </Card>
              </div>
              <div className="space-y-5 min-w-0">
                <Card title="Vendor check-in" action={<Link href="/command-centre/vendor-checkin" className="text-xs text-burgundy hover:underline">Open board</Link>}>
                  {data.checkin.total === 0 ? <p className="text-sm text-ink-soft">No vendors are booked on today’s weddings.</p> : (
                    <div className="flex flex-wrap items-center gap-5">
                      <div className="relative h-36 w-36 shrink-0">
                        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="value" innerRadius={44} outerRadius={64} paddingAngle={2} stroke="none">{pie.map((p) => <Cell key={p.name} fill={p.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
                        <div className="absolute inset-0 grid place-items-center pointer-events-none text-center"><div><p className="num text-2xl leading-none">{done}</p><p className="text-[11px] text-ink-soft">of {data.checkin.total}</p></div></div>
                      </div>
                      <ul className="space-y-1.5 text-sm">{SLICES.map((s) => <li key={s.k} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.c }} />{s.l}<b className="ml-auto pl-4 tabular-nums">{data.checkin[s.k]}</b></li>)}</ul>
                    </div>
                  )}
                  {data.arrivals.filter((a) => a.bucket === 'delayed' || a.overdueMinutes > 0).slice(0, 4).map((a) => (
                    <p key={a.id} className="mt-3 text-xs rounded-lg bg-warning-soft px-3 py-2">{a.vendor.name} · {humanize(a.category)} · {a.arrival?.delayMinutes ? `${a.arrival.delayMinutes} min late` : `${a.overdueMinutes} min overdue`}</p>
                  ))}
                </Card>
                <Card title="Open incidents" action={<Link href="/incidents" className="text-xs text-burgundy hover:underline">All incidents</Link>}>
                  {data.incidents.length === 0 ? <p className="text-sm text-ink-soft">All clear.</p> : <ul className="space-y-2.5">{data.incidents.slice(0, 6).map((i) => (
                    <li key={i.id} className="rounded-lg border border-line p-3"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium flex-1 min-w-[8rem]">{i.title}</p><StatusBadge status={i.severity} /><StatusBadge status={i.status} /></div><p className="text-xs text-ink-soft mt-1">{i.wedding.name} · {i.assignedTo?.name ?? 'Unassigned'}</p></li>
                  ))}</ul>}
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </Async>
  );
}
