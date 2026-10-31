'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, MapPin, Users, Calendar } from 'lucide-react';
import { PageHeader, Card, StatusBadge, Pagination, ProgressBar, Avatar, Skeleton, EmptyState, ErrorState } from '@/components/ui/primitives';
import { Select, SearchInput } from '@/components/shared/form-bits';
import { WeddingFormModal } from '@/components/weddings/wedding-form';
import { useList } from '@/hooks/use-list';
import { WEDDING_STATUSES } from '@/lib/enums';
import { fmtDate, humanize, inrCompact } from '@/lib/utils';
import type { Wedding } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';

const COVERS = ['linear-gradient(135deg,#401827,#8B4A55)', 'linear-gradient(135deg,#6B4A2B,#C6A46A)', 'linear-gradient(135deg,#28121D,#5B2A3C)', 'linear-gradient(135deg,#2C4A5E,#7FA3B8)', 'linear-gradient(135deg,#3C4A2B,#9BAA6F)'];

function WeddingsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const list = useList<Wedding>('/weddings', { status: status || undefined }, 12);

  return (
    <>
      <PageHeader title="Weddings" subtitle="Every celebration this season, in one place." actions={<Can roles={G.CRM}><button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New wedding</button></Can>} />
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search weddings…" />
        <Select className="w-48" value={status} onChange={(v) => { setStatus(v); list.setPage(1); }} options={WEDDING_STATUSES} placeholder="All statuses" />
      </div>
      {list.error ? <Card><ErrorState message={list.error} onRetry={list.reload} /></Card> : list.loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[260px] rounded-xl" />)}</div>
      ) : list.rows.length === 0 ? <Card><EmptyState title="No weddings found" hint="Convert an enquiry or create a wedding directly." /></Card> : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {list.rows.map((w, i) => (
              <Link key={w.id} href={`/weddings/${w.id}`} className="card overflow-hidden hover:shadow-pop transition-shadow">
                <div className="relative h-28" style={{ background: COVERS[i % COVERS.length] }}><span className="absolute top-3 left-3"><StatusBadge status={w.status} /></span><span className="absolute top-3 right-3 text-[11px] text-white/80 bg-black/20 rounded-full px-2 py-0.5">{humanize(w.packageType)}</span></div>
                <div className="p-4 space-y-2.5">
                  <div><h3 className="font-serif text-lg text-burgundy-deep leading-6">{w.name}</h3><p className="text-xs text-ink-soft">{w.couple ? `${w.couple.brideName} & ${w.couple.groomName}` : ''}</p></div>
                  <div className="text-xs text-ink-soft space-y-1">
                    <p className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{fmtDate(w.startDate, 'dd MMM')} – {fmtDate(w.endDate, 'dd MMM yyyy')}</p>
                    <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{w.venue ? `${w.venue}, ` : ''}{w.location}</p>
                    <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{w.expectedGuests} guests</p>
                  </div>
                  <div className="flex items-center gap-2"><div className="flex-1"><ProgressBar value={w.progress ?? 0} /></div><span className="text-[11px] tabular-nums text-ink-soft">{w.progress ?? 0}%</span></div>
                  <div className="flex items-center justify-between pt-1"><span className="num">{inrCompact(w.contractValue)}</span>{w.planner && <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft"><Avatar name={w.planner.name} size={22} />{w.planner.name.split(' ')[0]}</span>}</div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-4"><Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} /></div>
        </>
      )}
      <WeddingFormModal open={creating} onClose={() => { setCreating(false); if (params.get('new')) router.replace('/weddings'); }} onSaved={(id) => { list.reload(); if (id) router.push(`/weddings/${id}`); }} />
    </>
  );
}
export default function WeddingsPage() { return <Suspense><WeddingsInner /></Suspense>; }
