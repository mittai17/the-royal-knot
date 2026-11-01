'use client';
import { useMemo, useState } from 'react';
import { Banknote, Clock, Plus, ReceiptText, Trash2, TriangleAlert } from 'lucide-react';
import { Card, Field, Modal, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { Can } from '@/components/shared/can';
import { BusyButton, D, Muted, Pager, PdfLink, SimpleTable, usePaged } from '@/components/finance/fin-bits';
import { useApi } from '@/hooks/use-api';
import { api, apiUrl } from "@/lib/api";
import { newKey } from '@/lib/idempotency';
import { useWedding } from '@/lib/wedding-context';
import { notify } from '@/lib/toast';
import { PAYMENT_METHODS } from '@/lib/enums';
import { fmtDateTime, humanize, inr, toNum, toInputDate } from '@/lib/utils';
import type { Money } from '@/types';

const STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];
interface Line { id?: string; description: string; quantity: Money; unitPrice: Money; taxRate: Money; total?: Money }
interface Inv { id: string; invoiceNo: string; status: string; weddingId: string; milestoneId?: string | null; issueDate: string; dueDate?: string | null; subtotal: Money; taxTotal: Money; discount: Money; total: Money; amountPaid: Money; outstanding: Money; notes?: string | null; lastReminderAt?: string | null; wedding: { id: string; name: string }; lines: Line[] }
interface Detail extends Inv { payments: { id: string; amount: Money; method: string; paidAt: string; receiptNo: string; reference?: string | null }[]; discountApproval?: { id: string; status: string } | null }
interface Summary { invoiced: Money; collected: Money; outstanding: Money; overdue: Money; counts: Record<string, number> }
interface Ms { id: string; type: string; outstanding: Money; status: string }

const calc = (lines: { quantity: string; unitPrice: string; taxRate: string }[], discount: number) => {
  const sub = lines.reduce((a, l) => a + Math.round(Number(l.quantity) * Number(l.unitPrice) * 100) / 100, 0);
  const tax = lines.reduce((a, l) => a + Math.round(Number(l.quantity) * Number(l.unitPrice) * Number(l.taxRate)) / 100, 0);
  return { sub, tax, total: sub + tax - discount };
};

function CreateModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { weddings, selectedId } = useWedding();
  const [weddingId, setWeddingId] = useState(selectedId ?? '');
  const [milestoneId, setMilestoneId] = useState('');
  const [lines, setLines] = useState([{ description: '', quantity: '1', unitPrice: '', taxRate: '18' }]);
  const [f, setF] = useState({ dueDate: toInputDate(new Date(Date.now() + 15 * 864e5).toISOString()), discount: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const pay = useApi<{ milestones: Ms[] }>(weddingId ? `/weddings/${weddingId}/payments` : null);
  const ms = (pay.data?.milestones ?? []).filter((m) => toNum(m.outstanding) > 0);
  const t = useMemo(() => calc(lines, Number(f.discount) || 0), [lines, f.discount]);
  const setLine = (i: number, k: string, v: string) => setLines(lines.map((l, x) => (x === i ? { ...l, [k]: v } : l)));
  const pickMilestone = (id: string) => {
    setMilestoneId(id);
    const m = ms.find((x) => x.id === id);
    if (m && !lines.some((l) => l.description)) setLines([{ description: `${humanize(m.type)} milestone payment`, quantity: '1', unitPrice: String(toNum(m.outstanding)), taxRate: '0' }]);
  };
  const valid = weddingId && lines.length && lines.every((l) => l.description.trim() && Number(l.quantity) > 0 && l.unitPrice !== '' && Number(l.unitPrice) >= 0) && t.total >= 0 && t.sub > 0;
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/invoices', { weddingId, milestoneId: milestoneId || undefined, dueDate: f.dueDate || undefined, discount: Number(f.discount) || undefined, notes: f.notes || undefined, lines: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate) || 0 })) });
      notify.ok('Draft invoice created'); setLines([{ description: '', quantity: '1', unitPrice: '', taxRate: '18' }]); setF({ ...f, discount: '', notes: '' }); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} width="max-w-3xl" title="New client invoice" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><BusyButton busy={busy} disabled={!valid} onClick={save}>Save as draft</BusyButton></>}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Wedding"><Select value={weddingId} onChange={(v) => { setWeddingId(v); setMilestoneId(''); }} placeholder="Select wedding" options={weddings.map((w) => ({ v: w.id, l: w.name }))} /></Field>
          <Field label="Payment milestone (optional)"><Select value={milestoneId} onChange={pickMilestone} placeholder="Not linked" options={ms.map((m) => ({ v: m.id, l: `${humanize(m.type)} · ${inr(m.outstanding)} due` }))} /></Field>
          <Field label="Due date"><input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_80px_120px_70px_32px] gap-2 text-xs text-ink-soft"><span>Description</span><span>Qty</span><span>Unit price</span><span>Tax %</span><span /></div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_80px_120px_70px_32px] gap-2">
              <input className="input col-span-2 sm:col-span-1" placeholder="Description" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} aria-label="Description" />
              <input className="input" type="number" min={0} value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} aria-label="Quantity" />
              <input className="input" type="number" min={0} value={l.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} aria-label="Unit price" />
              <input className="input" type="number" min={0} max={100} value={l.taxRate} onChange={(e) => setLine(i, 'taxRate', e.target.value)} aria-label="Tax percent" />
              <button className="btn-ghost btn-sm !px-2" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, x) => x !== i))} aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button className="text-xs text-burgundy" onClick={() => setLines([...lines, { description: '', quantity: '1', unitPrice: '', taxRate: '18' }])}>+ Add line</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-4">
            <Field label="Discount (₹) — needs Founder approval"><input className="input" type="number" min={0} value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
          <dl className="rounded-xl bg-surface-2 p-4 text-sm space-y-1.5 self-start">
            <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular-nums">{inr(t.sub)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Tax</dt><dd className="tabular-nums">{inr(t.tax)}</dd></div>
            {!!Number(f.discount) && <div className="flex justify-between"><dt className="text-ink-soft">Discount</dt><dd className="tabular-nums">− {inr(f.discount)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 font-medium"><dt>Total</dt><dd className={`tabular-nums ${t.total < 0 ? 'text-danger' : ''}`}>{inr(t.total)}</dd></div>
          </dl>
        </div>
      </div>
    </Modal>
  );
}

function PayModal({ inv, onClose, onSaved }: { inv: Detail | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ amount: '', method: 'BANK_TRANSFER', reference: '', paidAt: toInputDate(new Date().toISOString()), milestone: 'ADVANCE' });
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const out = toNum(inv?.outstanding), amt = Number(f.amount), over = amt > out + 0.001;
  const save = async () => {
    if (!inv) return; setBusy(true);
    try {
      await api.post(`/invoices/${inv.id}/payments`, { amount: amt, method: f.method, reference: f.reference || undefined, paidAt: f.paidAt, milestone: inv.milestoneId ? undefined : f.milestone, idempotencyKey: key });
      notify.ok('Payment recorded'); setKey(newKey()); setF({ ...f, amount: '', reference: '' }); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!inv} onClose={onClose} title={`Record payment · ${inv?.invoiceNo ?? ''}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><BusyButton busy={busy} disabled={!amt || amt <= 0 || over} onClick={save}>Record payment</BusyButton></>}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 rounded-xl bg-surface-2 p-4 grid grid-cols-2 text-sm"><div><p className="text-xs text-ink-soft">Invoice total</p><p className="num">{inr(inv?.total)}</p></div><div><p className="text-xs text-ink-soft">Outstanding</p><p className="num">{inr(out)}</p></div></div>
        <Field label="Amount (₹)" error={over ? 'Exceeds outstanding balance' : undefined}><input className="input" type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Payment date"><input className="input" type="date" value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></Field>
        <Field label="Method"><Select value={f.method} onChange={(v) => setF({ ...f, method: v })} options={PAYMENT_METHODS} /></Field>
        <Field label="Reference"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        {!inv?.milestoneId && <Field label="Counts toward milestone" className="col-span-2"><Select value={f.milestone} onChange={(v) => setF({ ...f, milestone: v })} options={['BOOKING', 'ADVANCE', 'FINAL']} /></Field>}
        <button className="text-xs text-burgundy text-left col-span-2" onClick={() => setF({ ...f, amount: String(out) })}>Fill full outstanding ({inr(out)})</button>
        <p className="text-xs text-ink-soft col-span-2">The payment is also recorded against the wedding’s payment milestone and gets a receipt. Retrying never records it twice.</p>
      </div>
    </Modal>
  );
}

function DetailDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const d = useApi<Detail>(id ? `/invoices/${id}` : null);
  const [busy, setBusy] = useState('');
  const [paying, setPaying] = useState(false);
  const i = d.data;
  const act = async (kind: 'send' | 'remind' | 'void') => {
    if (kind === 'void' && !confirm('Void this invoice? This cannot be undone.')) return;
    setBusy(kind);
    try { await api.post(`/invoices/${id}/${kind}`, {}); notify.ok({ send: 'Invoice sent', remind: 'Reminder sent', void: 'Invoice voided' }[kind]); d.reload(); onChanged(); } catch (e) { notify.err(e); } finally { setBusy(''); }
  };
  const open = i && ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status);
  return (
    <>
      <Modal open={!!id} onClose={onClose} side width="max-w-lg" title={i?.invoiceNo ?? 'Invoice'}>
        {d.error ? <p className="text-sm text-danger">{d.error}</p> : !i ? <p className="text-sm text-ink-soft">Loading…</p> : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-2"><div><StatusBadge status={i.status} /><p className="text-sm mt-2">{i.wedding.name}</p><Muted>Issued {fmtDateTime(i.issueDate).split(',')[0]} · due <D v={i.dueDate} /></Muted></div><PdfLink href={`/invoices/${i.id}/pdf`} /></div>
            <table className="w-full text-sm"><thead><tr className="text-xs text-ink-soft text-left"><th className="py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{i.lines.map((l) => <tr key={l.id} className="border-t border-line"><td className="py-1.5">{l.description}{toNum(l.taxRate) > 0 && <Muted>GST {toNum(l.taxRate)}%</Muted>}</td><td className="text-right tabular-nums">{toNum(l.quantity)}</td><td className="text-right tabular-nums">{inr(l.total)}</td></tr>)}</tbody></table>
            <dl className="rounded-xl bg-surface-2 p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular-nums">{inr(i.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Tax</dt><dd className="tabular-nums">{inr(i.taxTotal)}</dd></div>
              {toNum(i.discount) > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Discount {i.discountApproval && <StatusBadge status={i.discountApproval.status} />}</dt><dd className="tabular-nums">− {inr(i.discount)}</dd></div>}
              <div className="flex justify-between font-medium border-t border-line pt-2"><dt>Total</dt><dd className="tabular-nums">{inr(i.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Paid</dt><dd className="tabular-nums">{inr(i.amountPaid)}</dd></div>
              <div className="flex justify-between font-medium"><dt>Balance</dt><dd className="tabular-nums">{inr(i.outstanding)}</dd></div>
            </dl>
            {i.payments.length > 0 && <div><p className="label">Payments</p><ul className="text-sm divide-y divide-line">{i.payments.map((p) => <li key={p.id} className="py-1.5 flex justify-between"><span>{inr(p.amount)} · {humanize(p.method)}<Muted>{p.receiptNo} · <D v={p.paidAt} /></Muted></span><a className="text-xs text-burgundy" href={apiUrl(`/payments/${p.id}/receipt`)} target="_blank" rel="noreferrer">Receipt</a></li>)}</ul></div>}
            {i.lastReminderAt && <p className="text-xs text-ink-soft">Last reminder {fmtDateTime(i.lastReminderAt)}</p>}
            <Can roles={['FINANCE']}>
              <div className="flex flex-wrap gap-2">
                {i.status === 'DRAFT' && <BusyButton busy={busy === 'send'} onClick={() => act('send')}>Send invoice</BusyButton>}
                {open && <button className="btn-primary" onClick={() => setPaying(true)}><Banknote className="h-4 w-4" />Record payment</button>}
                {open && <BusyButton className="btn-secondary" busy={busy === 'remind'} onClick={() => act('remind')}>Send reminder</BusyButton>}
                {['DRAFT', 'SENT', 'OVERDUE'].includes(i.status) && toNum(i.amountPaid) === 0 && <BusyButton className="btn-ghost text-danger" busy={busy === 'void'} onClick={() => act('void')}>Void</BusyButton>}
              </div>
            </Can>
          </div>
        )}
      </Modal>
      <PayModal inv={paying ? i ?? null : null} onClose={() => setPaying(false)} onSaved={() => { d.reload(); onChanged(); }} />
    </>
  );
}

export function InvoicesPanel() {
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const p = usePaged<Inv, { summary?: Summary }>('/invoices', { status: status || undefined }, 15);
  const s = p.meta.summary;
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard label="Invoiced" value={inr(s?.invoiced ?? 0)} hint={s ? `${(s.counts.DRAFT ?? 0)} drafts` : undefined} icon={<ReceiptText className="h-5 w-5" />} />
        <StatCard label="Collected" value={inr(s?.collected ?? 0)} icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Outstanding" value={inr(s?.outstanding ?? 0)} hint={s ? `${(s.counts.SENT ?? 0) + (s.counts.PARTIALLY_PAID ?? 0)} open` : undefined} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Overdue" value={inr(s?.overdue ?? 0)} hint={s ? `${s.counts.OVERDUE ?? 0} invoices` : undefined} icon={<TriangleAlert className="h-5 w-5" />} />
      </div>
      <Card pad={false} title="Client invoices" action={<div className="flex flex-wrap gap-2 justify-end">
        <Select className="!w-44" value={status} onChange={(v) => { setStatus(v); p.setPage(1); }} placeholder="All statuses" options={STATUSES} />
        <input className="input !w-48" type="search" placeholder="Search invoice or wedding…" value={p.search} onChange={(e) => p.setSearch(e.target.value)} aria-label="Search invoices" />
        <Can roles={['FINANCE']}><button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New invoice</button></Can>
      </div>}>
        <div className="pt-1">
          <SimpleTable head={['Invoice', 'Wedding', 'Issued', 'Due', 'Total', 'Paid', 'Balance', 'Status']} loading={p.loading && !p.rows.length} error={p.error} onRetry={p.reload} empty={!p.rows.length}>
            {p.rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setOpenId(r.id)}>
                <td className="td font-medium whitespace-nowrap">{r.invoiceNo}</td><td className="td">{r.wedding.name}</td><td className="td"><D v={r.issueDate} /></td><td className="td"><D v={r.dueDate} /></td>
                <td className="td tabular-nums">{inr(r.total)}</td><td className="td tabular-nums">{inr(r.amountPaid)}</td><td className="td tabular-nums">{inr(r.outstanding)}</td><td className="td"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </SimpleTable>
          <Pager p={p} />
        </div>
      </Card>
      <CreateModal open={creating} onClose={() => setCreating(false)} onSaved={p.reload} />
      <DetailDrawer id={openId} onClose={() => setOpenId(null)} onChanged={p.reload} />
    </>
  );
}
