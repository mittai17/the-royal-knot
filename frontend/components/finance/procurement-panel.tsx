'use client';
import { useState } from 'react';
import { Award } from 'lucide-react';
import { Card, EmptyState, Modal, StatusBadge } from '@/components/ui/primitives';
import { Segmented, Select } from '@/components/shared/form-bits';
import { Can } from '@/components/shared/can';
import { BusyButton, D, Muted, Pager, PdfLink, SimpleTable, usePaged } from '@/components/finance/fin-bits';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useWedding } from '@/lib/wedding-context';
import { notify } from '@/lib/toast';
import { humanize, inr } from '@/lib/utils';
import type { Money } from '@/types';

type Tab = 'rfqs' | 'comparison' | 'pos';
interface Rfq { rfqGroup: string; weddingId: string; wedding: { name: string }; category: string; title: string; createdAt: string; invited: number; received: number; status: string; winnerQuotationId?: string | null; purchaseOrder?: { id: string; poNumber: string } | null; requests: { id: string; vendor: { name: string }; status: string; grandTotal?: Money | null }[] }
interface Cmp { rfqGroup: string | null; title?: string; decided?: boolean; groups: Rfq[]; quotations: { quotationId: string; requestStatus: string; vendor: { name: string; rating: number }; grandTotal: Money; pricePerPlate?: Money | null; includedCount: number; score?: number | { total?: number }; flags: { lowest: boolean; bestValue: boolean; recommended: boolean } }[]; pending: { requestId: string; vendor: { name: string } }[] }
interface Po { id: string; poNumber: string; status: string; total: Money; expectedBy?: string | null; issuedAt?: string | null; wedding: { name: string }; vendor: { name: string }; terms?: string | null; lines: { id: string; description: string; quantity: Money; unit: string; unitPrice: Money; total: Money }[]; subtotal: Money; taxTotal: Money; bills?: { id: string; billNo: string; status: string; total: Money }[] }

function PoDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const d = useApi<Po>(id ? `/procurement/purchase-orders/${id}` : null);
  const [busy, setBusy] = useState('');
  const po = d.data;
  const act = async (k: 'send' | 'accept' | 'fulfil' | 'cancel') => {
    if (k === 'cancel' && !confirm('Cancel this purchase order?')) return;
    setBusy(k);
    try { await api.post(`/procurement/purchase-orders/${id}/${k}`, {}); notify.ok('Purchase order updated'); d.reload(); onChanged(); } catch (e) { notify.err(e); } finally { setBusy(''); }
  };
  return (
    <Modal open={!!id} onClose={onClose} side width="max-w-lg" title={po?.poNumber ?? 'Purchase order'}>
      {d.error ? <p className="text-sm text-danger">{d.error}</p> : !po ? <p className="text-sm text-ink-soft">Loading…</p> : (
        <div className="space-y-5">
          <div className="flex justify-between items-start"><div><StatusBadge status={po.status} /><p className="mt-2 font-medium">{po.vendor.name}</p><Muted>{po.wedding.name} · expected <D v={po.expectedBy} /></Muted></div><PdfLink href={`/procurement/purchase-orders/${po.id}/pdf`} /></div>
          <table className="w-full text-sm"><thead><tr className="text-xs text-ink-soft text-left"><th className="py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Total</th></tr></thead>
            <tbody>{po.lines.map((l) => <tr key={l.id} className="border-t border-line"><td className="py-1.5">{l.description}<Muted>{inr(l.unitPrice)} / {l.unit}</Muted></td><td className="text-right tabular-nums">{Number(l.quantity)}</td><td className="text-right tabular-nums">{inr(l.total)}</td></tr>)}</tbody></table>
          <dl className="rounded-xl bg-surface-2 p-4 text-sm space-y-1.5"><div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular-nums">{inr(po.subtotal)}</dd></div><div className="flex justify-between"><dt className="text-ink-soft">Tax</dt><dd className="tabular-nums">{inr(po.taxTotal)}</dd></div><div className="flex justify-between font-medium border-t border-line pt-2"><dt>Total</dt><dd className="tabular-nums">{inr(po.total)}</dd></div></dl>
          {po.terms && <p className="text-sm text-ink-soft whitespace-pre-wrap">{po.terms}</p>}
          {!!po.bills?.length && <div><p className="label">Vendor bills</p><ul className="text-sm divide-y divide-line">{po.bills.map((b) => <li key={b.id} className="py-1.5 flex justify-between"><span>{b.billNo}</span><span className="flex gap-2"><span className="tabular-nums">{inr(b.total)}</span><StatusBadge status={b.status} /></span></li>)}</ul></div>}
          <Can roles={['PLANNER', 'FINANCE']}>
            <div className="flex flex-wrap gap-2">
              {po.status === 'DRAFT' && <BusyButton busy={busy === 'send'} onClick={() => act('send')}>Issue to vendor</BusyButton>}
              {po.status === 'SENT' && <BusyButton className="btn-secondary" busy={busy === 'accept'} onClick={() => act('accept')}>Mark accepted</BusyButton>}
              {po.status === 'ACCEPTED' && <BusyButton busy={busy === 'fulfil'} onClick={() => act('fulfil')}>Mark fulfilled</BusyButton>}
              {['DRAFT', 'SENT', 'ACCEPTED'].includes(po.status) && <BusyButton className="btn-ghost text-danger" busy={busy === 'cancel'} onClick={() => act('cancel')}>Cancel</BusyButton>}
            </div>
          </Can>
        </div>
      )}
    </Modal>
  );
}

export function ProcurementPanel() {
  const { weddings, selectedId } = useWedding();
  const [tab, setTab] = useState<Tab>('rfqs');
  const [cmp, setCmp] = useState<{ weddingId: string; rfqGroup?: string }>({ weddingId: selectedId ?? '' });
  const [poId, setPoId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [poStatus, setPoStatus] = useState('');
  const rfqs = useApi<Rfq[]>(tab === 'rfqs' ? '/procurement/rfqs' : null);
  const comp = useApi<Cmp>(tab === 'comparison' && cmp.weddingId ? '/procurement/comparison' : null, { weddingId: cmp.weddingId, rfqGroup: cmp.rfqGroup });
  const pos = usePaged<Po, { summary?: { counts: Record<string, number>; value: Money } }>(tab === 'pos' ? '/procurement/purchase-orders' : null, { status: poStatus || undefined }, 15);

  const createPo = async (quotationId: string) => {
    setBusy(quotationId);
    try { const r = await api.post<Po>('/procurement/purchase-orders', { quotationId }); notify.ok(`${r.data.poNumber} created`); setTab('pos'); setPoId(r.data.id); rfqs.reload(); pos.reload(); } catch (e) { notify.err(e); } finally { setBusy(''); }
  };
  const c = comp.data;
  return (
    <>
      <Card pad={false} title={<Segmented value={tab} onChange={setTab} options={[{ v: 'rfqs', l: 'RFQs' }, { v: 'comparison', l: 'Quotation comparison' }, { v: 'pos', l: 'Purchase orders' }]} />}
        action={tab === 'pos' ? <Select className="!w-44" value={poStatus} onChange={(v) => { setPoStatus(v); pos.setPage(1); }} placeholder="All statuses" options={['DRAFT', 'SENT', 'ACCEPTED', 'FULFILLED', 'CANCELLED']} /> : undefined}>
        <div className="pt-1">
          {tab === 'rfqs' && (
            <SimpleTable head={['RFQ', 'Wedding', 'Category', 'Quotes', 'Status', 'Purchase order', '']} loading={rfqs.loading} error={rfqs.error} onRetry={rfqs.reload} empty={!rfqs.data?.length}>
              {rfqs.data?.map((r) => (
                <tr key={r.rfqGroup}>
                  <td className="td font-medium">{r.title}<Muted><D v={r.createdAt} /></Muted></td><td className="td">{r.wedding.name}</td><td className="td">{humanize(r.category)}</td>
                  <td className="td tabular-nums">{r.received} / {r.invited}</td><td className="td"><StatusBadge status={r.status === 'DECIDED' ? 'CONFIRMED' : r.status === 'READY_TO_COMPARE' ? 'RECEIVED' : 'PENDING'} />
                    <Muted>{humanize(r.status)}</Muted></td>
                  <td className="td">{r.purchaseOrder ? <button className="text-burgundy text-sm" onClick={() => { setTab('pos'); setPoId(r.purchaseOrder!.id); }}>{r.purchaseOrder.poNumber}</button> : '—'}</td>
                  <td className="td text-right whitespace-nowrap">
                    <button className="btn-secondary btn-sm" onClick={() => { setCmp({ weddingId: r.weddingId, rfqGroup: r.rfqGroup }); setTab('comparison'); }}>Compare</button>{' '}
                    {r.winnerQuotationId && !r.purchaseOrder && <Can roles={['PLANNER', 'FINANCE']}><BusyButton className="btn-primary btn-sm" busy={busy === r.winnerQuotationId} onClick={() => createPo(r.winnerQuotationId!)}>Create PO</BusyButton></Can>}
                  </td>
                </tr>
              ))}
            </SimpleTable>
          )}
          {tab === 'comparison' && (
            <div className="px-5 pb-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
                <Select value={cmp.weddingId} onChange={(v) => setCmp({ weddingId: v })} placeholder="Select wedding" options={weddings.map((w) => ({ v: w.id, l: w.name }))} />
                <Select value={cmp.rfqGroup ?? c?.rfqGroup ?? ''} onChange={(v) => setCmp({ ...cmp, rfqGroup: v })} placeholder="Latest RFQ" options={(c?.groups ?? []).map((g) => ({ v: g.rfqGroup, l: `${humanize(g.category)} · ${g.title}` }))} />
              </div>
              {!cmp.weddingId ? <EmptyState title="Choose a wedding" hint="Pick a wedding to compare its vendor quotations." /> : comp.error ? <p className="text-sm text-danger">{comp.error}</p> : comp.loading ? <p className="text-sm text-ink-soft">Loading…</p> : !c?.quotations.length ? <EmptyState title="No quotations to compare" hint="Quotes appear once vendors have submitted for this RFQ." /> : (
                <SimpleTable head={['Vendor', 'Rating', 'Grand total', 'Per plate', 'Included lines', 'Verdict', '']} minWidth={680}>
                  {c.quotations.map((q) => (
                    <tr key={q.quotationId}>
                      <td className="td font-medium">{q.vendor.name}</td><td className="td">{q.vendor.rating.toFixed(1)}</td><td className="td tabular-nums">{inr(q.grandTotal)}</td><td className="td tabular-nums">{q.pricePerPlate ? inr(q.pricePerPlate) : '—'}</td><td className="td">{q.includedCount}</td>
                      <td className="td"><span className="flex flex-wrap gap-1">{q.flags.lowest && <StatusBadge status="Lowest" tone="success" />}{q.flags.bestValue && <StatusBadge status="Best value" tone="info" />}{q.flags.recommended && <StatusBadge status="Recommended" tone="gold" />}{q.requestStatus === 'ACCEPTED' && <StatusBadge status="Selected" tone="burgundy" />}</span></td>
                      <td className="td text-right">{q.requestStatus === 'ACCEPTED' && <Can roles={['PLANNER', 'FINANCE']}><BusyButton className="btn-primary btn-sm" busy={busy === q.quotationId} onClick={() => createPo(q.quotationId)}><Award className="h-3.5 w-3.5" />Create PO</BusyButton></Can>}</td>
                    </tr>
                  ))}
                </SimpleTable>
              )}
              {c && !c.decided && !!c.quotations.length && <p className="text-xs text-ink-soft">Select the winning vendor in Quotations & RFQs first; a purchase order can only be raised from the selected quotation.</p>}
            </div>
          )}
          {tab === 'pos' && (
            <>
              <SimpleTable head={['PO number', 'Vendor', 'Wedding', 'Issued', 'Expected by', 'Total', 'Status']} loading={pos.loading && !pos.rows.length} error={pos.error} onRetry={pos.reload} empty={!pos.rows.length}>
                {pos.rows.map((r) => <tr key={r.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setPoId(r.id)}><td className="td font-medium">{r.poNumber}</td><td className="td">{r.vendor.name}</td><td className="td">{r.wedding.name}</td><td className="td"><D v={r.issuedAt} /></td><td className="td"><D v={r.expectedBy} /></td><td className="td tabular-nums">{inr(r.total)}</td><td className="td"><StatusBadge status={r.status} /></td></tr>)}
              </SimpleTable>
              <Pager p={pos} />
            </>
          )}
        </div>
      </Card>
      <PoDrawer id={poId} onClose={() => setPoId(null)} onChanged={() => { pos.reload(); rfqs.reload(); }} />
    </>
  );
}
