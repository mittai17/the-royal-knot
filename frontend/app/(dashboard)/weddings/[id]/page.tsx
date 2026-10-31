'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { ErrorState, ProgressBar, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { WeddingFormModal } from '@/components/weddings/wedding-form';
import { Agreements } from '@/components/weddings/agreements';
import { ActivityTab, CoupleTab, EventsTab, OverviewTab, VendorsTab } from '@/components/weddings/tabs';
import { TasksPanel } from '@/components/tasks/tasks-panel';
import { QuotationsPanel } from '@/components/quotations/quotations-panel';
import { GuestsPanel } from '@/components/guests/guests-panel';
import { PaymentsPanel } from '@/components/finance/payments-panel';
import { ExpensesPanel } from '@/components/finance/expenses-panel';
import { DocumentsPanel } from '@/components/documents/documents-panel';
import { useApi } from '@/hooks/use-api';
import { useWedding } from '@/lib/wedding-context';
import { cn, fmtDate } from '@/lib/utils';
import type { Wedding } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';

const TABS = ['Overview', 'Couple', 'Planning', 'Events', 'Vendors', 'Quotations', 'Guests', 'Payments', 'Expenses', 'Documents', 'Activity'] as const;
type Tab = (typeof TABS)[number];

export default function WeddingWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { can } = useAuth();
  const { id } = use(params);
  const { data: w, loading, error, reload } = useApi<Wedding>(`/weddings/${id}`);
  const { select } = useWedding();
  const [tab, setTab] = useState<Tab>('Overview');
  const [edit, setEdit] = useState(false);
  const [rfq, setRfq] = useState(false);

  // Keep the global wedding selector pointed at the workspace being viewed.
  useEffect(() => { select(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = decodeURIComponent(location.hash.slice(1)) as Tab; if (TABS.includes(h)) setTab(h); }, []);
  const go = (t: Tab) => { setTab(t); history.replaceState(null, '', `#${t}`); };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !w) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-96 rounded-xl" /></div>;

  return (
    <>
      <Link href="/weddings" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-3"><ArrowLeft className="h-4 w-4" />All weddings</Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-3 flex-wrap"><h1 className="font-serif text-[30px] leading-9 text-burgundy-deep">{w.name}</h1><StatusBadge status={w.status} /><StatusBadge status={w.packageType} tone="gold" /></div>
          <p className="text-sm text-ink-soft mt-1">{w.couple ? `${w.couple.brideName} & ${w.couple.groomName} · ` : ''}{w.venue ? `${w.venue}, ` : ''}{w.location} · {fmtDate(w.startDate, 'dd MMM')} – {fmtDate(w.endDate)} · {w.expectedGuests} guests</p>
          <div className="flex items-center gap-2 mt-3 w-64"><div className="flex-1"><ProgressBar value={w.progress ?? 0} /></div><span className="text-xs tabular-nums text-ink-soft">{w.progress ?? 0}% planned</span></div>
        </div>
        <div className="flex gap-2"><Can roles={G.PLANNING}><button className="btn-secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Edit</button></Can>{tab === 'Quotations' && <button className="btn-primary" onClick={() => setRfq(true)}><Plus className="h-4 w-4" />Request quotations</button>}</div>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line mb-5 -mx-1 px-1">
        {TABS.filter((t) => (t !== 'Payments' && t !== 'Expenses') || can(...G.FINANCE_READ)).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => go(t)} className={cn('px-4 h-10 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors', tab === t ? 'border-burgundy text-burgundy font-medium' : 'border-transparent text-ink-soft hover:text-ink')}>{t}</button>)}
      </div>

      {tab === 'Overview' && <OverviewTab w={w} />}
      {tab === 'Couple' && <div className="space-y-5"><CoupleTab w={w} /><Agreements weddingId={w.id} defaultSigner={w.couple?.brideName ?? ''} /></div>}
      {tab === 'Planning' && <TasksPanel weddingId={w.id} />}
      {tab === 'Events' && <EventsTab w={w} onChanged={reload} />}
      {tab === 'Vendors' && <VendorsTab weddingId={w.id} />}
      {tab === 'Quotations' && <QuotationsPanel weddingId={w.id} creating={rfq} onCloseCreate={() => setRfq(false)} onOpenCreate={() => setRfq(true)} />}
      {tab === 'Guests' && <GuestsPanel weddingId={w.id} expected={w.expectedGuests} />}
      {tab === 'Payments' && <PaymentsPanel weddingId={w.id} />}
      {tab === 'Expenses' && <ExpensesPanel weddingId={w.id} />}
      {tab === 'Documents' && <DocumentsPanel weddingId={w.id} />}
      {tab === 'Activity' && <ActivityTab weddingId={w.id} />}
      <WeddingFormModal open={edit} wedding={w} onClose={() => setEdit(false)} onSaved={() => reload()} />
    </>
  );
}
