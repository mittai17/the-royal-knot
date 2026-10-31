'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Mail, MapPin, Pencil, Phone } from 'lucide-react';
import { Card, EmptyState, ErrorState, Field, Modal, PageHeader, ProgressBar, Skeleton, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Can, RoleGate } from '@/components/shared/can';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { ago, fmtDate, fmtDateTime, humanize, inr, inrCompact } from '@/lib/utils';

interface Pay { contractValue: number; expected: number; received: number; outstanding: number }
interface Detail {
  id: string; name: string; brideName: string; groomName: string; phone?: string | null; email?: string | null; address?: string | null; createdAt: string;
  weddings: { id: string; name: string; location: string; venue?: string | null; startDate: string; endDate: string; status: string; packageType: string; expectedGuests: number; planner: { name: string } | null; payments: Pay; nextDue: { type: string; dueDate: string; expectedAmount: string } | null }[];
  enquiries: { id: string; stage: string; source: string; preferredDate: string | null; createdAt: string }[];
  portalUsers: { id: string; name: string; email: string; status: string; lastLoginAt: string | null }[];
  payments: Pay;
  recentPayments: { id: string; receiptNo: string; amount: string; method: string; paidAt: string; milestone: string; wedding: string }[];
  communications: null | {
    threads: { id: string; subject: string; lastMessageAt: string; messages: number }[];
    recentMessages: { id: string; body: string; createdAt: string; senderName: string; senderRole: string }[];
    enquiryActivity: { id: string; type: string; message: string; createdAt: string }[];
  };
}

function EditModal({ c, open, onClose, onSaved }: { c: Detail; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ brideName: c.brideName, groomName: c.groomName, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.patch(`/clients/${c.id}`, { brideName: f.brideName.trim(), groomName: f.groomName.trim(), phone: f.phone || undefined, email: f.email || undefined, address: f.address || undefined }); notify.ok('Client updated'); onSaved(); onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Edit client" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.brideName.trim() || !f.groomName.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Bride’s name"><input className="input" value={f.brideName} onChange={(e) => setF({ ...f, brideName: e.target.value })} /></Field>
        <Field label="Groom’s name"><input className="input" value={f.groomName} onChange={(e) => setF({ ...f, groomName: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Address" className="col-span-2"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const r = useApi<Detail>(`/clients/${id}`);
  const [editing, setEditing] = useState(false);
  const c = r.data;

  return (
    <RoleGate roles={['PLANNER', 'FINANCE']}>
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-3"><ArrowLeft className="h-4 w-4" />All clients</Link>
      {r.loading ? <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>
        : r.error || !c ? <Card><ErrorState message={r.error ?? 'Client not found'} onRetry={r.reload} /></Card>
        : (
          <>
            <PageHeader title={c.name} subtitle={`Client since ${fmtDate(c.createdAt)}`} actions={<Can roles={['PLANNER']}><button className="btn-secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</button></Can>} />
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft mb-5">
              <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" />{c.phone ?? 'No phone'}</span>
              <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4" />{c.email ?? 'No email'}</span>
              {c.address && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{c.address}</span>}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <StatCard label="Weddings" value={c.weddings.length} hint={`${c.enquiries.length} enquir${c.enquiries.length === 1 ? 'y' : 'ies'}`} />
              <StatCard label="Contract value" value={inrCompact(c.payments.contractValue)} />
              <StatCard label="Received" value={inrCompact(c.payments.received)} />
              <StatCard label="Outstanding" value={inrCompact(c.payments.outstanding)} hint={c.payments.outstanding > 0 ? 'Balance due' : 'Settled'} />
            </div>
            <div className="grid xl:grid-cols-3 gap-5">
              <div className="xl:col-span-2 space-y-5 min-w-0">
                <Card title="Wedding history">
                  {c.weddings.length === 0 ? <EmptyState title="No weddings yet" hint="Convert the enquiry into a wedding to start planning." /> : (
                    <ul className="divide-y divide-line">{c.weddings.map((w) => {
                      const total = Math.max(w.payments.contractValue, w.payments.expected);
                      return (
                        <li key={w.id} className="py-3">
                          <div className="flex flex-wrap items-center gap-2 justify-between"><Link href={`/weddings/${w.id}`} className="font-medium text-burgundy hover:underline">{w.name}</Link><StatusBadge status={w.status} /></div>
                          <p className="text-xs text-ink-soft mt-0.5">{w.location}{w.venue ? ` · ${w.venue}` : ''} · {fmtDate(w.startDate)} – {fmtDate(w.endDate)} · {w.expectedGuests} guests · Planner {w.planner?.name ?? 'unassigned'}</p>
                          {total > 0 && <div className="mt-2 max-w-md"><div className="flex justify-between text-xs mb-1"><span>{inr(w.payments.received)} received</span><span className="text-ink-soft">of {inr(total)}</span></div><ProgressBar value={(w.payments.received / total) * 100} tone={w.payments.outstanding > 0 ? 'warning' : 'success'} />{w.nextDue && <p className="text-xs text-ink-soft mt-1">Next: {humanize(w.nextDue.type)} {inr(w.nextDue.expectedAmount)} due {fmtDate(w.nextDue.dueDate)}</p>}</div>}
                        </li>
                      );
                    })}</ul>
                  )}
                </Card>
                <Card title="Payment history">
                  {c.recentPayments.length === 0 ? <EmptyState title="No payments recorded" /> : (
                    <div className="overflow-x-auto"><table className="w-full text-sm min-w-[480px]"><thead><tr className="text-left text-xs text-ink-soft"><th className="py-2 font-medium">Receipt</th><th className="font-medium">Milestone</th><th className="font-medium">Paid</th><th className="font-medium text-right">Amount</th></tr></thead>
                      <tbody>{c.recentPayments.map((p) => <tr key={p.id} className="border-t border-line/70"><td className="py-2">{p.receiptNo}<p className="text-xs text-ink-soft">{p.wedding}</p></td><td>{humanize(p.milestone)}</td><td>{fmtDate(p.paidAt)} <span className="text-xs text-ink-soft">{humanize(p.method)}</span></td><td className="text-right num">{inr(p.amount)}</td></tr>)}</tbody></table></div>
                  )}
                </Card>
              </div>
              <div className="space-y-5 min-w-0">
                <Card title="Communication history">
                  {!c.communications ? <p className="text-sm text-ink-soft">Conversation history is visible to the planning team.</p>
                    : c.communications.recentMessages.length === 0 && c.communications.enquiryActivity.length === 0 ? <EmptyState title="No conversations yet" />
                    : (
                      <ul className="space-y-3">
                        {c.communications.recentMessages.map((m) => <li key={m.id} className="text-sm"><p className="text-xs text-ink-soft">{m.senderName} · {humanize(m.senderRole)} · {ago(m.createdAt)}</p><p className="line-clamp-2">{m.body || 'Attachment'}</p></li>)}
                        {c.communications.enquiryActivity.map((a) => <li key={a.id} className="text-sm"><p className="text-xs text-ink-soft">{humanize(a.type)} · {fmtDateTime(a.createdAt)}</p><p className="line-clamp-2">{a.message}</p></li>)}
                      </ul>
                    )}
                  {c.communications && c.communications.threads.length > 0 && <Link href="/communications" className="btn-secondary btn-sm mt-4">Open in Communications</Link>}
                </Card>
                <Card title="Portal access">
                  {c.portalUsers.length === 0 ? <p className="text-sm text-ink-soft">No portal login yet.</p> : <ul className="space-y-2">{c.portalUsers.map((u) => <li key={u.id} className="text-sm flex justify-between gap-2"><span className="min-w-0"><span className="block truncate">{u.name}</span><span className="block text-xs text-ink-soft truncate">{u.email}</span></span><span className="text-xs text-ink-soft shrink-0">{u.lastLoginAt ? `seen ${ago(u.lastLoginAt)}` : 'never signed in'}</span></li>)}</ul>}
                </Card>
                <Card title="Enquiries">
                  {c.enquiries.length === 0 ? <p className="text-sm text-ink-soft">No enquiries.</p> : <ul className="space-y-2">{c.enquiries.map((e) => <li key={e.id} className="text-sm flex justify-between gap-2 items-center"><span>{humanize(e.source)} · {fmtDate(e.createdAt)}</span><StatusBadge status={e.stage} /></li>)}</ul>}
                </Card>
              </div>
            </div>
            <EditModal key={String(editing)} c={c} open={editing} onClose={() => setEditing(false)} onSaved={r.reload} />
          </>
        )}
    </RoleGate>
  );
}
