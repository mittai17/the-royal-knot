'use client';
import { useMemo, useState } from 'react';
import { Award, CheckCircle2, Sparkles, TrendingDown, Pencil, X, Loader2, AlertTriangle } from 'lucide-react';
import { Modal, StatusBadge } from '@/components/ui/primitives';
import { Rating } from '@/components/vendors/rating';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { cn, inr, toNum } from '@/lib/utils';
import type { CompareQuote, Comparison as Cmp, QuoteTarget } from '@/types';

function Badges({ f }: { f: CompareQuote['flags'] }) {
  return (
    <div className="flex flex-wrap gap-1 min-h-[22px]">
      {f.lowest && <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-info-soft text-info"><TrendingDown className="h-3 w-3" />Lowest total</span>}
      {f.bestValue && <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-gold-soft text-[#8A6B2E]"><Award className="h-3 w-3" />Best value</span>}
      {f.recommended && <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-success-soft text-success"><Sparkles className="h-3 w-3" />Recommended</span>}
    </div>
  );
}

export function Comparison({ data, onEnter, onChanged }: { data: Cmp; onEnter: (t: QuoteTarget) => void; onChanged: () => void }) {
  const [confirm, setConfirm] = useState<CompareQuote | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const quotes = data.quotations;
  const names = useMemo(() => { const s = new Set<string>(); quotes.forEach((q) => q.items.forEach((i) => s.add(i.name))); return [...s]; }, [quotes]);
  const isCatering = data.category === 'CATERING';
  const target = (q: CompareQuote): QuoteTarget => ({ requestId: q.requestId, vendorName: q.vendor.name, category: data.category, expectedGuests: data.expectedGuests, quote: q });

  const select = async () => {
    if (!confirm) return;
    setBusy(true);
    try { await api.post(`/quotations/${confirm.quotationId}/select`, { note: note || undefined }); notify.ok(`${confirm.vendor.name} selected; other requests closed`); setConfirm(null); setNote(''); onChanged(); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr><th className="w-[200px] bg-surface-2/60 border-b border-line" />
              {quotes.map((q) => (
                <th key={q.quotationId} className={cn('text-left align-top p-4 border-b border-line min-w-[230px]', q.requestStatus === 'ACCEPTED' ? 'bg-success-soft/60' : q.requestStatus === 'NOT_SELECTED' ? 'bg-surface-2/60 opacity-70' : q.flags.recommended ? 'bg-gold-soft/50' : 'bg-surface-2/60')}>
                  <div className="flex items-start justify-between gap-2"><div><p className="font-serif text-base text-burgundy-deep font-normal">{q.vendor.name}</p><Rating value={q.vendor.rating} /></div><StatusBadge status={q.requestStatus} /></div>
                  <div className="mt-2"><Badges f={q.flags} /></div>
                </th>
              ))}
              {data.pending.map((p) => (
                <th key={p.requestId} className="text-left align-top p-4 border-b border-line min-w-[200px] bg-surface-2/40">
                  <p className="font-serif text-base text-burgundy-deep font-normal">{p.vendor.name}</p><p className="text-xs text-ink-soft mt-1">Awaiting quotation</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {names.map((n) => (
              <tr key={n}><td className="td font-medium text-ink-soft">{n}</td>
                {quotes.map((q) => { const it = q.items.find((i) => i.name === n); return (
                  <td key={q.quotationId} className="td">{!it ? <span className="text-ink-soft">—</span> : (
                    <div className={cn(!it.included && 'text-ink-soft')}>
                      <p className="tabular-nums">{inr(it.total ?? toNum(it.quantity) * toNum(it.unitPrice))}</p>
                      <p className="text-xs text-ink-soft">{toNum(it.quantity)} {it.unit} × {inr(it.unitPrice)}{toNum(it.taxRate) ? ` + ${toNum(it.taxRate)}% tax` : ''}</p>
                      {!it.included && <span className="text-[11px] text-danger">Excluded</span>}
                    </div>)}</td>); })}
                {data.pending.map((p) => <td key={p.requestId} className="td text-ink-soft">—</td>)}
              </tr>
            ))}
            {isCatering && <>
              <tr><td className="td font-medium text-ink-soft">Menu</td>{quotes.map((q) => <td key={q.quotationId} className="td text-xs">{q.menu ?? '—'}</td>)}{data.pending.map((p) => <td key={p.requestId} className="td" />)}</tr>
              <tr><td className="td font-medium text-ink-soft">Guest capacity</td>{quotes.map((q) => <td key={q.quotationId} className="td tabular-nums"><span className="inline-flex items-center gap-1.5">{q.guestCapacity ?? '—'}{!q.capacityOk && <span title={`Below expected ${data.expectedGuests} guests`}><AlertTriangle className="h-3.5 w-3.5 text-danger" /></span>}</span></td>)}{data.pending.map((p) => <td key={p.requestId} className="td" />)}</tr>
              <tr><td className="td font-medium text-ink-soft">Extra-hour charge</td>{quotes.map((q) => <td key={q.quotationId} className="td tabular-nums">{q.extraHourCharge ? inr(q.extraHourCharge) : '—'}</td>)}{data.pending.map((p) => <td key={p.requestId} className="td" />)}</tr>
            </>}
            {([['Subtotal', 'subtotal'], ['Taxes', 'taxTotal'], ['Additional charges', 'additionalTotal']] as const).map(([l, k]) => (
              <tr key={k}><td className="td text-ink-soft">{l}</td>{quotes.map((q) => <td key={q.quotationId} className="td tabular-nums">{inr(q[k])}</td>)}{data.pending.map((p) => <td key={p.requestId} className="td" />)}</tr>
            ))}
            <tr><td className="td font-semibold bg-surface-2/40">Grand total</td>{quotes.map((q) => <td key={q.quotationId} className={cn('td bg-surface-2/40', q.flags.lowest && 'text-info')}><span className="num text-lg">{inr(q.grandTotal)}</span></td>)}{data.pending.map((p) => <td key={p.requestId} className="td bg-surface-2/40" />)}</tr>
            {isCatering && <tr><td className="td text-ink-soft">Price per plate</td>{quotes.map((q) => <td key={q.quotationId} className="td tabular-nums">{q.pricePerPlate ? inr(q.pricePerPlate) : '—'}</td>)}{data.pending.map((p) => <td key={p.requestId} className="td" />)}</tr>}
            <tr><td className="p-4" />
              {quotes.map((q) => (
                <td key={q.quotationId} className="p-4">
                  {q.requestStatus === 'ACCEPTED' ? <span className="inline-flex items-center gap-1.5 text-success text-sm font-medium"><CheckCircle2 className="h-4 w-4" />Selected</span>
                    : q.requestStatus === 'NOT_SELECTED' ? <span className="inline-flex items-center gap-1.5 text-ink-soft text-sm"><X className="h-4 w-4" />Not selected</span>
                    : <div className="flex gap-2"><button className="btn-secondary btn-sm" onClick={() => onEnter(target(q))}><Pencil className="h-3.5 w-3.5" />Edit</button>{!data.decided && <button className="btn-primary btn-sm" onClick={() => setConfirm(q)}>Select</button>}</div>}
                </td>))}
              {data.pending.map((p) => <td key={p.requestId} className="p-4">{p.status === 'NOT_SELECTED' ? <span className="text-ink-soft text-sm">Closed</span> : <button className="btn-secondary btn-sm" onClick={() => onEnter({ requestId: p.requestId, vendorName: p.vendor.name, category: data.category, expectedGuests: data.expectedGuests })}><Pencil className="h-3.5 w-3.5" />Enter quote</button>}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <details className="text-xs text-ink-soft mt-3 px-4 pb-4"><summary className="cursor-pointer">How highlights are calculated</summary><ul className="mt-2 space-y-1 list-disc pl-5"><li><b>Lowest total:</b> {data.scoring.lowest}</li><li><b>Best value:</b> {data.scoring.bestValue}</li><li><b>Recommended:</b> {data.scoring.recommended}</li></ul></details>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Confirm vendor selection" width="max-w-md"
        footer={<><button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={select}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Select {confirm?.vendor.name}</button></>}>
        <div className="space-y-3 text-sm">
          <p>You are selecting <strong>{confirm?.vendor.name}</strong> at <strong>{confirm ? inr(confirm.grandTotal) : ''}</strong>.</p>
          <ul className="list-disc pl-5 text-ink-soft space-y-1"><li>This quotation is marked <b>Accepted</b>.</li><li>All other requests in this group close as <b>Not Selected</b>.</li><li>The vendor is assigned to the wedding.</li><li>Every quotation and this decision are preserved.</li></ul>
          {confirm && !confirm.flags.lowest && <p className="rounded-lg bg-warning-soft text-[#8A5A12] p-3 text-xs">This is not the lowest quote. Make sure the extra cost is justified.</p>}
          {confirm && !confirm.capacityOk && <p className="rounded-lg bg-danger-soft text-danger p-3 text-xs">This caterer’s guest capacity is below the expected guest count.</p>}
          <input className="input" placeholder="Decision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
