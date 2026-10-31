'use client';
import { useCallback, useEffect, useState } from 'react';
import { Radio, Users, MapPin, Wifi, WifiOff, Minus, Plus, CalendarDays, UserCheck } from 'lucide-react';
import { Card, ErrorState, Skeleton, StatusBadge, Avatar } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { TimelinePanel, ArrivalsPanel, IncidentsPanel } from './panels';
import type { CommandState } from './types';
import { useApi } from '@/hooks/use-api';
import { useLive } from '@/hooks/use-live';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { WEDDING_STATUSES } from '@/lib/enums';
import { fmtDate, humanize } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { G } from '@/lib/permissions';

const LABELS: Record<string, string> = { 'vendor.arrival': 'Vendor arrival', 'timeline.updated': 'Timeline changed', 'incident.created': 'New incident', 'incident.updated': 'Incident updated', 'task.updated': 'Task updated', 'guests.updated': 'Guest count changed', 'event.status': 'Event status changed', notification: 'Notification' };

export function CommandCentre({ weddingId }: { weddingId: string }) {
  const { can } = useAuth();
  const ops = can(...G.EVENT_OPS);
  const { data, loading, error, reload } = useApi<CommandState>(`/weddings/${weddingId}/event`);
  const [now, setNow] = useState(new Date());
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 4000); return () => clearTimeout(t); }, [flash]);

  // Every live event triggers a re-read from PostgreSQL, which is the source of truth; sockets only signal "something changed".
  const onEvent = useCallback((e: string) => { setFlash(`Live: ${LABELS[e] ?? e}`); void reload(); }, [reload]);
  useLive(weddingId, onEvent, () => { setLive(true); void reload(); });
  useEffect(() => { if (error) setLive(false); }, [error]);

  const setGuests = async (body: { actualGuests?: number; fromCheckIn?: boolean }) => {
    try { await api.post(`/weddings/${weddingId}/actual-guests`, body); void reload(); } catch (e) { notify.err(e); }
  };
  const setStatus = async (status: string) => {
    try { await api.patch(`/weddings/${weddingId}/event-status`, { status }); notify.ok(`Event status: ${humanize(status)}`); void reload(); } catch (e) { notify.err(e); }
  };

  if (error && !data) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <div className="space-y-4"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-96 rounded-xl" /></div>;
  if (!data) return null;
  const { wedding: w, guests: g, summary } = data;
  const next = data.timeline.find((t) => t.status === 'IN_PROGRESS') ?? data.timeline.find((t) => t.status === 'DELAYED') ?? data.timeline.find((t) => t.status === 'SCHEDULED');
  const actual = g.actual ?? 0;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl text-white p-6 relative overflow-hidden" style={{ background: 'linear-gradient(105deg,#28121D,#401827 70%,#5B2A3C)' }}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-white/70"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${live ? 'bg-success/25 text-[#9BE3C1]' : 'bg-white/10'}`}>{live ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{live ? 'Live' : 'Connecting…'}</span>{flash && <span className="inline-flex items-center gap-1 text-gold"><Radio className="h-3 w-3 animate-pulse" />{flash}</span>}</div>
            <h2 className="font-serif text-3xl mt-2">{w.name}</h2>
            <p className="text-sm text-white/70 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{w.venue ?? w.location}</span><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(w.startDate, 'dd MMM')} – {fmtDate(w.endDate, 'dd MMM yyyy')}</span></p>
            <p className="text-sm mt-3 text-white/80">Current event: <b className="text-white">{data.currentEvent?.name ?? '—'}</b>{next && <> · Next: <b className="text-white">{next.title}</b></>}</p>
            <div className="mt-3 flex items-center gap-2 text-xs"><span className="text-white/60">Event status</span>{ops ? <Select className="!h-8 !w-44 !text-xs !bg-white/10 !text-white !border-white/20" value={w.status} onChange={setStatus} options={WEDDING_STATUSES} /> : <span className="text-white font-medium">{humanize(w.status)}</span>}</div>
          </div>
          <div className="flex gap-6 items-end flex-wrap">
            <div className="text-right"><p className="num text-4xl tabular-nums">{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</p><p className="text-xs text-white/60">{fmtDate(now, 'EEEE, dd MMM')}</p></div>
            <div className="rounded-xl bg-white/10 p-3.5 min-w-[220px]">
              <p className="text-xs text-white/70 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Guests · actual / expected</p>
              <div className="flex items-center gap-2 mt-1"><button disabled={!ops} className="h-7 w-7 rounded-md bg-white/10 hover:bg-white/20 grid place-items-center disabled:opacity-30" onClick={() => setGuests({ actualGuests: Math.max(0, actual - 10) })} aria-label="Decrease by 10"><Minus className="h-3.5 w-3.5" /></button><span className="num text-2xl flex-1 text-center">{actual}<span className="text-sm text-white/60"> / {g.expected}</span></span><button disabled={!ops} className="h-7 w-7 rounded-md bg-white/10 hover:bg-white/20 grid place-items-center disabled:opacity-30" onClick={() => setGuests({ actualGuests: actual + 10 })} aria-label="Increase by 10"><Plus className="h-3.5 w-3.5" /></button></div>
              <div className="flex items-center justify-between mt-1.5 text-[11px] text-white/60"><span>{g.confirmed} confirmed · {g.checkedIn} checked in</span><button className="inline-flex items-center gap-1 text-gold hover:underline" onClick={() => setGuests({ fromCheckIn: true })}><UserCheck className="h-3 w-3" />Use check-ins</button></div>
              {actual > g.expected && <p className="text-[11px] text-gold mt-1">+{actual - g.expected} over expected → extra catering charge added</p>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5 max-w-xl">
          {[['Timeline done', `${data.timeline.filter((t) => t.status === 'COMPLETED').length}/${data.timeline.length}`], ['Vendors arrived', `${summary.arrived}/${summary.vendors}${summary.delayed ? ` · ${summary.delayed} late` : ''}`], ['Open incidents', String(summary.openIncidents)]].map(([l, v]) => <div key={l} className="rounded-xl bg-white/10 px-4 py-2.5"><p className="num text-xl">{v}</p><p className="text-[11px] text-white/60">{l}</p></div>)}
        </div>
      </section>

      <div className="grid xl:grid-cols-[1.15fr_1fr] gap-5">
        <div className="space-y-5 min-w-0">
          <TimelinePanel weddingId={weddingId} items={data.timeline} onChanged={reload} />
          <Card title="Staff on duty">
            {!data.staff.length ? <p className="text-sm text-ink-soft">No staff assigned.</p> : <ul className="grid grid-cols-2 gap-3">{data.staff.map((s) => <li key={s.id} className="flex items-center gap-2.5"><Avatar name={s.name} size={32} /><span className="text-sm leading-tight min-w-0"><span className="block truncate">{s.name}</span><span className="block text-xs text-ink-soft">{humanize(s.role)} · {s.openTasks} tasks{s.openIncidents ? ` · ${s.openIncidents} incidents` : ''}</span></span></li>)}</ul>}
          </Card>
        </div>
        <div className="space-y-5 min-w-0">
          <IncidentsPanel weddingId={weddingId} incidents={data.incidents} onChanged={reload} />
          <ArrivalsPanel vendors={data.vendors} baseDate={data.currentEvent?.date ?? w.startDate} onChanged={reload} />
        </div>
      </div>
    </div>
  );
}
