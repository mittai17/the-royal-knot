'use client';
import { useState } from 'react';
import { AlertTriangle, Check, Clock, Play, Plus, Truck, UserCheck, Loader2 } from 'lucide-react';
import { Card, EmptyState, Field, Modal, StatusBadge } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { INCIDENT_STATUSES, SEVERITIES } from '@/lib/enums';
import { cn, fmtTime, humanize, toInputDate } from '@/lib/utils';
import { useUsers } from '@/hooks/use-users';
import type { Incident, TimelineItem } from '@/types';
import type { CommandVendor } from './types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';

const DOT: Record<string, string> = { COMPLETED: 'bg-success', IN_PROGRESS: 'bg-warning ring-4 ring-warning/20', DELAYED: 'bg-danger', CANCELLED: 'bg-line', SCHEDULED: 'bg-white border-2 border-line' };

export function TimelinePanel({ weddingId, items, onChanged }: { weddingId: string; items: TimelineItem[]; onChanged: () => void }) {
  const { can } = useAuth();
  const ops = can(...G.EVENT_OPS);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', time: '', responsible: '', team: '', notes: '' });
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (t: TimelineItem, status: string, extra: Record<string, unknown> = {}) => {
    setBusy(t.id);
    try { await api.patch(`/timeline/${t.id}`, { status, ...extra }); onChanged(); } catch (e) { notify.err(e); } finally { setBusy(null); }
  };
  const delay = (t: TimelineItem) => { const m = window.prompt('Delay in minutes?', '15'); if (m && Number(m) > 0) void act(t, 'DELAYED', { delayMinutes: Number(m) }); };
  const add = async () => {
    try {
      const day = toInputDate(items[0]?.scheduledAt) || toInputDate(new Date().toISOString());
      await api.post(`/weddings/${weddingId}/timeline`, { title: f.title, scheduledAt: new Date(`${day}T${f.time}`).toISOString(), responsible: f.responsible || undefined, team: f.team || undefined, notes: f.notes || undefined });
      notify.ok('Timeline item added'); setAdding(false); setF({ title: '', time: '', responsible: '', team: '', notes: '' }); onChanged();
    } catch (e) { notify.err(e); }
  };

  return (
    <Card title="Event timeline" action={<Can roles={G.EVENT_OPS}><button className="btn-secondary btn-sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add item</button></Can>}>
      {items.length === 0 ? <EmptyState title="No timeline yet" hint="Add the run-of-show for the day." /> : (
        <ol className="relative">
          {items.map((t, i) => (
            <li key={t.id} className="flex gap-4 pb-5 last:pb-0 relative">
              {i < items.length - 1 && <span className="absolute left-[101px] top-4 bottom-0 w-px bg-line" />}
              <div className="w-20 text-right shrink-0"><p className="text-sm tabular-nums font-medium">{fmtTime(t.scheduledAt)}</p>{t.actualAt && <p className="text-[11px] text-ink-soft">actual {fmtTime(t.actualAt)}</p>}</div>
              <span className={cn('h-3 w-3 rounded-full mt-1.5 shrink-0 z-10', DOT[t.status])} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className={cn('text-sm font-medium', t.status === 'CANCELLED' && 'line-through text-ink-soft')}>{t.title}</p><StatusBadge status={t.status} />{t.delayMinutes > 0 && <span className="text-xs text-danger font-medium">+{t.delayMinutes} min</span>}</div>
                <p className="text-xs text-ink-soft mt-0.5">{[t.responsible, t.team].filter(Boolean).join(' · ') || 'Unassigned'}{t.notes ? ` — ${t.notes}` : ''}</p>
                {ops && t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {t.status !== 'IN_PROGRESS' && <button disabled={busy === t.id} className="btn-secondary btn-sm" onClick={() => act(t, 'IN_PROGRESS', { actualAt: new Date().toISOString() })}><Play className="h-3 w-3" />Start</button>}
                    <button disabled={busy === t.id} className="btn-secondary btn-sm" onClick={() => act(t, 'COMPLETED', { actualAt: new Date().toISOString() })}><Check className="h-3 w-3" />Done</button>
                    <button disabled={busy === t.id} className="btn-ghost btn-sm" onClick={() => delay(t)}><Clock className="h-3 w-3" />Delay</button>
                    <button disabled={busy === t.id} className="btn-ghost btn-sm" onClick={() => act(t, 'CANCELLED')}>Cancel</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add timeline item" footer={<><button className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" disabled={!f.title || !f.time} onClick={add}>Add</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Title" className="col-span-2"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Scheduled time"><input className="input" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          <Field label="Responsible person"><input className="input" value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value })} /></Field>
          <Field label="Assigned team"><input className="input" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} /></Field>
          <Field label="Notes"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
      </Modal>
    </Card>
  );
}

export function ArrivalsPanel({ vendors, baseDate, onChanged }: { vendors: CommandVendor[]; baseDate: string; onChanged: () => void }) {
  const { can } = useAuth();
  const ops = can(...G.EVENT_OPS);
  const [busy, setBusy] = useState<string | null>(null);
  const [expected, setExpected] = useState<Record<string, string>>({});
  const post = async (v: CommandVendor, body: Record<string, unknown>) => {
    setBusy(v.id);
    try { await api.post(`/wedding-vendors/${v.id}/arrival`, body); onChanged(); } catch (e) { notify.err(e); } finally { setBusy(null); }
  };
  const track = (v: CommandVendor) => {
    const t = expected[v.id];
    if (!t) { notify.err(new Error('Pick the expected arrival time first')); return; }
    void post(v, { status: 'NOT_ARRIVED', expectedAt: new Date(`${toInputDate(baseDate)}T${t}`).toISOString() });
  };
  const delayed = (v: CommandVendor) => { const m = window.prompt('Expected delay (minutes)?', '30'); if (m && Number(m) > 0) void post(v, { status: 'DELAYED', delayMinutes: Number(m) }); };
  const stats = { arrived: vendors.filter((v) => v.arrival && ['ARRIVED', 'COMPLETED'].includes(v.arrival.status)).length, total: vendors.length };

  return (
    <Card title="Vendor arrivals" action={<span className="text-xs text-ink-soft">{stats.arrived}/{stats.total} arrived</span>}>
      {vendors.length === 0 ? <EmptyState title="No vendors assigned" hint="Select a winning quotation to assign vendors." /> : (
        <ul className="divide-y divide-line -mt-1 max-h-[560px] overflow-y-auto pr-1">
          {vendors.map((v) => {
            const a = v.arrival;
            return (
              <li key={v.id} className="py-3 flex flex-wrap items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-surface-2 grid place-items-center"><Truck className="h-4 w-4 text-burgundy" /></div>
                <div className="min-w-0 flex-1 basis-48"><p className="text-sm font-medium truncate">{v.vendor.name}</p>
                  <p className="text-xs text-ink-soft">{humanize(v.category)}{a ? ` · expected ${fmtTime(a.expectedAt)}${a.actualAt ? ` · arrived ${fmtTime(a.actualAt)}` : ''}` : ' · not tracked yet'} · {a?.contactName ?? v.vendor.contactName} {a?.contactPhone ?? v.vendor.phone}</p></div>
                {a ? (
                  <>
                    <div className="text-right space-y-1"><StatusBadge status={a.status} />{a.delayMinutes > 0 && <p className="text-[11px] text-danger font-medium">+{a.delayMinutes} min</p>}</div>
                    {ops && (a.status === 'NOT_ARRIVED' || a.status === 'DELAYED') && <div className="flex gap-1"><button disabled={busy === v.id} className="btn-secondary btn-sm" onClick={() => post(v, { status: 'ARRIVED' })}><UserCheck className="h-3 w-3" />Arrived</button>{a.status === 'NOT_ARRIVED' && <button disabled={busy === v.id} className="btn-ghost btn-sm" onClick={() => delayed(v)}>Delayed</button>}</div>}
                    {ops && a.status === 'ARRIVED' && <button disabled={busy === v.id} className="btn-ghost btn-sm" onClick={() => post(v, { status: 'COMPLETED' })}>Complete</button>}
                  </>
                ) : ops ? (
                  <div className="flex items-center gap-1.5"><input type="time" aria-label={`Expected arrival for ${v.vendor.name}`} className="input !h-8 !w-28 text-xs" value={expected[v.id] ?? ''} onChange={(e) => setExpected({ ...expected, [v.id]: e.target.value })} /><button disabled={busy === v.id} className="btn-secondary btn-sm" onClick={() => track(v)}>Track</button></div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function IncidentsPanel({ weddingId, incidents, onChanged }: { weddingId: string; incidents: Incident[]; onChanged: () => void }) {
  const { can } = useAuth();
  const ops = can(...G.EVENT_OPS);
  const { users } = useUsers();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: '', description: '', severity: 'MEDIUM', assignedToId: '' });
  const [res, setRes] = useState<Incident | null>(null);
  const [resolution, setResolution] = useState('');

  const create = async () => {
    setBusy(true);
    try { await api.post(`/weddings/${weddingId}/incidents`, { ...f, assignedToId: f.assignedToId || undefined }); notify.ok('Incident logged'); setOpen(false); setF({ title: '', description: '', severity: 'MEDIUM', assignedToId: '' }); onChanged(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  const update = async (i: Incident, body: Record<string, unknown>) => { try { await api.patch(`/incidents/${i.id}`, body); onChanged(); } catch (e) { notify.err(e); } };
  const resolve = async () => { if (!res) return; await update(res, { status: 'RESOLVED', resolution }); setRes(null); setResolution(''); };

  return (
    <Card title="Incidents" action={<Can roles={G.EVENT_OPS}><button className="btn-secondary btn-sm" onClick={() => setOpen(true)}><AlertTriangle className="h-4 w-4" />Log incident</button></Can>}>
      {incidents.length === 0 ? <EmptyState title="No incidents" hint="All clear. Log anything that needs attention." /> : (
        <ul className="space-y-3">
          {incidents.map((i) => (
            <li key={i.id} className={cn('rounded-xl border p-3.5', i.status === 'RESOLVED' ? 'border-line bg-surface-2/40' : i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'border-danger/40 bg-danger-soft/40' : 'border-line')}>
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium flex-1">{i.title}</p><StatusBadge status={i.severity} /><StatusBadge status={i.status} /></div>
              <p className="text-xs text-ink-soft mt-1">{i.description}</p>
              {i.resolution && <p className="text-xs mt-1.5 text-success">Resolution: {i.resolution}</p>}
              <div className="flex items-center gap-2 mt-2.5 text-xs text-ink-soft"><span>{fmtTime(i.createdAt)}</span><span>·</span><span>{i.assignedTo?.name ?? 'Unassigned'}</span>
                {ops && i.status !== 'RESOLVED' && <span className="ml-auto flex gap-1.5">{i.status === 'OPEN' && <button className="btn-secondary btn-sm" onClick={() => update(i, { status: 'IN_PROGRESS' })}>Take on</button>}<button className="btn-primary btn-sm" onClick={() => setRes(i)}>Resolve</button></span>}</div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Log incident" footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={busy || !f.title || !f.description} onClick={create}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Log incident</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Title" className="col-span-2"><input className="input" placeholder="DJ arrives late" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Description" className="col-span-2"><textarea className="input min-h-[72px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Severity"><Select value={f.severity} onChange={(v) => setF({ ...f, severity: v })} options={SEVERITIES} /></Field>
          <Field label="Assigned to"><Select value={f.assignedToId} onChange={(v) => setF({ ...f, assignedToId: v })} options={users.map((u) => ({ v: u.id, l: u.name }))} placeholder="Unassigned" /></Field>
        </div>
      </Modal>
      <Modal open={!!res} onClose={() => setRes(null)} title="Resolve incident" footer={<><button className="btn-secondary" onClick={() => setRes(null)}>Cancel</button><button className="btn-primary" disabled={!resolution.trim()} onClick={resolve}>Mark resolved</button></>}>
        <Field label={`How was “${res?.title}” resolved?`}><textarea className="input min-h-[96px]" value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
      </Modal>
    </Card>
  );
}

export { INCIDENT_STATUSES };
