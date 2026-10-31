'use client';
import { useState } from 'react';
import { Download, Plus, Receipt, Loader2 } from 'lucide-react';
import { Card, EmptyState, ErrorState, Field, Modal, ProgressBar, Skeleton, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { useApi } from '@/hooks/use-api';
import { api, apiUrl } from '@/lib/api';
import { newKey } from '@/lib/idempotency';
import { notify } from '@/lib/toast';
import { PAYMENT_METHODS } from '@/lib/enums';
import { fmtDate, humanize, inr, toNum, toInputDate } from '@/lib/utils';
import type { Money } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';

interface Pay { id: string; amount: Money; method: string; reference?: string | null; paidAt: string; receiptNo: string }
interface Ms { id: string; type: string; dueDate: string; expectedAmount: Money; received: Money; outstanding: Money; status: string; payments: Pay[] }
interface VendorSummary { weddingVendorId: string; vendor: string; category: string; negotiated: Money; advance: Money; finalBill: Money; paid: Money; remainingPayable: Money }
interface VendorPay { id: string; kind: string; amount: Money; method: string; reference?: string | null; paidAt: string; weddingVendor: { vendor: { name: string } } }
interface PaymentsData { milestones: Ms[]; totals: { expected: Money; received: Money; outstanding: Money }; vendorPayments: VendorPay[]; vendorSummary: VendorSummary[] }

function RecordModal({ weddingId, milestone, onClose, onSaved }: { weddingId: string; milestone: Ms | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ amount: '', method: 'BANK_TRANSFER', reference: '', paidAt: toInputDate(new Date().toISOString()) });
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const outstanding = toNum(milestone?.outstanding);
  const amount = Number(f.amount);
  const over = amount > outstanding + 0.001;

  const save = async () => {
    if (!milestone) return;
    setBusy(true);
    try {
      await api.post('/payments', { weddingId, milestone: milestone.type, amount, method: f.method, reference: f.reference || undefined, paidAt: f.paidAt, idempotencyKey: key });
      notify.ok('Payment recorded'); setKey(newKey()); setF({ ...f, amount: '', reference: '' }); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!milestone} onClose={onClose} title={`Record ${humanize(milestone?.type)} payment`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !amount || amount <= 0 || over} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Record payment</button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-surface-2 p-4 grid grid-cols-2 text-sm"><div><p className="text-xs text-ink-soft">Expected</p><p className="num">{inr(milestone?.expectedAmount)}</p></div><div><p className="text-xs text-ink-soft">Outstanding</p><p className="num">{inr(outstanding)}</p></div></div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (₹)" error={over ? 'Exceeds outstanding balance' : undefined}><input className="input" type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Payment date"><input className="input" type="date" value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></Field>
          <Field label="Method"><Select value={f.method} onChange={(v) => setF({ ...f, method: v })} options={PAYMENT_METHODS} /></Field>
          <Field label="Transaction reference"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        </div>
        <button className="text-xs text-burgundy" onClick={() => setF({ ...f, amount: String(outstanding) })}>Fill full outstanding ({inr(outstanding)})</button>
        <p className="text-xs text-ink-soft">Each submission carries a unique key, so a double click or retry never records the payment twice.</p>
      </div>
    </Modal>
  );
}

function VendorPayModal({ weddingId, vendors, open, onClose, onSaved }: { weddingId: string; vendors: VendorSummary[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ weddingVendorId: '', kind: 'ADVANCE', amount: '', method: 'BANK_TRANSFER', reference: '' });
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const v = vendors.find((x) => x.weddingVendorId === f.weddingVendorId);
  const save = async () => {
    setBusy(true);
    try { await api.post(`/weddings/${weddingId}/vendor-payments`, { ...f, amount: Number(f.amount), reference: f.reference || undefined, idempotencyKey: key }); notify.ok('Vendor payment recorded'); setKey(newKey()); setF({ ...f, amount: '', reference: '' }); onSaved(); onClose(); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record vendor payment" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.weddingVendorId || !Number(f.amount)} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Record</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Vendor" className="col-span-2"><Select value={f.weddingVendorId} onChange={(x) => setF({ ...f, weddingVendorId: x })} options={vendors.map((x) => ({ v: x.weddingVendorId, l: `${x.vendor} · ${humanize(x.category)}` }))} placeholder="Select vendor" /></Field>
        {v && <p className="col-span-2 text-xs text-ink-soft">Contract {inr(v.negotiated)} · paid {inr(v.paid)} · remaining {inr(v.remainingPayable)}</p>}
        <Field label="Type"><Select value={f.kind} onChange={(x) => setF({ ...f, kind: x })} options={['ADVANCE', 'FINAL']} /></Field>
        <Field label="Amount (₹)"><input className="input" type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Method"><Select value={f.method} onChange={(x) => setF({ ...f, method: x })} options={PAYMENT_METHODS} /></Field>
        <Field label="Reference"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function PaymentsPanel({ weddingId, autoOpen, contractValue }: { weddingId: string; autoOpen?: boolean; contractValue?: Money }) {
  const r = useApi<PaymentsData>(`/weddings/${weddingId}/payments`);
  const [rec, setRec] = useState<Ms | null>(null);
  const [vp, setVp] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (r.error) return <Card><ErrorState message={r.error} onRetry={r.reload} /></Card>;
  if (r.loading || !r.data) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  const d = r.data;
  const expected = toNum(d.totals.expected), received = toNum(d.totals.received);
  const ORDER = ['BOOKING', 'ADVANCE', 'FINAL'];
  const milestones = [...d.milestones].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  const payments = d.milestones.flatMap((m) => m.payments.map((p) => ({ ...p, type: m.type }))).sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt));
  const vendorPaid = d.vendorSummary.reduce((a, v) => a + toNum(v.paid), 0);
  const firstDue = autoOpen && !dismissed ? d.milestones.find((m) => m.status !== 'PAID') : undefined;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Contract value" value={inr(contractValue ?? expected)} hint="client agreement" />
        <StatCard label="Received" value={inr(received)} hint={`${expected ? Math.round((received / expected) * 100) : 0}% of milestones`} />
        <StatCard label="Outstanding balance" value={inr(d.totals.outstanding)} />
        <StatCard label="Paid to vendors" value={inr(vendorPaid)} hint={`${inr(d.vendorSummary.reduce((a, v) => a + toNum(v.remainingPayable), 0))} still payable`} />
      </div>
      <Card title="Client payment milestones">
        {d.milestones.length === 0 ? <EmptyState title="No milestones" /> : (
          <div className="grid md:grid-cols-3 gap-4">
            {milestones.map((m) => {
              const rec_ = toNum(m.received), exp = toNum(m.expectedAmount);
              return (
                <div key={m.id} className="rounded-xl border border-line p-4 space-y-3">
                  <div className="flex items-center justify-between"><p className="font-serif text-lg">{humanize(m.type)}</p><StatusBadge status={m.status} /></div>
                  <p className="num text-2xl">{inr(exp)}</p>
                  <div><ProgressBar value={exp ? (rec_ / exp) * 100 : 0} tone={m.status === 'OVERDUE' ? 'danger' : 'success'} /><p className="text-xs text-ink-soft mt-1.5 flex justify-between"><span>Received {inr(rec_)}</span><span>Due {fmtDate(m.dueDate)}</span></p></div>
                  <Can roles={G.FINANCE_WRITE}><button className="btn-secondary btn-sm w-full" disabled={m.status === 'PAID'} onClick={() => setRec(m)}><Plus className="h-4 w-4" />Record payment</button></Can>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card title="Client payment history" pad={false}>
        {payments.length === 0 ? <EmptyState title="No payments recorded yet" /> : (
          <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Date</th><th className="th">Milestone</th><th className="th">Method</th><th className="th">Reference</th><th className="th text-right">Amount</th><th className="th">Receipt</th></tr></thead><tbody>
            {payments.map((p) => <tr key={p.id}><td className="td">{fmtDate(p.paidAt)}</td><td className="td">{humanize(p.type)}</td><td className="td">{humanize(p.method)}</td><td className="td text-ink-soft">{p.reference ?? '—'}</td><td className="td text-right num">{inr(p.amount)}</td><td className="td"><a className="inline-flex items-center gap-1.5 text-burgundy hover:underline text-sm" href={apiUrl(`/payments/${p.id}/receipt`)} target="_blank" rel="noreferrer"><Receipt className="h-3.5 w-3.5" />{p.receiptNo}<Download className="h-3 w-3" /></a></td></tr>)}
          </tbody></table></div>
        )}
      </Card>
      <Card title="Vendor payments" action={<Can roles={G.FINANCE_WRITE}><button className="btn-secondary btn-sm" onClick={() => setVp(true)} disabled={!d.vendorSummary.length}><Plus className="h-4 w-4" />Record vendor payment</button></Can>} pad={false}>
        {d.vendorSummary.length === 0 ? <EmptyState title="No vendors assigned yet" /> : (
          <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Vendor</th><th className="th text-right">Negotiated</th><th className="th text-right">Advance</th><th className="th text-right">Final bill</th><th className="th text-right">Paid</th><th className="th text-right">Remaining</th></tr></thead><tbody>
            {d.vendorSummary.map((v) => <tr key={v.weddingVendorId}><td className="td"><p className="font-medium">{v.vendor}</p><p className="text-xs text-ink-soft">{humanize(v.category)}</p></td><td className="td text-right tabular-nums">{inr(v.negotiated)}</td><td className="td text-right tabular-nums">{inr(v.advance)}</td><td className="td text-right tabular-nums">{inr(v.finalBill)}</td><td className="td text-right tabular-nums">{inr(v.paid)}</td><td className="td text-right num">{inr(v.remainingPayable)}</td></tr>)}
          </tbody></table></div>
        )}
      </Card>
      <RecordModal weddingId={weddingId} milestone={rec ?? firstDue ?? null} onClose={() => { setRec(null); setDismissed(true); }} onSaved={r.reload} />
      <VendorPayModal weddingId={weddingId} vendors={d.vendorSummary} open={vp} onClose={() => setVp(false)} onSaved={r.reload} />
    </div>
  );
}
