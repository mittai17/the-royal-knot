'use client';
import { useState } from 'react';
import { ChevronRight, ArrowLeft, Plus } from 'lucide-react';
import { Card, EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { RequestFormModal } from './request-form';
import { QuoteEntryModal } from './quote-entry';
import { Comparison } from './comparison';
import { useApi, asRows } from '@/hooks/use-api';
import { fmtDate, humanize } from '@/lib/utils';
import type { Comparison as Cmp, QuoteTarget, RfqGroup } from '@/types';

function GroupView({ weddingId, group, onBack, onChangedList }: { weddingId: string; group: RfqGroup; onBack: () => void; onChangedList: () => void }) {
  const cmp = useApi<Cmp>(`/weddings/${weddingId}/quotation-comparison`, { rfqGroup: group.rfqGroup });
  const [entry, setEntry] = useState<QuoteTarget | null>(null);
  const reload = () => { void cmp.reload(); onChangedList(); };
  return (
    <>
      <Card title={<span className="flex items-center gap-3"><button className="btn-ghost btn-sm !px-2" onClick={onBack} aria-label="Back to requests"><ArrowLeft className="h-4 w-4" /></button>{group.title}</span>} action={<StatusBadge status={cmp.data?.decided ? 'ACCEPTED' : 'PENDING'} />} pad={false}>
        {cmp.error ? <ErrorState message={cmp.error} onRetry={cmp.reload} /> : !cmp.data ? <Skeleton className="h-64 m-5" /> : <Comparison data={cmp.data} onEnter={setEntry} onChanged={reload} />}
      </Card>
      <QuoteEntryModal request={entry} onClose={() => setEntry(null)} onSaved={reload} />
    </>
  );
}

export function QuotationsPanel({ weddingId, creating, onCloseCreate, onOpenCreate }: { weddingId: string; creating: boolean; onCloseCreate: () => void; onOpenCreate: () => void }) {
  const [group, setGroup] = useState<string | null>(null);
  const r = useApi<unknown>('/quotations/requests', { weddingId });
  const groups = asRows<RfqGroup>(r.data);
  const active = groups.find((g) => g.rfqGroup === group);

  return (
    <>
      {r.error ? <Card><ErrorState message={r.error} onRetry={r.reload} /></Card>
        : r.loading ? <Skeleton className="h-64 rounded-xl" />
        : active ? <GroupView key={active.rfqGroup} weddingId={weddingId} group={active} onBack={() => setGroup(null)} onChangedList={r.reload} />
        : groups.length === 0 ? <Card><EmptyState title="No quotation requests yet" hint="Invite three or more vendors in a category to compare them side by side." action={<button className="btn-primary" onClick={onOpenCreate}><Plus className="h-4 w-4" />Request quotations</button>} /></Card>
        : (
          <Card pad={false}><ul className="divide-y divide-line">
            {groups.map((g) => (
              <li key={g.rfqGroup}><button className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surface-2/50" onClick={() => setGroup(g.rfqGroup)}>
                <div className="flex-1 min-w-0"><p className="font-medium">{g.title}</p><p className="text-xs text-ink-soft">{humanize(g.category)} · requested {fmtDate(g.createdAt)} · {g.requests.map((q) => q.vendor.name).join(', ')}</p></div>
                <span className="text-sm text-ink-soft tabular-nums">{g.received}/{g.invited} received</span><StatusBadge status={g.decided ? 'SELECTED' : g.received === g.invited ? 'RECEIVED' : 'SENT'} /><ChevronRight className="h-4 w-4 text-ink-soft" />
              </button></li>
            ))}
          </ul></Card>
        )}
      <RequestFormModal open={creating} onClose={onCloseCreate} onSaved={r.reload} />
    </>
  );
}
