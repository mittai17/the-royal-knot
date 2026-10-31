'use client';
import { useState } from 'react';
import { Banknote, Clock, Receipt, Upload } from 'lucide-react';
import { Card, Field, Modal, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Segmented, Select } from '@/components/shared/form-bits';
import { BusyButton, D, Muted, SimpleTable } from '@/components/finance/fin-bits';
import { useApi } from '@/hooks/use-api';
import { api, apiUrl } from '@/lib/api';
import { notify } from '@/lib/toast';
import { humanize, inr } from '@/lib/utils';
import type { Money } from '@/types';

interface Item { id: string; billNo: string; status: string; billDate: string; dueDate?: string | null; total: Money; amountPaid: Money; outstanding: Money; hasFile: boolean; notes?: string | null; wedding?: { name: string } | null; purchaseOrder?: { poNumber: string } | null }
interface Data { items: Item[]; purchaseOrders: { id: string; poNumber: string; total: Money; weddingId: string; wedding: { name: string } }[]; weddings: { id: string; name: string }[]; summary: { submitted: number; pending: number; approved: number; overdue: number; outstanding: Money; paid: Money } }
interface Pays { items: { id: string; kind: string; amount: Money; method: string; reference?: string | null; paidAt: string; wedding: { name: string }; category: string }[]; total: Money }
interface Settle { items: { weddingVendorId: string; wedding: { name: string }; category: string; contract: Money; billed: Money; paid: Money; remaining: Money; status: string }[]; totals: { billed: Money; paid: Money; remaining: Money } }

function UploadModal({ data, open, onClose, onSaved }: { data: Data | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ billNo: '', weddingId: '', purchaseOrderId: '', subtotal: '', taxTotal: '', billDate: '', dueDate: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => v && fd.append(k, v));
      if (file) fd.append('file', file);
      await api.upload('/portal/vendor/invoices', fd);
      notify.ok('Invoice submitted to Finance'); setF({ billNo: '', weddingId: '', purchaseOrderId: '', subtotal: '', taxTotal: '', billDate: '', dueDate: '', notes: '' }); setFile(null); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  const pickPo = (id: string) => { const po = data?.purchaseOrders.find((p) => p.id === id); setF({ ...f, purchaseOrderId: id, weddingId: po?.weddingId ?? f.weddingId }); };
  return (
    <Modal open={open} onClose={onClose} title="Upload invoice" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><BusyButton busy={busy} disabled={!f.billNo.trim() || !(Number(f.subtotal) > 0)} onClick={save}><Upload className="h-4 w-4" />Submit</BusyButton></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Invoice number"><input className="input" value={f.billNo} onChange={(e) => setF({ ...f, billNo: e.target.value })} /></Field>
        <Field label="Invoice date"><input className="input" type="date" value={f.billDate} onChange={(e) => setF({ ...f, billDate: e.target.value })} /></Field>
        <Field label="Purchase order" className="col-span-2"><Select value={f.purchaseOrderId} onChange={pickPo} placeholder="Not against a purchase order" options={(data?.purchaseOrders ?? []).map((p) => ({ v: p.id, l: `${p.poNumber} · ${p.wedding.name} · ${inr(p.total)}` }))} /></Field>
        <Field label="Wedding" className="col-span-2"><Select value={f.weddingId} onChange={(v) => setF({ ...f, weddingId: v })} placeholder="Select wedding" options={(data?.weddings ?? []).map((w) => ({ v: w.id, l: w.name }))} /></Field>
        <Field label="Amount before tax (₹)"><input className="input" type="number" min={0} value={f.subtotal} onChange={(e) => setF({ ...f, subtotal: e.target.value })} /></Field>
        <Field label="GST (₹)"><input className="input" type="number" min={0} value={f.taxTotal} onChange={(e) => setF({ ...f, taxTotal: e.target.value })} /></Field>
        <Field label="Payment due by"><input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        <Field label="Invoice file (PDF or image)"><input className="input !h-auto py-1.5" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <Field label="Notes" className="col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function VendorInvoicesPanel() {
  const [tab, setTab] = useState<'invoices' | 'payments' | 'settlement'>('invoices');
  const [up, setUp] = useState(false);
  const inv = useApi<Data>('/portal/vendor/invoices');
  const pays = useApi<Pays>(tab === 'payments' ? '/portal/vendor/invoices/payments' : null);
  const set = useApi<Settle>(tab === 'settlement' ? '/portal/vendor/invoices/settlement' : null);
  const s = inv.data?.summary;
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard label="Invoices submitted" value={s?.submitted ?? '—'} icon={<Receipt className="h-5 w-5" />} />
        <StatCard label="Awaiting review" value={s?.pending ?? '—'} hint={s ? `${s.approved} approved` : undefined} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Outstanding" value={inr(s?.outstanding ?? 0)} hint={s ? `${s.overdue} overdue` : undefined} icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Paid to you" value={inr(s?.paid ?? 0)} icon={<Banknote className="h-5 w-5" />} />
      </div>
      <Card pad={false} title={<Segmented value={tab} onChange={setTab} options={[{ v: 'invoices', l: 'My invoices' }, { v: 'payments', l: 'Payment history' }, { v: 'settlement', l: 'Settlement' }]} />}
        action={<button className="btn-primary" onClick={() => setUp(true)}><Upload className="h-4 w-4" />Upload invoice</button>}>
        <div className="pt-1">
          {tab === 'invoices' && (
            <SimpleTable head={['Invoice', 'Wedding / PO', 'Date', 'Due', 'Amount', 'Paid', 'Status', '']} loading={inv.loading && !inv.data} error={inv.error} onRetry={inv.reload} empty={!inv.data?.items.length}>
              {inv.data?.items.map((r) => (
                <tr key={r.id}><td className="td font-medium">{r.billNo}</td><td className="td">{r.wedding?.name ?? '—'}{r.purchaseOrder && <Muted>{r.purchaseOrder.poNumber}</Muted>}</td><td className="td"><D v={r.billDate} /></td><td className="td"><D v={r.dueDate} /></td>
                  <td className="td tabular-nums">{inr(r.total)}</td><td className="td tabular-nums">{inr(r.amountPaid)}</td><td className="td"><StatusBadge status={r.status} /></td>
                  <td className="td text-right">{r.hasFile && <a className="text-xs text-burgundy" href={apiUrl(`/portal/vendor/invoices/${r.id}/file`)} download>File</a>}</td></tr>
              ))}
            </SimpleTable>
          )}
          {tab === 'payments' && (
            <SimpleTable head={['Date', 'Wedding', 'Type', 'Method', 'Reference', 'Amount']} loading={pays.loading} error={pays.error} onRetry={pays.reload} empty={!pays.data?.items.length}>
              {pays.data?.items.map((r) => <tr key={r.id}><td className="td"><D v={r.paidAt} /></td><td className="td">{r.wedding.name}<Muted>{humanize(r.category)}</Muted></td><td className="td">{humanize(r.kind)}</td><td className="td">{humanize(r.method)}</td><td className="td">{r.reference ?? '—'}</td><td className="td tabular-nums">{inr(r.amount)}</td></tr>)}
            </SimpleTable>
          )}
          {tab === 'settlement' && (
            <SimpleTable head={['Wedding', 'Service', 'Contract', 'Billed', 'Paid', 'Remaining', 'Status']} loading={set.loading} error={set.error} onRetry={set.reload} empty={!set.data?.items.length}>
              {set.data?.items.map((r) => <tr key={r.weddingVendorId}><td className="td">{r.wedding.name}</td><td className="td">{humanize(r.category)}</td><td className="td tabular-nums">{inr(r.contract)}</td><td className="td tabular-nums">{inr(r.billed)}</td><td className="td tabular-nums">{inr(r.paid)}</td><td className="td tabular-nums">{inr(r.remaining)}</td><td className="td"><StatusBadge status={r.status} /></td></tr>)}
            </SimpleTable>
          )}
        </div>
      </Card>
      <UploadModal data={inv.data} open={up} onClose={() => setUp(false)} onSaved={inv.reload} />
    </>
  );
}
