'use client';
import { Phone, Mail, MapPin, Pencil } from 'lucide-react';
import { Modal, StatusBadge, Skeleton, ErrorState } from '@/components/ui/primitives';
import { Rating } from './rating';
import { useApi } from '@/hooks/use-api';
import { fmtDate, humanize, inr } from '@/lib/utils';
import type { Vendor } from '@/types';

interface Detail extends Vendor {
  weddingVendors?: { id: string; wedding: { id: string; name: string; startDate: string; status: string }; contractAmount: string; arrival?: { status: string; delayMinutes: number } | null; settlement?: { actualInvoice?: string | null } | null }[];
  performance?: { assignments: number; timelinessPct: number | null; avgDelayMinutes: number; costVariancePct: number | null };
}

export function VendorDetail({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (v: Vendor) => void }) {
  const { data: v, loading, error, reload } = useApi<Detail>(id ? `/vendors/${id}` : null);
  return (
    <Modal open={!!id} onClose={onClose} title={v?.name ?? 'Vendor'} side width="max-w-lg">
      {loading && <div className="space-y-3"><Skeleton className="h-6" /><Skeleton className="h-32" /></div>}
      {error && <ErrorState message={error} onRetry={reload} />}
      {v && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 flex-wrap"><StatusBadge status={v.category} tone="gold" /><Rating value={v.rating} /><StatusBadge status={v.available ? 'ACTIVE' : 'CANCELLED'} /><button className="btn-secondary btn-sm ml-auto" onClick={() => onEdit(v)}><Pencil className="h-3.5 w-3.5" />Edit</button></div>
          {v.businessName && <p className="text-sm text-ink-soft">{v.businessName}{v.gstin ? ` · GSTIN ${v.gstin}` : ''}</p>}
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><Phone className="h-4 w-4 text-ink-soft mt-0.5" />{v.contactName} · {v.phone}</li>
            {v.email && <li className="flex gap-2"><Mail className="h-4 w-4 text-ink-soft mt-0.5" />{v.email}</li>}
            <li className="flex gap-2"><MapPin className="h-4 w-4 text-ink-soft mt-0.5" />{v.address ?? '—'} · Serves {v.serviceAreas.join(', ') || '—'}</li>
          </ul>
          <div className="rounded-xl bg-surface-2 p-4 text-sm"><p className="text-xs text-ink-soft">Base pricing</p><p className="num text-xl">{v.basePrice ? inr(v.basePrice) : '—'} <span className="text-sm font-normal text-ink-soft">{v.priceUnit}</span></p>{v.bankDetails && <p className="text-xs text-ink-soft mt-2">Payment: {v.bankDetails}</p>}</div>
          {!!v.services?.length && <div><h3 className="font-serif text-lg mb-2">Services & rates</h3><ul className="divide-y divide-line text-sm">{v.services.map((s) => <li key={s.id} className="flex justify-between py-2"><span>{s.name}</span><span className="tabular-nums">{inr(s.price)} <span className="text-ink-soft">/ {s.unit}</span></span></li>)}</ul></div>}
          {v.performance && <div className="grid grid-cols-3 gap-3 text-center">{[['Assignments', String(v.performance.assignments)], ['On-time', v.performance.timelinessPct == null ? '—' : `${v.performance.timelinessPct}%`], ['Cost variance', v.performance.costVariancePct == null ? '—' : `${v.performance.costVariancePct > 0 ? '+' : ''}${v.performance.costVariancePct}%`]].map(([l, x]) => <div key={l} className="rounded-xl bg-surface-2 py-2.5"><p className="num text-lg">{x}</p><p className="text-[11px] text-ink-soft">{l}</p></div>)}</div>}
          <div><h3 className="font-serif text-lg mb-2">Previous assignments</h3>
            {!v.weddingVendors?.length ? <p className="text-sm text-ink-soft">No assignments yet.</p> : <ul className="divide-y divide-line text-sm">{v.weddingVendors.map((a) => <li key={a.id} className="flex items-center justify-between py-2"><span>{a.wedding.name}<span className="block text-xs text-ink-soft">{fmtDate(a.wedding.startDate)}</span></span><span className="text-right"><span className="num">{inr(a.contractAmount)}</span>{a.arrival && <span className="block text-xs text-ink-soft">{humanize(a.arrival.status)}{a.arrival.delayMinutes > 0 ? ` (+${a.arrival.delayMinutes}m)` : ''}</span>}</span></li>)}</ul>}
          </div>
        </div>
      )}
    </Modal>
  );
}
