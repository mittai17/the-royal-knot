'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { PageHeader, Card, StatusBadge, Pagination, Avatar, EmptyState } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Segmented, Select, SearchInput } from '@/components/shared/form-bits';
import { EnquiryFormModal } from '@/components/enquiries/enquiry-form';
import { EnquiryDetail } from '@/components/enquiries/enquiry-detail';
import { useList } from '@/hooks/use-list';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { ENQUIRY_STAGES, SOURCES } from '@/lib/enums';
import { fmtDate, humanize, inrCompact, cn } from '@/lib/utils';
import type { Enquiry } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';

const cols: ColumnDef<Enquiry, unknown>[] = [
  { id: 'couple', header: 'Couple', enableSorting: false, cell: ({ row: { original: e } }) => <div><p className="font-medium">{e.couple.brideName} &amp; {e.couple.groomName}</p><p className="text-xs text-ink-soft">{e.couple.phone ?? e.couple.email ?? ''}</p></div> },
  { id: 'preferredDate', header: 'Wedding date', cell: ({ row: { original: e } }) => fmtDate(e.preferredDate) },
  { id: 'location', header: 'Location', enableSorting: false, cell: ({ row: { original: e } }) => e.location ?? '—' },
  { id: 'budget', header: 'Budget', cell: ({ row: { original: e } }) => <span className="num">{e.budget ? inrCompact(e.budget) : '—'}</span> },
  { id: 'source', header: 'Source', enableSorting: false, cell: ({ row: { original: e } }) => humanize(e.source) },
  { id: 'stage', header: 'Stage', enableSorting: false, cell: ({ row: { original: e } }) => <StatusBadge status={e.stage} /> },
  { id: 'followUpAt', header: 'Follow-up', cell: ({ row: { original: e } }) => { const late = e.followUpAt && new Date(e.followUpAt) < new Date() && !['CONFIRMED', 'LOST'].includes(e.stage); return <span className={late ? 'text-danger font-medium' : ''}>{fmtDate(e.followUpAt, 'dd MMM')}</span>; } },
  { id: 'assignedTo', header: 'Assigned to', enableSorting: false, cell: ({ row: { original: e } }) => e.assignedTo ? <span className="inline-flex items-center gap-2"><Avatar name={e.assignedTo.name} size={24} />{e.assignedTo.name}</span> : <span className="text-ink-soft">Unassigned</span> },
];

function Kanban({ rows, onOpen, onMove }: { rows: Enquiry[]; onOpen: (id: string) => void; onMove: (id: string, stage: string) => void }) {
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {ENQUIRY_STAGES.map((s) => {
        const items = rows.filter((r) => r.stage === s);
        return (
          <div key={s} className={cn('w-[280px] shrink-0 rounded-xl bg-surface-2/70 p-3 transition-colors', over === s && 'bg-gold-soft')} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)} onDrop={(e) => { setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) onMove(id, s); }}>
            <div className="flex items-center justify-between mb-3 px-1"><StatusBadge status={s} /><span className="text-xs text-ink-soft tabular-nums">{items.length}</span></div>
            <div className="space-y-2.5 min-h-[60px]">
              {items.map((e) => (
                <button key={e.id} draggable onDragStart={(ev) => ev.dataTransfer.setData('text/plain', e.id)} onClick={() => onOpen(e.id)} className="w-full text-left card p-3 hover:shadow-pop transition-shadow cursor-grab active:cursor-grabbing">
                  <p className="font-medium text-sm">{e.couple.brideName} &amp; {e.couple.groomName}</p>
                  <p className="text-xs text-ink-soft mt-1">{e.location ?? '—'} · {fmtDate(e.preferredDate, 'dd MMM yyyy')}</p>
                  <div className="flex items-center justify-between mt-2"><span className="num text-sm">{e.budget ? inrCompact(e.budget) : '—'}</span>{e.assignedTo && <Avatar name={e.assignedTo.name} size={22} />}</div>
                </button>
              ))}
              {!items.length && <p className="text-xs text-ink-soft text-center py-4">Drop here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EnquiriesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<'table' | 'board'>('table');
  const [stage, setStage] = useState('');
  const [source, setSource] = useState('');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const list = useList<Enquiry>('/enquiries', { stage: stage || undefined, source: source || undefined }, view === 'board' ? 100 : 12);

  const move = async (id: string, to: string) => {
    try { await api.patch(`/enquiries/${id}`, { stage: to }); notify.ok(`Moved to ${humanize(to)}`); list.reload(); } catch (e) { notify.err(e); }
  };
  const closeNew = () => { setCreating(false); if (params.get('new')) router.replace('/enquiries'); };

  return (
    <>
      <PageHeader title="Enquiries" subtitle="Every lead, from first call to confirmed wedding." actions={<Can roles={G.CRM}><button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New enquiry</button></Can>} />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search couple, phone, location…" />
          <Select className="w-48" value={stage} onChange={(v) => { setStage(v); list.setPage(1); }} options={ENQUIRY_STAGES} placeholder="All stages" />
          <Select className="w-40" value={source} onChange={(v) => { setSource(v); list.setPage(1); }} options={SOURCES} placeholder="All sources" />
          <div className="ml-auto"><Segmented value={view} onChange={setView} options={[{ v: 'table', l: 'List' }, { v: 'board', l: 'Pipeline' }]} /></div>
        </div>
        {view === 'table' ? (
          <>
            <DataTable columns={cols} data={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(e) => setOpenId(e.id)} onSort={list.setSort} emptyTitle="No enquiries match" emptyHint="Capture a new enquiry or clear the filters." />
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
          </>
        ) : (
          <div className="p-4">{list.rows.length || list.loading ? <Kanban rows={list.rows} onOpen={setOpenId} onMove={move} /> : <EmptyState title="No enquiries match" />}</div>
        )}
      </Card>
      <EnquiryFormModal open={creating} onClose={closeNew} onSaved={list.reload} />
      <EnquiryDetail id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />
    </>
  );
}

export default function EnquiriesPage() { return <Suspense><EnquiriesInner /></Suspense>; }
