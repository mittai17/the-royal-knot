'use client';
import { useState } from 'react';
import { Banknote, Clock, Plus, Receipt, TriangleAlert } from 'lucide-react';
import { Card, Field, Modal, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Segmented, Select } from '@/components/shared/form-bits';
import { Can } from '@/components/shared/can';
import { BusyButton, D, Muted, Pager, SimpleTable, usePaged } from '@/components/finance/fin-bits';
import { useApi, asRows } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { newKey } from '@/lib/idempotency';
import { notify } from '@/lib/toast';
import { PAYMENT_METHODS } from '@/lib/enums';
import { humanize, inr, toNum } from '@/lib/utils';
import type { Money } from '@/types';

type Tab = '' | 'SUBMITTED' | 'VERIFIED' | 'APPROVED' | 'OVERDUE' | 'PAID' | 'REJECTED';
interface Bill { id: string; billNo: string; status: string; storedStatus: string; billDate: string; dueDate?: string | null; subtotal: Money; taxTotal: Money; total: Money; amountPaid: Money; outstanding: Money; notes?: string | null; vendor: { id: string; name: string; gstin?: string | null; bankDetails?: string | null }; wedding?: { id: string; name: string } | null; purchaseOrder?: { id: string; poNumber: string } | null; documentId?: string | null }
interface Detail extends Bill { match: { matched: boolean | null; poTotal: Money | null; variance: Money | null; remaining: Money | null; quotationTotal: Money | null }; payments: { id: string; at: string; by?: string | null; amount?: string | null; method?: string | null }[]; approval?: { id: string; status: string } | null; requiresApproval: boolean; approvalLimit: number; submittedBy?: string | null; verifiedBy?: string | null; approvedBy?: string | null }
interface Summary { counts: Record<string, number>; payable: Money; overdue: Money; awaitingApproval: Money; paid: Money }

function LogModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const vendors = useApi<unknown>(open ? '/vendors' : null, { pageSize: 200 });
  const [f, setF] = useState({ vendorId: '', billNo: '', subtotal: '', taxTotal: '', dueDate: '', purchaseOrderId: '', notes: '' });
  const pos = useApi<unknown>(open && f.vendorId ? '/procurement/purchase-orders' : null, { vendorId: f.vendorId, pageSize: 100 });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/vendor-bills', { vendorId: f.vendorId, billNo: f.billNo, subtotal: Number(f.subtotal), taxTotal: Number(f.taxTotal) || 0, dueDate: f.dueDate || undefined, purchaseOrderId: f.purchaseOrderId || undefined, notes: f.notes || undefined });
      notify.ok('Bill logged'); setF({ vendorId: '', billNo: '', subtotal: '', taxTotal: '', dueDate: '', purchaseOrderId: '', notes: '' }); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  const poRows = asRows<{ id: string; poNumber: string; total: Money; status: string }>(pos.data).filter((p) => p.status !== 'CANCELLED' && p.status !== 'DRAFT');
  return (
    <Modal open={open} onClose={onClose} title="Log vendor bill" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><BusyButton busy={busy} disabled={!f.vendorId || !f.billNo.trim() || !(Number(f.subtotal) > 0)} onClick={save}>Log bill</BusyButton></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Vendor" className="col-span-2"><Select value={f.vendorId} onChange={(v) => setF({ ...f, vendorId: v, purchaseOrderId: '' })} placeholder="Select vendor" options={asRows<{ id: string; name: string }>(vendors.data).map((v) => ({ v: v.id, l: v.name }))} /></Field>
        <Field label="Bill number"><input className="input" value={f.billNo} onChange={(e) => setF({ ...f, billNo: e.target.value })} /></Field>
        <Field label="Due date"><input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        <Field label="Amount before tax (₹)"><input className="input" type="number" min={0} value={f.subtotal} onChange={(e) => setF({ ...f, subtotal: e.target.value })} /></Field>
        <Field label="GST (₹)"><input className="input" type="number" min={0} value={f.taxTotal} onChange={(e) => setF({ ...f, taxTotal: e.target.value })} /></Field>
        <Field label="Match to purchase order" className="col-span-2"><Select value={f.purchaseOrderId} onChange={(v) => setF({ ...f, purchaseOrderId: v })} placeholder={f.vendorId ? 'No purchase order' : 'Choose a vendor first'} options={poRows.map((p) => ({ v: p.id, l: `${p.poNumber} · ${inr(p.total)}` }))} /></Field>
        <Field label="Notes" className="col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function PayModal({ bill, onClose, onSaved }: { bill: Detail | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ amount: '', method: 'BANK_TRANSFER', reference: '' });
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const out = toNum(bill?.outstanding), amt = Number(f.amount), over = amt > out + 0.001;
  const save = async () => {
    if (!bill) return; setBusy(true);
    try { await api.post(`/vendor-bills/${bill.id}/pay`, { amount: amt, method: f.method, reference: f.reference || undefined, idempotencyKey: key }); notify.ok('Payment recorded'); setKey(newKey()); setF({ ...f, amount: '', reference: '' }); onSaved(); onClose(); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!bill} onClose={onClose} title={`Pay ${bill?.vendor.name ?? ''} · ${bill?.billNo ?? ''}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><BusyButton busy={busy} disabled={!amt || amt <= 0 || over} onClick={save}>Record payment</BusyButton></>}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 rounded-xl bg-surface-2 p-4 text-sm"><p className="text-xs text-ink-soft">Outstanding</p><p className="num">{inr(out)}</p>{bill?.vendor.bankDetails && <Muted>{bill.vendor.bankDetails}</Muted>}</div>
        <Field label="Amount (₹)" error={over ? 'Exceeds outstanding balance' : undefined}><input className="input" type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Method"><Select value={f.method} onChange={(v) => setF({ ...f, method: v })} options={PAYMENT_METHODS} /></Field>
        <Field label="Reference" className="col-span-2"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <button className="text-xs text-burgundy text-left col-span-2" onClick={() => setF({ ...f, amount: String(out) })}>Fill full outstanding</button>
      </div>
    </Modal>
  );
}

function Drawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const d = useApi<Detail>(id ? `/vendor-bills/${id}` : null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [paying, setPaying] = useState(false);
  const b = d.data;
  const act = async (kind: 'verify' | 'approve' | 'reject') => {
    if (kind === 'reject' && note.trim().length < 3) { notify.err(new Error('Add a reason before rejecting')); return; }
    setBusy(kind);
    try {
      const r = await api.post<{ approvalRequired?: boolean }>(`/vendor-bills/${id}/${kind}`, { note: note.trim() || undefined });
      if (r.data?.approvalRequired) notify.ok('Above the Finance limit — Founder approval requested'); else notify.ok({ verify: 'Bill verified', approve: 'Bill approved for payment', reject: 'Bill rejected' }[kind]);
      setNote(''); d.reload(); onChanged();
    } catch (e) { notify.err(e); } finally { setBusy(''); }
  };
  const st = b?.storedStatus;
  return (
    <>
      <Modal open={!!id} onClose={onClose} side width="max-w-lg" title={b ? `${b.billNo} · ${b.vendor.name}` : 'Vendor bill'}>
        {d.error ? <p className="text-sm text-danger">{d.error}</p> : !b ? <p className="text-sm text-ink-soft">Loading…</p> : (
          <div className="space-y-5">
            <div className="flex items-center gap-2"><StatusBadge status={b.status} />{b.status === 'OVERDUE' && st && <span className="text-xs text-ink-soft">workflow: {humanize(st)}</span>}</div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-ink-soft">Wedding</dt><dd>{b.wedding?.name ?? '—'}</dd></div><div><dt className="text-xs text-ink-soft">Due</dt><dd><D v={b.dueDate} /></dd></div>
              <div><dt className="text-xs text-ink-soft">Subtotal / GST</dt><dd className="tabular-nums">{inr(b.subtotal)} / {inr(b.taxTotal)}</dd></div><div><dt className="text-xs text-ink-soft">Total</dt><dd className="tabular-nums font-medium">{inr(b.total)}</dd></div>
              <div><dt className="text-xs text-ink-soft">Paid</dt><dd className="tabular-nums">{inr(b.amountPaid)}</dd></div><div><dt className="text-xs text-ink-soft">Outstanding</dt><dd className="tabular-nums">{inr(b.outstanding)}</dd></div>
              <div><dt className="text-xs text-ink-soft">Submitted by</dt><dd>{b.submittedBy ?? '—'}</dd></div><div><dt className="text-xs text-ink-soft">Verified / approved by</dt><dd>{[b.verifiedBy, b.approvedBy].filter(Boolean).join(' / ') || '—'}</dd></div>
            </dl>
            <div className="rounded-xl bg-surface-2 p-4 text-sm">
              <p className="label">Match to purchase order / quotation</p>
              {!b.purchaseOrder ? <p className="text-ink-soft">Not linked to a purchase order.</p> : (
                <ul className="space-y-1"><li>{b.purchaseOrder.poNumber}: {inr(b.match.poTotal)} {b.match.matched ? <span className="text-success">· matches bill</span> : <span className="text-danger">· variance {inr(b.match.variance)}</span>}</li>
                  {b.match.quotationTotal != null && <li className="text-ink-soft">Selected quotation: {inr(b.match.quotationTotal)}</li>}
                  <li className="text-ink-soft">Left to bill on PO: {inr(b.match.remaining)}</li></ul>
              )}
            </div>
            {b.notes && <p className="text-sm whitespace-pre-wrap text-ink-soft">{b.notes}</p>}
            {b.approval && <p className="text-sm">Founder approval: <StatusBadge status={b.approval.status} /></p>}
            {b.payments.length > 0 && <div><p className="label">Payments</p><ul className="text-sm divide-y divide-line">{b.payments.map((p) => <li key={p.id} className="py-1.5">{inr(p.amount)} · {humanize(p.method)}<Muted>{p.by} · <D v={p.at} /></Muted></li>)}</ul></div>}
            <Can roles={['FINANCE']}>
              {st && ['SUBMITTED', 'VERIFIED', 'APPROVED'].includes(st) && (
                <div className="space-y-3">
                  {st !== 'APPROVED' && <Field label="Comment"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required to reject" /></Field>}
                  {st === 'VERIFIED' && b.requiresApproval && !b.approval && <p className="text-xs text-ink-soft">Bills above {inr(b.approvalLimit)} need Founder approval; approving will raise a request.</p>}
                  <div className="flex flex-wrap gap-2">
                    {st === 'SUBMITTED' && <BusyButton busy={busy === 'verify'} onClick={() => act('verify')}>Verify</BusyButton>}
                    {st === 'VERIFIED' && <BusyButton busy={busy === 'approve'} onClick={() => act('approve')}>Approve for payment</BusyButton>}
                    {st === 'APPROVED' && <button className="btn-primary" onClick={() => setPaying(true)}><Banknote className="h-4 w-4" />Record payment</button>}
                    {st !== 'APPROVED' && <BusyButton className="btn-danger" busy={busy === 'reject'} onClick={() => act('reject')}>Reject</BusyButton>}
                  </div>
                </div>
              )}
            </Can>
          </div>
        )}
      </Modal>
      <PayModal bill={paying ? b ?? null : null} onClose={() => setPaying(false)} onSaved={() => { d.reload(); onChanged(); }} />
    </>
  );
}

export function VendorBillsPanel() {
  const [tab, setTab] = useState<Tab>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const p = usePaged<Bill, { summary?: Summary }>('/vendor-bills', { status: tab || undefined }, 15);
  const s = p.meta.summary;
  const n = (k: string) => (s ? ` (${s.counts[k] ?? 0})` : '');
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard label="Payable" value={inr(s?.payable ?? 0)} icon={<Receipt className="h-5 w-5" />} />
        <StatCard label="Awaiting approval" value={inr(s?.awaitingApproval ?? 0)} hint={s ? `${(s.counts.SUBMITTED ?? 0) + (s.counts.VERIFIED ?? 0)} bills` : undefined} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Overdue" value={inr(s?.overdue ?? 0)} hint={s ? `${s.counts.OVERDUE ?? 0} bills` : undefined} icon={<TriangleAlert className="h-5 w-5" />} />
        <StatCard label="Paid to date" value={inr(s?.paid ?? 0)} icon={<Banknote className="h-5 w-5" />} />
      </div>
      <Card pad={false} title={<div className="overflow-x-auto max-w-full"><Segmented value={tab} onChange={(t) => { setTab(t); p.setPage(1); }} options={[{ v: '', l: 'All' }, { v: 'SUBMITTED', l: `Submitted${n('SUBMITTED')}` }, { v: 'VERIFIED', l: `Verified${n('VERIFIED')}` }, { v: 'APPROVED', l: `Approved${n('APPROVED')}` }, { v: 'OVERDUE', l: `Overdue${n('OVERDUE')}` }, { v: 'PAID', l: `Paid${n('PAID')}` }, { v: 'REJECTED', l: 'Rejected' }]} /></div>}
        action={<div className="flex gap-2"><input className="input !w-48" type="search" placeholder="Search…" value={p.search} onChange={(e) => p.setSearch(e.target.value)} aria-label="Search bills" /><Can roles={['FINANCE']}><button className="btn-primary" onClick={() => setLogging(true)}><Plus className="h-4 w-4" />Log bill</button></Can></div>}>
        <div className="pt-1">
          <SimpleTable head={['Bill', 'Vendor', 'Wedding / PO', 'Due', 'Total', 'Outstanding', 'Status']} loading={p.loading && !p.rows.length} error={p.error} onRetry={p.reload} empty={!p.rows.length}>
            {p.rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setOpenId(r.id)}>
                <td className="td font-medium">{r.billNo}</td><td className="td">{r.vendor.name}</td><td className="td">{r.wedding?.name ?? '—'}{r.purchaseOrder && <Muted>{r.purchaseOrder.poNumber}</Muted>}</td>
                <td className="td"><D v={r.dueDate} /></td><td className="td tabular-nums">{inr(r.total)}</td><td className="td tabular-nums">{inr(r.outstanding)}</td><td className="td"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </SimpleTable>
          <Pager p={p} />
        </div>
      </Card>
      <LogModal open={logging} onClose={() => setLogging(false)} onSaved={p.reload} />
      <Drawer id={openId} onClose={() => setOpenId(null)} onChanged={p.reload} />
    </>
  );
}
