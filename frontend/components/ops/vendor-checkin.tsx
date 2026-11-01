'use client';
import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Bell, Check, Clock, LogOut, Phone, UserCheck } from 'lucide-react';
import { Card, Field, Modal, StatCard, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Segmented, Select } from '@/components/shared/form-bits';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { G } from '@/lib/permissions';
import { notify } from '@/lib/toast';
import { fmtTime, humanize } from '@/lib/utils';
import { LiveWatch } from './live-watch';
import { Async, localDate, toIso, tzOffset } from './shared';
import type { ArrivalCounts, ArrivalRow } from './types';

type Tab = 'all' | 'arrived' | 'pending' | 'delayed' | 'completed';
interface Data { date: string; weddings: { id: string; name: string }[]; counts: ArrivalCounts; rows: ArrivalRow[] }

export function VendorCheckin() {
  const { can } = useAuth();
  const ops = can(...G.EVENT_OPS);
  const tz = useMemo(tzOffset, []);
  const [tab, setTab] = useState<Tab>('all');
  const [wedding, setWedding] = useState('');
  const [date, setDate] = useState(localDate());
  const { data, loading, error, reload } = useApi<Data>('/events/arrivals', { tz, date, weddingId: wedding || undefined });
  const [busy, setBusy] = useState<string | null>(null);
  const [delay, setDelay] = useState<ArrivalRow | null>(null);
  const [track, setTrack] = useState<ArrivalRow | null>(null);
  const [mins, setMins] = useState('30');
  const [time, setTime] = useState('');
  const refresh = useCallback(() => { void reload(); }, [reload]);

  const post = async (r: ArrivalRow, body: Record<string, unknown>, ok: string) => {
    setBusy(r.id);
    try { await api.post(`/wedding-vendors/${r.id}/arrival`, body); notify.ok(ok); refresh(); } catch (e) { notify.err(e); } finally { setBusy(null); }
  };
  const notifyVendor = async (r: ArrivalRow) => {
    setBusy(r.id);
    try {
      const res = await api.post<{ notified: number; phone: string }>(`/events/arrivals/${r.id}/notify`, {});
      if (res.data.notified) notify.ok(`Reminder sent to ${r.vendor.name}`); else notify.err(new Error(`${r.vendor.name} has no portal login. Call ${res.data.phone} instead.`));
    } catch (e) { notify.err(e); } finally { setBusy(null); }
  };

  const rows = (data?.rows ?? []).filter((r) => tab === 'all' || r.bucket === tab);
  const c = data?.counts;
  const cols: ColumnDef<ArrivalRow, unknown>[] = [
    { id: 'vendor', header: 'Vendor', cell: ({ row: { original: r } }) => <div className="min-w-0"><p className="font-medium truncate">{r.vendor.name}</p><p className="text-xs text-ink-soft">{humanize(r.category)} · {r.wedding.name}</p></div> },
    { id: 'expected', header: 'Expected', cell: ({ row: { original: r } }) => r.arrival ? <span className="tabular-nums">{fmtTime(r.arrival.expectedAt)}</span> : <span className="text-ink-soft text-xs">Not tracked</span> },
    { id: 'actual', header: 'Arrived', cell: ({ row: { original: r } }) => r.arrival?.actualAt ? <span className="tabular-nums">{fmtTime(r.arrival.actualAt)}</span> : '—' },
    { id: 'status', header: 'Status', cell: ({ row: { original: r } }) => <div className="space-y-0.5"><StatusBadge status={r.arrival?.status ?? 'EXPECTED'} />{(r.arrival?.delayMinutes ?? 0) > 0 && <p className="text-[11px] text-danger font-medium">+{r.arrival!.delayMinutes} min</p>}{r.overdueMinutes > 0 && <p className="text-[11px] text-warning font-medium">{r.overdueMinutes} min overdue</p>}</div> },
    { id: 'contact', header: 'Contact', cell: ({ row: { original: r } }) => { const phone = r.arrival?.contactPhone ?? r.vendor.phone; return <div className="text-xs"><p>{r.arrival?.contactName ?? r.vendor.contactName}</p><a href={`tel:${phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-burgundy hover:underline"><Phone className="h-3 w-3" />{phone}</a></div>; } },
    ...(ops ? [{ id: 'act', header: '', enableSorting: false, cell: ({ row: { original: r } }) => {
      const s = r.arrival?.status; const b = busy === r.id;
      return (
        <div className="flex flex-wrap justify-end gap-1">
          {!r.arrival && <button disabled={b} className="btn-secondary btn-sm" onClick={() => { setTrack(r); setTime(''); }}>Track</button>}
          {(!s || s === 'EXPECTED' || s === 'DELAYED') && r.arrival && <button disabled={b} className="btn-secondary btn-sm" onClick={() => post(r, { status: 'ARRIVED' }, `${r.vendor.name} marked arrived`)}><UserCheck className="h-3 w-3" />Arrived</button>}
          {s === 'EXPECTED' && <button disabled={b} className="btn-ghost btn-sm" onClick={() => { setDelay(r); setMins('30'); }}><Clock className="h-3 w-3" />Delayed</button>}
          {s === 'ARRIVED' && <button disabled={b} className="btn-secondary btn-sm" onClick={() => post(r, { status: 'COMPLETED' }, `${r.vendor.name} checked out`)}><LogOut className="h-3 w-3" />Check out</button>}
          {(s === 'ARRIVED' || s === 'COMPLETED') && <button disabled={b} className="btn-ghost btn-sm" onClick={() => post(r, { status: 'EXPECTED' }, 'Arrival reset')}>Undo</button>}
          {s !== 'ARRIVED' && s !== 'COMPLETED' && <button disabled={b} className="btn-ghost btn-sm !px-2" aria-label={`Remind ${r.vendor.name}`} title="Send reminder" onClick={() => notifyVendor(r)}><Bell className="h-3.5 w-3.5" /></button>}
        </div>
      );
    } } as ColumnDef<ArrivalRow, unknown>] : []),
  ];

  return (
    <div className="space-y-5">
      {data?.weddings.map((w) => <LiveWatch key={w.id} weddingId={w.id} events={['vendor.arrival']} onChange={refresh} />)}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Expected" value={c?.total ?? '—'} icon={<UserCheck className="h-5 w-5" />} hint={c?.untracked ? `${c.untracked} without a time` : undefined} />
        <StatCard label="Arrived" value={c ? c.arrived + c.completed : '—'} icon={<Check className="h-5 w-5" />} />
        <StatCard label="Pending" value={c?.pending ?? '—'} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Delayed" value={c?.delayed ?? '—'} icon={<Clock className="h-5 w-5" />} />
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <Segmented<Tab> value={tab} onChange={setTab} options={[{ v: 'all', l: `Expected${c ? ` (${c.total})` : ''}` }, { v: 'arrived', l: `Arrived${c ? ` (${c.arrived})` : ''}` }, { v: 'pending', l: `Pending${c ? ` (${c.pending})` : ''}` }, { v: 'delayed', l: `Delayed${c ? ` (${c.delayed})` : ''}` }, { v: 'completed', l: `Checked out${c ? ` (${c.completed})` : ''}` }]} />
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className="input !w-40" aria-label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <Select className="!w-48" value={wedding} onChange={setWedding} options={(data?.weddings ?? []).map((w) => ({ v: w.id, l: w.name }))} placeholder="All weddings" />
          </div>
        </div>
        <DataTable columns={cols} data={rows} loading={loading && !data} error={error && !data ? error : null} onRetry={reload} emptyTitle={tab === 'all' ? 'No vendors expected' : 'Nothing in this tab'} emptyHint={tab === 'all' ? 'No weddings with booked vendors are running on this date.' : 'Vendors move here as their status changes.'} />
      </Card>

      <Modal open={!!delay} onClose={() => setDelay(null)} title="Mark vendor delayed" footer={<><button className="btn-secondary" onClick={() => setDelay(null)}>Cancel</button><button className="btn-primary" disabled={!(Number(mins) > 0)} onClick={async () => { if (delay) await post(delay, { status: 'DELAYED', delayMinutes: Number(mins) }, `${delay.vendor.name} marked delayed`); setDelay(null); }}>Mark delayed</button></>}>
        <Field label={`How many minutes late is ${delay?.vendor.name}?`}><input className="input" type="number" min={1} value={mins} onChange={(e) => setMins(e.target.value)} /></Field>
      </Modal>
      <Modal open={!!track} onClose={() => setTrack(null)} title="Track arrival" footer={<><button className="btn-secondary" onClick={() => setTrack(null)}>Cancel</button><button className="btn-primary" disabled={!time} onClick={async () => { if (track) await post(track, { status: 'NOT_ARRIVED', expectedAt: toIso(date, time) }, 'Tracking started'); setTrack(null); }}>Start tracking</button></>}>
        <Field label={`Expected arrival time for ${track?.vendor.name}`}><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
