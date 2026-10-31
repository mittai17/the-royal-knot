'use client';
import { useState } from 'react';
import { Check, Plus, Loader2, FileDown } from 'lucide-react';
import { Card, EmptyState, ErrorState, Field, Modal, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { useApi } from '@/hooks/use-api';
import { api, apiUrl } from '@/lib/api';
import { newKey } from '@/lib/idempotency';
import { notify } from '@/lib/toast';
import { CHARGE_TYPES, PAYMENT_METHODS } from '@/lib/enums';
import { humanize, inr, toNum } from '@/lib/utils';
import type { Money } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';

interface VendorRow {
  settlementId: string; weddingVendorId: string; vendor: { id: string; name: string }; category: string; status: string; invoiceRef?: string | null; invoiceEntered: boolean;
  actualInvoice?: Money | null; original: Money; negotiated: Money; advance: Money; approvedExtras: Money; finalBill: Money; paid: Money; remainingPayable: Money; overpaid: Money;
}
interface Charge { id: string; type: string; description: string; quantity: Money; unitPrice: Money; amount: Money; approved: boolean; billToClient: boolean; auto: boolean; vendorName?: string | null }
interface Recon {
  reconciliationId: string; status: string;
  wedding: { id: string; name: string; expectedGuests: number; actualGuests: number | null; extraGuests: number };
  charges: Charge[]; pendingChargesTotal: Money; vendors: VendorRow[];
  clientBilling: { original: Money; approvedExtras: Money; finalAmount: Money; received: Money; outstanding: Money };
  vendorTotals: { negotiated: Money; finalBill: Money; paid: Money; remainingPayable: Money };
}

const Row = ({ l, v, strong }: { l: string; v: string; strong?: boolean }) => <div className={`flex justify-between py-2 text-sm ${strong ? 'border-t border-line font-semibold' : ''}`}><span className={strong ? '' : 'text-ink-soft'}>{l}</span><span className="num">{v}</span></div>;

function ChargeModal({ weddingId, vendors, open, onClose, onSaved }: { weddingId: string; vendors: VendorRow[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ type: 'DJ_OVERTIME', description: '', quantity: '1', unitPrice: '', weddingVendorId: '', billToClient: true });
  const [busy, setBusy] = useState(false);
  const total = (Number(f.quantity) || 0) * (Number(f.unitPrice) || 0);
  const save = async () => {
    setBusy(true);
    try { await api.post(`/weddings/${weddingId}/reconciliation/charges`, { ...f, quantity: Number(f.quantity), unitPrice: Number(f.unitPrice), weddingVendorId: f.weddingVendorId || undefined }); notify.ok('Charge added; awaiting approval'); setF({ ...f, description: '', unitPrice: '' }); onSaved(); onClose(); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add additional charge" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.description || !total} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add charge</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type"><Select value={f.type} onChange={(v) => setF({ ...f, type: v })} options={CHARGE_TYPES} /></Field>
        <Field label="Vendor (optional)"><Select value={f.weddingVendorId} onChange={(v) => setF({ ...f, weddingVendorId: v })} options={vendors.map((v) => ({ v: v.weddingVendorId, l: v.vendor.name }))} placeholder="None" /></Field>
        <Field label="Description" className="col-span-2"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Quantity"><input className="input" type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
        <Field label="Unit price (₹)"><input className="input" type="number" value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} /></Field>
        <p className="col-span-2 text-sm">Total: <span className="num">{inr(total)}</span></p>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#401827]" checked={f.billToClient} onChange={(e) => setF({ ...f, billToClient: e.target.checked })} />Bill to client once approved</label>
      </div>
    </Modal>
  );
}

function InvoiceModal({ v, onClose, onSaved }: { v: VendorRow | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!v) return;
    setBusy(true);
    try { await api.put(`/reconciliation/settlements/${v.settlementId}/invoice`, { actualInvoice: Number(amount), invoiceRef: ref || undefined }); notify.ok('Invoice recorded'); setAmount(''); setRef(''); onSaved(); onClose(); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!v} onClose={onClose} title={`Final invoice · ${v?.vendor.name ?? ''}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || amount === '' || Number(amount) < 0} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save invoice</button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-surface-2 p-4 grid grid-cols-3 text-sm"><div><p className="text-xs text-ink-soft">Quoted</p><p className="num">{inr(v?.original)}</p></div><div><p className="text-xs text-ink-soft">Negotiated</p><p className="num">{inr(v?.negotiated)}</p></div><div><p className="text-xs text-ink-soft">Advance paid</p><p className="num">{inr(v?.advance)}</p></div></div>
        <div className="grid grid-cols-2 gap-4"><Field label="Actual invoice (₹)"><input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Invoice no."><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

function SettleModal({ v, reconId, onClose, onSaved }: { v: VendorRow | null; reconId: string; onClose: () => void; onSaved: () => void }) {
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [ref, setRef] = useState('');
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!v) return;
    setBusy(true);
    try { await api.post(`/reconciliation/${reconId}/settle`, { weddingVendorId: v.weddingVendorId, method, reference: ref || undefined, idempotencyKey: key }); notify.ok('Vendor settled'); setKey(newKey()); setRef(''); onSaved(); onClose(); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!v} onClose={onClose} title={`Settle ${v?.vendor.name ?? ''}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Pay {inr(v?.remainingPayable)}</button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-surface-2 p-4 text-sm space-y-1"><div className="flex justify-between"><span className="text-ink-soft">Final bill</span><span className="num">{inr(v?.finalBill)}</span></div><div className="flex justify-between"><span className="text-ink-soft">Already paid (advances)</span><span className="num">− {inr(v?.paid)}</span></div><div className="flex justify-between border-t border-line pt-1 font-semibold"><span>Remaining payable</span><span className="num">{inr(v?.remainingPayable)}</span></div></div>
        <div className="grid grid-cols-2 gap-4"><Field label="Method"><Select value={method} onChange={setMethod} options={PAYMENT_METHODS} /></Field><Field label="Reference"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field></div>
        <p className="text-xs text-ink-soft">Paying the remaining balance is idempotent. Submitting twice cannot create a duplicate vendor payment.</p>
      </div>
    </Modal>
  );
}

export function ReconciliationPanel({ weddingId }: { weddingId: string }) {
  const r = useApi<Recon>(`/weddings/${weddingId}/reconciliation`);
  const [charge, setCharge] = useState(false);
  const [invoice, setInvoice] = useState<VendorRow | null>(null);
  const [settle, setSettle] = useState<VendorRow | null>(null);
  const [busy, setBusy] = useState(false);

  if (r.error) return <Card><ErrorState message={r.error} onRetry={r.reload} /></Card>;
  if (r.loading || !r.data) return <Skeleton className="h-96 rounded-xl" />;
  const d = r.data;
  const auto = d.charges.find((c) => c.auto);
  const approve = async (c: Charge, approved: boolean) => {
    setBusy(true);
    try { await api.patch(`/reconciliation/charges/${c.id}`, { approved }); notify.ok(approved ? 'Charge approved' : 'Approval withdrawn'); r.reload(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <Card title="Extra guests → additional catering">
        <div className="grid sm:grid-cols-4 gap-4 text-center">
          {[['Expected guests', d.wedding.expectedGuests], ['Actual guests', d.wedding.actualGuests ?? '—'], ['Extra guests', d.wedding.extraGuests], ['Rate per plate', auto ? inr(auto.unitPrice) : '—']].map(([l, v]) => <div key={l as string} className="rounded-xl bg-surface-2 py-3"><p className="num text-2xl">{v}</p><p className="text-xs text-ink-soft">{l}</p></div>)}
        </div>
        <p className="text-sm mt-4 text-center">
          {auto ? <>{toNum(auto.quantity)} × {inr(auto.unitPrice)} = <span className="num text-lg text-burgundy">{inr(auto.amount)}</span> <span className="text-ink-soft">additional catering charge, auto-calculated{auto.approved ? '' : ' (pending approval)'}</span></>
            : <span className="text-ink-soft">{d.wedding.extraGuests > 0 ? 'No catering rate on file for the selected caterer.' : 'No extra guests recorded. Set the actual guest count in the Command Centre.'}</span>}
        </p>
      </Card>

      <div className="grid lg:grid-cols-[360px_1fr] gap-5">
        <Card title="Client billing">
          <Row l="Original agreement" v={inr(d.clientBilling.original)} /><Row l="Approved additional charges" v={inr(d.clientBilling.approvedExtras)} /><Row l="Final amount" v={inr(d.clientBilling.finalAmount)} strong /><Row l="Amount received" v={inr(d.clientBilling.received)} /><Row l="Outstanding balance" v={inr(d.clientBilling.outstanding)} strong />
          {toNum(d.pendingChargesTotal) > 0 && <p className="text-xs text-warning mt-2">{inr(d.pendingChargesTotal)} of charges still awaiting approval.</p>}
          <a className="btn-secondary btn-sm w-full mt-4" href={apiUrl(`/weddings/${weddingId}/reconciliation/statement`)} target="_blank" rel="noreferrer"><FileDown className="h-4 w-4" />Download statement (PDF)</a>
        </Card>
        <Card title="Additional charges" action={<Can roles={['PLANNER','EVENT_MANAGER','FINANCE'] as const}><button className="btn-secondary btn-sm" onClick={() => setCharge(true)} disabled={d.status === 'CLOSED'}><Plus className="h-4 w-4" />Add charge</button></Can>} pad={false}>
          {d.charges.length === 0 ? <EmptyState title="No additional charges" /> : <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Charge</th><th className="th text-right">Qty × rate</th><th className="th text-right">Amount</th><th className="th">Status</th><th className="th" /></tr></thead><tbody>
            {d.charges.map((c) => <tr key={c.id}><td className="td"><p className="font-medium">{c.description}</p><p className="text-xs text-ink-soft">{humanize(c.type)}{c.vendorName ? ` · ${c.vendorName}` : ''}{c.auto ? ' · auto-calculated' : ''}{c.billToClient ? ' · billed to client' : ''}</p></td><td className="td text-right tabular-nums text-ink-soft">{toNum(c.quantity)} × {inr(c.unitPrice)}</td><td className="td text-right num">{inr(c.amount)}</td><td className="td"><StatusBadge status={c.approved ? 'APPROVED' : 'PENDING'} /></td><td className="td text-right">{!c.approved ? <Can roles={G.FINANCE_WRITE}><button disabled={busy} className="btn-secondary btn-sm" onClick={() => approve(c, true)}><Check className="h-3.5 w-3.5" />Approve</button></Can> : <Can roles={G.FINANCE_WRITE}><button disabled={busy} className="btn-ghost btn-sm" onClick={() => approve(c, false)}>Withdraw</button></Can>}</td></tr>)}
          </tbody></table></div>}
        </Card>
      </div>

      <Card title="Vendor settlement" action={<span className="text-xs text-ink-soft">Remaining payable <span className="num text-ink">{inr(d.vendorTotals.remainingPayable)}</span></span>} pad={false}>
        {d.vendors.length === 0 ? <EmptyState title="No vendors to settle" /> : <div className="overflow-x-auto"><table className="w-full min-w-[960px]"><thead><tr><th className="th">Vendor</th><th className="th text-right">Quoted</th><th className="th text-right">Negotiated</th><th className="th text-right">Advance</th><th className="th text-right">Extras</th><th className="th text-right">Final bill</th><th className="th text-right">Paid</th><th className="th text-right">Remaining</th><th className="th">Status</th><th className="th" /></tr></thead><tbody>
          {d.vendors.map((v) => <tr key={v.settlementId}><td className="td"><p className="font-medium">{v.vendor.name}</p><p className="text-xs text-ink-soft">{humanize(v.category)}{v.invoiceRef ? ` · ${v.invoiceRef}` : ''}</p></td><td className="td text-right tabular-nums">{inr(v.original)}</td><td className="td text-right tabular-nums">{inr(v.negotiated)}</td><td className="td text-right tabular-nums">{inr(v.advance)}</td><td className="td text-right tabular-nums">{inr(v.approvedExtras)}</td><td className="td text-right tabular-nums">{v.invoiceEntered ? inr(v.finalBill) : <Can roles={G.FINANCE_WRITE}><button className="text-burgundy text-xs hover:underline" onClick={() => setInvoice(v)}>Enter invoice</button></Can>}</td><td className="td text-right tabular-nums">{inr(v.paid)}</td><td className="td text-right num">{inr(v.remainingPayable)}</td><td className="td"><StatusBadge status={v.status} /></td><td className="td text-right whitespace-nowrap">{v.invoiceEntered && v.status !== 'SETTLED' && toNum(v.remainingPayable) > 0 && <Can roles={G.FINANCE_WRITE}><button className="btn-primary btn-sm" onClick={() => setSettle(v)}>Settle</button></Can>}{v.invoiceEntered && v.status !== 'SETTLED' && <Can roles={G.FINANCE_WRITE}><button className="btn-ghost btn-sm" onClick={() => setInvoice(v)}>Edit invoice</button></Can>}</td></tr>)}
        </tbody></table></div>}
      </Card>
      <ChargeModal weddingId={weddingId} vendors={d.vendors} open={charge} onClose={() => setCharge(false)} onSaved={r.reload} />
      <InvoiceModal v={invoice} onClose={() => setInvoice(null)} onSaved={r.reload} />
      <SettleModal v={settle} reconId={d.reconciliationId} onClose={() => setSettle(null)} onSaved={r.reload} />
    </div>
  );
}
