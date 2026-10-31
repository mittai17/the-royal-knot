'use client';
import { useState } from 'react';
import { BadgeCheck, CheckCircle2, Clock, Plus, XCircle } from 'lucide-react';
import { Card, Field, Modal, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Segmented, Select } from '@/components/shared/form-bits';
import { Can } from '@/components/shared/can';
import { BusyButton, Muted, Pager, SimpleTable, usePaged, D } from '@/components/finance/fin-bits';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useWedding } from '@/lib/wedding-context';
import { notify } from '@/lib/toast';
import { fmtDateTime, humanize, inr } from '@/lib/utils';
import type { Money } from '@/types';

type Tab = 'pending' | 'approved' | 'rejected' | 'history';
const TYPES = [{ v: 'VENDOR_CONTRACT', l: 'Vendor contract' }, { v: 'EXTRA_EXPENSE', l: 'Extra expense' }, { v: 'CLIENT_DISCOUNT', l: 'Client discount' }, { v: 'VENDOR_PAYMENT', l: 'Vendor payment' }, { v: 'OTHER', l: 'Other (e.g. budget increase)' }];
const typeLabel = (t: string) => TYPES.find((x) => x.v === t)?.l.replace(/ \(.*\)/, '') ?? humanize(t);

interface Person { id: string; name: string; role: string }
interface Approval { id: string; type: string; status: string; title: string; description?: string | null; amount?: Money | null; weddingId?: string | null; wedding?: { id: string; name: string } | null; entity?: string | null; requestedBy?: Person | null; decidedBy?: Person | null; decisionNote?: string | null; decidedAt?: string | null; createdAt: string }
interface Detail extends Approval { history: { id: string; action: string; message?: string | null; createdAt: string; actor?: { name: string } | null }[] }
interface Counts { pending: number; inReview: number; approved: number; rejected: number; pendingAmount: number }

function NewRequest({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { weddings } = useWedding();
  const [f, setF] = useState({ type: 'EXTRA_EXPENSE', title: '', description: '', amount: '', weddingId: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/approvals', { type: f.type, title: f.title, description: f.description || undefined, amount: f.amount ? Number(f.amount) : undefined, weddingId: f.weddingId || undefined });
      notify.ok('Approval requested'); setF({ ...f, title: '', description: '', amount: '' }); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Request approval" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><BusyButton busy={busy} disabled={f.title.trim().length < 3} onClick={save}>Submit request</BusyButton></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type" className="col-span-2"><Select value={f.type} onChange={(v) => setF({ ...f, type: v })} options={TYPES} /></Field>
        <Field label="Title" className="col-span-2"><input className="input" value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Extra lighting rig for Sangeet" /></Field>
        <Field label="Amount (₹)"><input className="input" type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Wedding"><Select value={f.weddingId} onChange={(v) => setF({ ...f, weddingId: v })} placeholder="None" options={weddings.map((w) => ({ v: w.id, l: w.name }))} /></Field>
        <Field label="Details" className="col-span-2"><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function DetailDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const d = useApi<Detail>(id ? `/approvals/${id}` : null);
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const a = d.data;
  const open = a && (a.status === 'PENDING' || a.status === 'IN_REVIEW');
  const act = async (kind: 'review' | 'approve' | 'reject' | 'cancel') => {
    if (kind === 'reject' && note.trim().length < 3) { notify.err(new Error('Add a reason before rejecting')); return; }
    setBusy(kind);
    try { await api.post(`/approvals/${id}/${kind}`, kind === 'cancel' ? {} : { note: note.trim() || undefined }); notify.ok({ review: 'Marked in review', approve: 'Approved', reject: 'Rejected', cancel: 'Request cancelled' }[kind]); setNote(''); d.reload(); onChanged(); }
    catch (e) { notify.err(e); } finally { setBusy(''); }
  };
  return (
    <Modal open={!!id} onClose={onClose} side width="max-w-md" title="Approval request">
      {d.loading || !a ? <p className="text-sm text-ink-soft">{d.error ?? 'Loading…'}</p> : (
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 flex-wrap"><StatusBadge status={a.status} /><span className="text-xs text-ink-soft">{typeLabel(a.type)}</span></div>
            <h3 className="font-serif text-xl text-burgundy-deep mt-2">{a.title}</h3>
            {a.amount != null && <p className="num text-2xl mt-1">{inr(a.amount)}</p>}
            {a.description && <p className="text-sm mt-2 text-ink-soft whitespace-pre-wrap">{a.description}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-ink-soft">Wedding</dt><dd>{a.wedding?.name ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-soft">Requested by</dt><dd>{a.requestedBy?.name ?? 'System'}</dd></div>
            <div><dt className="text-xs text-ink-soft">Requested</dt><dd>{fmtDateTime(a.createdAt)}</dd></div>
            <div><dt className="text-xs text-ink-soft">{a.decidedBy ? 'Decided by' : 'Decision'}</dt><dd>{a.decidedBy ? `${a.decidedBy.name} · ${fmtDateTime(a.decidedAt)}` : 'Waiting'}</dd></div>
          </dl>
          {a.decisionNote && <div className="rounded-xl bg-surface-2 p-3 text-sm"><p className="text-xs text-ink-soft mb-1">Comment</p>{a.decisionNote}</div>}
          {open && (
            <Can roles={['FINANCE']}>
              <div className="space-y-3">
                <Field label="Comment"><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required to reject; optional otherwise" /></Field>
                <div className="flex flex-wrap gap-2">
                  {a.status === 'PENDING' && <BusyButton className="btn-secondary" busy={busy === 'review'} onClick={() => act('review')}>Mark in review</BusyButton>}
                  <Can roles={[]}>
                    <BusyButton busy={busy === 'approve'} onClick={() => act('approve')}><CheckCircle2 className="h-4 w-4" />Approve</BusyButton>
                    <BusyButton className="btn-danger" busy={busy === 'reject'} onClick={() => act('reject')}><XCircle className="h-4 w-4" />Reject</BusyButton>
                  </Can>
                </div>
                {user?.role !== 'ADMIN' && <p className="text-xs text-ink-soft">Only the Founder can approve or reject. You can add review comments.</p>}
              </div>
            </Can>
          )}
          {open && <Can roles={['PLANNER']}><div className="flex"><BusyButton className="btn-secondary btn-sm" busy={busy === 'cancel'} onClick={() => act('cancel')}>Cancel request</BusyButton></div></Can>}
          <div>
            <p className="label">Activity</p>
            <ul className="space-y-2 text-sm border-l border-line pl-4">
              {a.history.map((h) => <li key={h.id}><span className="block">{h.message ?? humanize(h.action)}</span><Muted>{h.actor?.name ?? 'System'} · {fmtDateTime(h.createdAt)}</Muted></li>)}
              {!a.history.length && <li className="text-ink-soft">No activity recorded.</li>}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function ApprovalsCentre() {
  const [tab, setTab] = useState<Tab>('pending');
  const [type, setType] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const p = usePaged<Approval, { counts?: Counts }>('/approvals', { tab, type: type || undefined }, 15);
  const counts = useApi<Counts>('/approvals/counts');
  const c = p.meta.counts ?? counts.data;
  const { can } = useAuth();
  const refresh = () => { p.reload(); counts.reload(); };
  const label = (t: Tab, n?: number) => `${{ pending: 'Pending', approved: 'Approved', rejected: 'Rejected', history: 'History' }[t]}${n != null ? ` (${n})` : ''}`;
  const quick = async (id: string, kind: 'approve' | 'reject') => {
    if (kind === 'reject') { setOpenId(id); return; }
    try { await api.post(`/approvals/${id}/approve`, {}); notify.ok('Approved'); refresh(); } catch (e) { notify.err(e); }
  };

  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard label="Pending" value={c?.pending ?? '—'} hint={c ? `${c.inReview} in review` : undefined} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Awaiting amount" value={inr(c?.pendingAmount ?? 0)} hint="across open requests" icon={<BadgeCheck className="h-5 w-5" />} />
        <StatCard label="Approved" value={c?.approved ?? '—'} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Rejected" value={c?.rejected ?? '—'} icon={<XCircle className="h-5 w-5" />} />
      </div>
      <Card pad={false} title={<Segmented value={tab} onChange={(t) => { setTab(t); p.setPage(1); }} options={(['pending', 'approved', 'rejected', 'history'] as Tab[]).map((t) => ({ v: t, l: label(t, t === 'pending' ? c?.pending : t === 'approved' ? c?.approved : t === 'rejected' ? c?.rejected : undefined) }))} />}
        action={<div className="flex gap-2 flex-wrap justify-end">
          <Select className="!w-44" value={type} onChange={(v) => { setType(v); p.setPage(1); }} placeholder="All types" options={TYPES.map((t) => ({ v: t.v, l: t.l.replace(/ \(.*\)/, '') }))} />
          <input className="input !w-48" type="search" placeholder="Search…" value={p.search} onChange={(e) => p.setSearch(e.target.value)} aria-label="Search approvals" />
          <Can roles={['PLANNER', 'FINANCE', 'EVENT_MANAGER']}><button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New request</button></Can>
        </div>}>
        <div className="pt-1">
          <SimpleTable head={['Request', 'Type', 'Amount', 'Requested by', 'Requested', 'Status', '']} loading={p.loading && !p.rows.length} error={p.error} onRetry={p.reload} empty={!p.rows.length}>
            {p.rows.map((a) => (
              <tr key={a.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setOpenId(a.id)}>
                <td className="td max-w-[320px]"><span className="font-medium">{a.title}</span>{a.wedding && <Muted>{a.wedding.name}</Muted>}</td>
                <td className="td whitespace-nowrap">{typeLabel(a.type)}</td>
                <td className="td tabular-nums">{a.amount != null ? inr(a.amount) : '—'}</td>
                <td className="td">{a.requestedBy?.name ?? 'System'}</td>
                <td className="td"><D v={a.createdAt} /></td>
                <td className="td"><StatusBadge status={a.status} />{a.decidedBy && <Muted>{a.decidedBy.name}</Muted>}</td>
                <td className="td text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {(a.status === 'PENDING' || a.status === 'IN_REVIEW') && can() && (
                    <span className="inline-flex gap-1.5">
                      <button className="btn-secondary btn-sm" onClick={() => quick(a.id, 'reject')}>Reject</button>
                      <button className="btn-primary btn-sm" onClick={() => quick(a.id, 'approve')}>Approve</button>
                    </span>
                  )}
                  {(a.status === 'PENDING' || a.status === 'IN_REVIEW') && !can() && <button className="btn-ghost btn-sm" onClick={() => setOpenId(a.id)}>Review</button>}
                </td>
              </tr>
            ))}
          </SimpleTable>
          <Pager p={p} />
        </div>
      </Card>
      <NewRequest open={creating} onClose={() => setCreating(false)} onSaved={refresh} />
      <DetailDrawer id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
    </>
  );
}
