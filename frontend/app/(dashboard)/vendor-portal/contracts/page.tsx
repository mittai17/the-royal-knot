'use client';
import { FileSignature } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Async, FileLink } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { fmtDate, humanize, inr } from '@/lib/utils';

interface Data {
  contracts: { id: string; category: string; wedding: { name: string; venue?: string | null; location: string; startDate: string; endDate: string }; contractAmount: string; negotiatedAmount?: string | null; signedOffAt: string;
    quotation: { id: string; grandTotal: string; subtotal: string; taxTotal: string; menu?: string | null; notes?: string | null; items: { id: string; name: string; quantity: string; unit: string; unitPrice: string; included: boolean }[] } | null;
    payments: { id: string; kind: string; amount: string; paidAt: string }[] }[];
  documents: { id: string; name: string; createdAt: string; wedding?: { name: string } | null }[];
}

export default function Page() {
  const q = useApi<Data>('/portal/vendor/contracts');
  return (
    <div className="space-y-5">
      <PageHeader title="Agreements & Contracts" subtitle="Your confirmed contracts, scope and payment terms." />
      <Async q={q}>
        {(d) => (
          <>
            {d.contracts.length === 0 ? <Card><EmptyState title="No contracts yet" hint="A contract is created when your quotation is selected." /></Card> : d.contracts.map((c) => (
              <Card key={c.id} title={<span className="inline-flex items-center gap-2"><FileSignature className="h-4 w-4 text-burgundy" />{c.wedding.name} · {humanize(c.category)}</span>} action={c.quotation && <FileLink path={`/portal/vendor/quotations/${c.quotation.id}/pdf`} label="Quotation PDF" preview />}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><p className="text-xs text-ink-soft">Contract value</p><p className="num text-lg">{inr(c.negotiatedAmount ?? c.contractAmount)}</p></div>
                  <div><p className="text-xs text-ink-soft">Event dates</p><p>{fmtDate(c.wedding.startDate, 'dd MMM')} – {fmtDate(c.wedding.endDate)}</p></div>
                  <div><p className="text-xs text-ink-soft">Venue</p><p>{c.wedding.venue ?? c.wedding.location}</p></div>
                  <div><p className="text-xs text-ink-soft">Confirmed on</p><p>{fmtDate(c.signedOffAt)}</p></div>
                </div>
                {c.quotation && c.quotation.items.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[520px] text-sm"><thead><tr className="bg-surface-2/60 text-left text-[11px] uppercase tracking-wider text-ink-soft"><th className="px-3 py-2">Scope</th><th>Qty</th><th>Unit price</th><th>Included</th></tr></thead>
                    <tbody>{c.quotation.items.map((i) => <tr key={i.id} className="border-t border-line"><td className="px-3 py-2">{i.name}</td><td>{Number(i.quantity)} {i.unit}</td><td className="num">{inr(i.unitPrice)}</td><td>{i.included ? 'Yes' : 'Excluded'}</td></tr>)}</tbody></table></div>
                )}
                {c.payments.length > 0 && <p className="text-xs text-ink-soft mt-3">Payments received: {c.payments.map((p) => `${humanize(p.kind)} ${inr(p.amount)} (${fmtDate(p.paidAt)})`).join(' · ')}</p>}
              </Card>
            ))}
            {d.documents.length > 0 && (
              <Card title="Contract documents">
                <ul className="divide-y divide-line">{d.documents.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5"><div><p className="text-sm font-medium">{x.name}</p><p className="text-xs text-ink-soft">{x.wedding?.name ?? 'General'} · {fmtDate(x.createdAt)}</p></div><FileLink path={`/portal/vendor/documents/${x.id}/download`} /></li>)}</ul>
              </Card>
            )}
          </>
        )}
      </Async>
    </div>
  );
}
