'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Segmented } from '@/components/shared/form-bits';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { ago, fmtDate, humanize, inr } from '@/lib/utils';

type View = 'new' | 'submitted' | 'closed' | 'all';
interface Data {
  counts: { new: number; submitted: number; closed: number };
  rfqs: { id: string; title: string; category: string; brief?: string | null; state: string; createdAt: string; wedding: { name: string; location: string; startDate: string; expectedGuests: number }; quotation?: { grandTotal: string } | null }[];
}

export default function Page() {
  const [view, setView] = useState<View>('new');
  const q = useApi<Data>('/portal/vendor/rfqs', { view });
  const c = q.data?.counts;
  return (
    <div>
      <PageHeader title="New RFQs" subtitle="Requests for quotation from The Royal Knot." actions={<Segmented<View> value={view} onChange={setView} options={[{ v: 'new', l: `New${c ? ` (${c.new})` : ''}` }, { v: 'submitted', l: `Quoted${c ? ` (${c.submitted})` : ''}` }, { v: 'closed', l: `Closed${c ? ` (${c.closed})` : ''}` }, { v: 'all', l: 'All' }]} />} />
      <Async q={q}>
        {(d) => d.rfqs.length === 0 ? <Card><EmptyState title={view === 'new' ? 'No new requests' : 'Nothing here'} hint="New opportunities will appear as soon as the planning team invites you to quote." /></Card> : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {d.rfqs.map((r) => (
              <Link key={r.id} href={`/vendor-portal/rfqs/${r.id}`} className="card p-5 hover:shadow-pop transition-shadow block min-w-0">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-serif text-lg text-burgundy-deep truncate">{r.title}</p><p className="text-xs text-ink-soft mt-0.5">{r.wedding.name} · {r.wedding.location} · {fmtDate(r.wedding.startDate)}</p></div><StatusBadge status={r.state} tone={r.state === 'NEW' ? 'burgundy' : undefined} /></div>
                {r.brief && <p className="text-sm text-ink-soft mt-3 line-clamp-2">{r.brief}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-4 text-xs text-ink-soft"><span>{humanize(r.category)} · {r.wedding.expectedGuests} guests · received {ago(r.createdAt)}</span>{r.quotation && <span className="num text-sm text-ink">Your quote {inr(r.quotation.grandTotal)}</span>}</div>
              </Link>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}
