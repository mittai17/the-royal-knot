'use client';
import { useCallback, useMemo, useState } from 'react';
import { addMonths, format, startOfMonth } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, MapPin, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Card, EmptyState, Field, Modal, ProgressBar, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Select, Segmented } from '@/components/shared/form-bits';
import { Can } from '@/components/shared/can';
import { TimelinePanel } from '@/components/command-centre/panels';
import type { CommandState } from '@/components/command-centre/types';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { EVENT_KINDS } from '@/lib/enums';
import { G } from '@/lib/permissions';
import { notify } from '@/lib/toast';
import { cn, fmtDate, fmtTime, humanize } from '@/lib/utils';
import { CalendarGrid, type CalItem } from './calendar-grid';
import { LiveWatch } from './live-watch';
import { Async, hhmm, toIso, ymd } from './shared';
import type { EventFunction } from './types';

const TONE: Record<EventFunction['status'], CalItem['tone']> = { UPCOMING: 'info', IN_PROGRESS: 'warning', COMPLETED: 'success', CANCELLED: 'neutral' };
const FN_STATUSES = ['UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
type View = 'list' | 'timeline' | 'calendar' | 'runsheet';

function FunctionForm({ weddingId, fn, onClose, onSaved }: { weddingId: string; fn: EventFunction | null; onClose: () => void; onSaved: () => void }) {
  const { data: bundle } = useApi<CommandState>(`/weddings/${weddingId}/event`);
  const [f, setF] = useState(() => ({
    kind: fn?.kind ?? 'MEHENDI', name: fn?.name ?? '', date: ymd(fn?.date), start: hhmm(fn?.date) || '10:00', end: hhmm(fn?.endAt), venue: fn?.venue ?? '', guests: String(fn?.expectedGuests ?? ''), notes: fn?.notes ?? '',
    status: fn?.statusOverride ?? '', vendorIds: fn?.vendors.map((v) => v.id) ?? [] as string[],
  }));
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const valid = f.date && f.start && (!f.end || f.end > f.start);
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        kind: f.kind, name: f.name || undefined, date: toIso(f.date, f.start), endAt: f.end ? toIso(f.date, f.end) : undefined, venue: f.venue || undefined,
        expectedGuests: f.guests === '' ? undefined : Number(f.guests), notes: f.notes, vendorIds: f.vendorIds, ...(f.status ? { status: f.status } : {}),
      };
      if (fn) await api.patch(`/events/functions/${fn.id}`, body); else await api.post('/events/functions', { ...body, weddingId });
      notify.ok(fn ? 'Function updated' : 'Function added'); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  const toggle = (id: string) => set('vendorIds', f.vendorIds.includes(id) ? f.vendorIds.filter((x) => x !== id) : [...f.vendorIds, id]);
  return (
    <Modal open onClose={onClose} title={fn ? `Edit ${fn.name}` : 'Add function'} width="max-w-2xl" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !valid} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{fn ? 'Save changes' : 'Add function'}</button></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Function type"><Select value={f.kind} onChange={(v) => set('kind', v)} options={EVENT_KINDS} /></Field>
        <Field label="Name (optional)"><input className="input" placeholder="Defaults to the type" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Start"><input className="input" type="time" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field><Field label="End" error={f.end && f.end <= f.start ? 'Must be after start' : undefined}><input className="input" type="time" value={f.end} onChange={(e) => set('end', e.target.value)} /></Field></div>
        <Field label="Venue"><input className="input" value={f.venue} onChange={(e) => set('venue', e.target.value)} /></Field>
        <Field label="Expected guests"><input className="input" type="number" min={0} value={f.guests} onChange={(e) => set('guests', e.target.value)} /></Field>
        {fn && <Field label="Status"><Select value={f.status} onChange={(v) => set('status', v)} options={FN_STATUSES} placeholder="Automatic (from date)" /></Field>}
        <Field label="Notes" className={fn ? '' : 'sm:col-span-2'}><input className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <p className="label">Vendors on this function</p>
          {!bundle ? <p className="text-sm text-ink-soft">Loading vendors…</p> : bundle.vendors.length === 0 ? <p className="text-sm text-ink-soft">No vendors are booked on this wedding yet.</p> : (
            <ul className="grid sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
              {bundle.vendors.map((v) => (
                <li key={v.id}><label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm cursor-pointer hover:bg-surface-2/50"><input type="checkbox" checked={f.vendorIds.includes(v.id)} onChange={() => toggle(v.id)} /><span className="truncate">{v.vendor.name}</span><span className="text-xs text-ink-soft ml-auto">{humanize(v.category)}</span></label></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function FunctionCard({ fn, onEdit, onDelete }: { fn: EventFunction; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="rounded-xl border border-line p-4 bg-white">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="h-12 w-12 rounded-xl bg-gold-soft text-burgundy grid place-items-center shrink-0 text-center leading-tight"><span><span className="block text-[10px] uppercase">{format(new Date(fn.date), 'MMM')}</span><span className="block text-base font-semibold">{format(new Date(fn.date), 'd')}</span></span></div>
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{fn.name}</h3><StatusBadge status={fn.status} /></div>
          <p className="text-xs text-ink-soft mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{fmtTime(fn.date)}{fn.endAt ? ` – ${fmtTime(fn.endAt)}` : ''}</span>
            {fn.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{fn.venue}</span>}
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{fn.expectedGuests} guests</span>
          </p>
          {fn.notes && <p className="text-xs mt-1.5">{fn.notes}</p>}
          <div className="flex flex-wrap gap-1.5 mt-2">{fn.vendors.length ? fn.vendors.map((v) => <span key={v.id} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs">{v.vendor.name}</span>) : <span className="text-xs text-ink-soft">No vendors assigned</span>}</div>
          {fn.timeline.total > 0 && <div className="mt-3 max-w-xs"><div className="flex justify-between text-[11px] text-ink-soft mb-1"><span>Run sheet</span><span>{fn.timeline.done}/{fn.timeline.total}</span></div><ProgressBar value={(fn.timeline.done / fn.timeline.total) * 100} /></div>}
        </div>
        <Can roles={G.PLANNING}><div className="flex gap-1"><button className="btn-ghost btn-sm !px-2" aria-label={`Edit ${fn.name}`} onClick={onEdit}><Pencil className="h-4 w-4" /></button><button className="btn-ghost btn-sm !px-2 text-danger" aria-label={`Delete ${fn.name}`} onClick={onDelete}><Trash2 className="h-4 w-4" /></button></div></Can>
      </div>
    </li>
  );
}

export function FunctionsPanel({ weddingId }: { weddingId: string }) {
  const { data, loading, error, reload } = useApi<EventFunction[]>('/events/functions', { weddingId });
  const bundle = useApi<CommandState>(`/weddings/${weddingId}/event`);
  const [view, setView] = useState<View>('list');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState<EventFunction | 'new' | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [pick, setPick] = useState<Date | null>(null);
  const refresh = useCallback(() => { void reload(); void bundle.reload(); }, [reload, bundle]);

  const fns = useMemo(() => (data ?? []).filter((f) => !status || f.status === status), [data, status]);
  const remove = async (f: EventFunction) => {
    if (!window.confirm(`Delete "${f.name}"? Run-sheet items stay but lose their link to this function.`)) return;
    try { await api.del(`/events/functions/${f.id}`); notify.ok('Function removed'); refresh(); } catch (e) { notify.err(e); }
  };
  const counts = (s: string) => (data ?? []).filter((f) => f.status === s).length;
  const calItems: CalItem[] = fns.map((f) => ({ id: f.id, at: new Date(f.date), label: `${fmtTime(f.date)} ${f.name}`, tone: TONE[f.status] }));
  const dayItems = pick ? fns.filter((f) => new Date(f.date).toDateString() === pick.toDateString()) : [];
  const byDay = useMemo(() => { const m = new Map<string, EventFunction[]>(); fns.forEach((f) => { const k = ymd(f.date); m.set(k, [...(m.get(k) ?? []), f]); }); return [...m.entries()]; }, [fns]);

  return (
    <div className="space-y-5">
      <LiveWatch weddingId={weddingId} events={['function.updated', 'timeline.updated']} onChange={refresh} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Functions" value={data?.length ?? '—'} icon={<CalendarDays className="h-5 w-5" />} />
        <StatCard label="Upcoming" value={data ? counts('UPCOMING') : '—'} />
        <StatCard label="In progress" value={data ? counts('IN_PROGRESS') : '—'} />
        <StatCard label="Completed" value={data ? counts('COMPLETED') : '—'} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<View> value={view} onChange={setView} options={[{ v: 'list', l: 'Functions' }, { v: 'timeline', l: 'Timeline' }, { v: 'calendar', l: 'Calendar' }, { v: 'runsheet', l: 'Run sheet' }]} />
        <div className="flex items-center gap-2">
          {view !== 'runsheet' && <Select className="!w-40" value={status} onChange={setStatus} options={FN_STATUSES} placeholder="All statuses" />}
          <Can roles={G.PLANNING}><button className="btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Add function</button></Can>
        </div>
      </div>

      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {view === 'list' && (fns.length === 0
          ? <Card><EmptyState title={status ? 'No functions with this status' : 'No functions yet'} hint="Add Mehendi, Sangeet, Ceremony and the other events of this wedding." /></Card>
          : <ul className="space-y-3">{fns.map((f) => <FunctionCard key={f.id} fn={f} onEdit={() => setEdit(f)} onDelete={() => remove(f)} />)}</ul>)}

        {view === 'timeline' && (byDay.length === 0
          ? <Card><EmptyState title="Nothing scheduled" hint="Functions appear here day by day." /></Card>
          : <Card><ol className="space-y-6">{byDay.map(([day, list]) => (
            <li key={day}>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-soft mb-2">{fmtDate(day, 'EEEE, dd MMMM yyyy')}</p>
              <ul className="border-l-2 border-line ml-1.5 space-y-3">{list.map((f) => (
                <li key={f.id} className="relative pl-5"><span className={cn('absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white', f.status === 'COMPLETED' ? 'bg-success' : f.status === 'IN_PROGRESS' ? 'bg-warning' : f.status === 'CANCELLED' ? 'bg-line' : 'bg-info')} />
                  <p className="text-sm font-medium">{fmtTime(f.date)}{f.endAt ? ` – ${fmtTime(f.endAt)}` : ''} · {f.name} <StatusBadge status={f.status} /></p>
                  <p className="text-xs text-ink-soft">{[f.venue, `${f.expectedGuests} guests`, f.vendors.length ? `${f.vendors.length} vendors` : null].filter(Boolean).join(' · ')}</p></li>
              ))}</ul>
            </li>))}</ol></Card>)}

        {view === 'calendar' && (
          <div className="grid xl:grid-cols-[1fr_300px] gap-5">
            <Card pad={false} title={format(month, 'MMMM yyyy')} action={<div className="flex gap-1 pr-4"><button className="btn-ghost btn-sm !px-2" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></button><button className="btn-secondary btn-sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</button><button className="btn-ghost btn-sm !px-2" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></button></div>}>
              <CalendarGrid month={month} items={calItems} selected={pick} onSelect={setPick} />
            </Card>
            <Card title={pick ? fmtDate(pick, 'EEE, dd MMM') : 'Select a day'}>
              {!pick ? <p className="text-sm text-ink-soft">Pick a day to see its functions.</p> : dayItems.length === 0 ? <p className="text-sm text-ink-soft">No functions on this day.</p> : <ul className="space-y-3">{dayItems.map((f) => <li key={f.id}><p className="text-sm font-medium">{f.name}</p><p className="text-xs text-ink-soft">{fmtTime(f.date)} · {f.venue ?? f.wedding.location}</p></li>)}</ul>}
            </Card>
          </div>
        )}

        {view === 'runsheet' && (
          <Async loading={bundle.loading} error={bundle.error} onRetry={bundle.reload} hasData={!!bundle.data}>
            {bundle.data && <TimelinePanel weddingId={weddingId} items={bundle.data.timeline} onChanged={refresh} />}
          </Async>
        )}
      </Async>

      {edit && <FunctionForm weddingId={weddingId} fn={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={refresh} />}
    </div>
  );
}
