'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, MapPin, Plus, Users, Loader2 } from 'lucide-react';
import { Card, EmptyState, ErrorState, Field, Modal, ProgressBar, Skeleton, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { useApi, asRows } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { EVENT_KINDS } from '@/lib/enums';
import { ago, fmtDate, humanize, inr, toInputDate, toNum } from '@/lib/utils';
import type { ActivityRow, Money, Wedding, WeddingEvent } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';

export function OverviewTab({ w }: { w: Wedding }) {
  const { can } = useAuth();
  const canSeeMoney = can(...G.FINANCE_READ);
  const pay = useApi<{ totals?: { received: string; outstanding: string } }>(canSeeMoney ? `/weddings/${w.id}/payments` : null);
  const tasks = useApi<unknown>(`/weddings/${w.id}/tasks`, { pageSize: 500 });
  const t = asRows<{ status: string; dueDate: string }>(tasks.data);
  const done = t.filter((x) => x.status === 'DONE').length;
  const overdue = t.filter((x) => x.status !== 'DONE' && new Date(x.dueDate) < new Date()).length;
  const days = Math.ceil((new Date(w.startDate).getTime() - Date.now()) / 86400000);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Contract value" value={inr(w.contractValue)} hint={`Budget ${inr(w.budget)}`} />
        {canSeeMoney && <StatCard label="Received" value={inr(pay.data?.totals?.received ?? 0)} hint={`Outstanding ${inr(pay.data?.totals?.outstanding ?? 0)}`} />}
        <StatCard label="Planning progress" value={`${t.length ? Math.round((done / t.length) * 100) : 0}%`} hint={`${done}/${t.length} tasks${overdue ? ` · ${overdue} overdue` : ''}`} />
        <StatCard label={days >= 0 ? 'Days to wedding' : 'Days since wedding'} value={Math.abs(days)} hint={fmtDate(w.startDate)} />
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Details"><dl className="grid grid-cols-2 gap-y-3 text-sm">
          {[['Package', humanize(w.packageType)], ['Status', humanize(w.status)], ['Venue', w.venue ?? '—'], ['Location', w.location], ['Dates', `${fmtDate(w.startDate, 'dd MMM')} – ${fmtDate(w.endDate)} (${w.eventDays} days)`], ['Planner', w.planner?.name ?? '—'], ['Expected guests', String(w.expectedGuests)], ['Actual guests', w.actualGuests != null ? String(w.actualGuests) : '—'], ['Theme', w.theme ?? '—']].map(([k, v]) => <div key={k}><dt className="text-xs text-ink-soft">{k}</dt><dd>{v}</dd></div>)}
        </dl></Card>
        <Card title="Planning progress"><ProgressBar value={t.length ? (done / t.length) * 100 : 0} /><p className="text-sm text-ink-soft mt-3">{t.length === 0 ? 'Tasks generate once the booking payment is recorded.' : `${t.length - done} tasks remaining.`}</p></Card>
      </div>
    </div>
  );
}

export function CoupleTab({ w }: { w: Wedding }) {
  const c = w.couple;
  return (
    <Card title="Couple"><dl className="grid sm:grid-cols-2 gap-4 text-sm">
      <div><dt className="text-xs text-ink-soft">Bride</dt><dd className="font-serif text-lg">{c?.brideName ?? '—'}</dd></div><div><dt className="text-xs text-ink-soft">Groom</dt><dd className="font-serif text-lg">{c?.groomName ?? '—'}</dd></div>
      <div><dt className="text-xs text-ink-soft">Phone</dt><dd>{c?.phone ?? '—'}</dd></div><div><dt className="text-xs text-ink-soft">Email</dt><dd>{c?.email ?? '—'}</dd></div>
      <div className="sm:col-span-2"><dt className="text-xs text-ink-soft">Address</dt><dd>{c?.address ?? '—'}</dd></div>
    </dl></Card>
  );
}

function EventForm({ weddingId, open, onClose, onSaved, defaultDate, defaultGuests }: { weddingId: string; open: boolean; onClose: () => void; onSaved: () => void; defaultDate: string; defaultGuests: number }) {
  const [f, setF] = useState({ kind: 'MEHENDI', name: '', date: toInputDate(defaultDate), venue: '', expectedGuests: String(defaultGuests) });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post(`/weddings/${weddingId}/events`, { ...f, name: f.name || humanize(f.kind), expectedGuests: Number(f.expectedGuests), venue: f.venue || undefined }); notify.ok('Event added'); onSaved(); onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add event" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add event</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type"><Select value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={EVENT_KINDS} /></Field><Field label="Name"><input className="input" value={f.name} placeholder={humanize(f.kind)} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field><Field label="Expected guests"><input className="input" type="number" value={f.expectedGuests} onChange={(e) => setF({ ...f, expectedGuests: e.target.value })} /></Field>
        <Field label="Venue" className="col-span-2"><input className="input" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function EventsTab({ w, onChanged }: { w: Wedding; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const events: WeddingEvent[] = w.events ?? [];
  return (
    <Card title="Events" action={<div className="flex gap-2"><Link href="/command-centre" className="btn-secondary btn-sm">Open Command Centre</Link><Can roles={G.PLANNING}><button className="btn-primary btn-sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add event</button></Can></div>}>
      {events.length === 0 ? <EmptyState title="No events yet" hint="Mehendi, Sangeet, Ceremony, Reception…" /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">{events.map((e) => (
          <div key={e.id} className="rounded-xl border border-line p-4"><StatusBadge status={e.kind} tone="gold" /><p className="font-serif text-lg mt-2">{e.name}</p><p className="text-xs text-ink-soft mt-2 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(e.date, 'EEE, dd MMM yyyy')}</p><p className="text-xs text-ink-soft mt-1 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{e.venue ?? w.venue ?? w.location}</p><p className="text-xs text-ink-soft mt-1 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{e.expectedGuests} guests</p></div>
        ))}</div>
      )}
      <EventForm weddingId={w.id} open={adding} onClose={() => setAdding(false)} onSaved={onChanged} defaultDate={w.startDate} defaultGuests={w.expectedGuests} />
    </Card>
  );
}

interface WV { id: string; category: string; contractAmount: Money; negotiatedAmount?: Money | null; vendor: { id: string; name: string; phone: string }; paid: Money; arrival?: { status: string } | null }
export function VendorsTab({ weddingId }: { weddingId: string }) {
  const r = useApi<unknown>(`/weddings/${weddingId}/vendors`);
  const rows = asRows<WV>(r.data);
  if (r.error) return <Card><ErrorState message={r.error} onRetry={r.reload} /></Card>;
  if (r.loading) return <Skeleton className="h-48 rounded-xl" />;
  const total = rows.reduce((a, v) => a + toNum(v.negotiatedAmount ?? v.contractAmount), 0);
  return (
    <Card title={`Assigned vendors (${rows.length})`} action={<span className="text-sm text-ink-soft">Committed <span className="num text-ink">{inr(total)}</span></span>} pad={false}>
      {rows.length === 0 ? <EmptyState title="No vendors assigned" hint="Selecting a winning quotation assigns the vendor automatically." /> : <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Vendor</th><th className="th">Category</th><th className="th text-right">Contract</th><th className="th text-right">Advance paid</th><th className="th">Arrival</th></tr></thead><tbody>
        {rows.map((v) => <tr key={v.id}><td className="td"><p className="font-medium">{v.vendor.name}</p><p className="text-xs text-ink-soft">{v.vendor.phone}</p></td><td className="td">{humanize(v.category)}</td><td className="td text-right num">{inr(v.negotiatedAmount ?? v.contractAmount)}</td><td className="td text-right tabular-nums">{inr(v.paid)}</td><td className="td">{v.arrival ? <StatusBadge status={v.arrival.status} /> : '—'}</td></tr>)}
      </tbody></table></div>}
    </Card>
  );
}

export function ActivityTab({ weddingId }: { weddingId: string }) {
  const r = useApi<unknown>(`/weddings/${weddingId}/activity`, { pageSize: 50 });
  const rows = asRows<ActivityRow>(r.data);
  if (r.error) return <Card><ErrorState message={r.error} onRetry={r.reload} /></Card>;
  return (
    <Card title="Activity">
      {r.loading ? <Skeleton className="h-40" /> : rows.length === 0 ? <EmptyState title="No activity yet" /> : <ol className="space-y-4 border-l border-line ml-1.5">{rows.map((a) => <li key={a.id} className="pl-4 relative"><span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" /><p className="text-sm">{a.message ?? `${humanize(a.entity)} ${a.action.toLowerCase()}`}</p><p className="text-xs text-ink-soft">{a.actor?.name ?? 'System'} · {ago(a.createdAt)}</p></li>)}</ol>}
    </Card>
  );
}
