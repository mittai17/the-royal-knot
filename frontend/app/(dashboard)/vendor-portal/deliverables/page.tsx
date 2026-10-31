'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { Card, EmptyState, PageHeader, ProgressBar } from '@/components/ui/primitives';
import { Segmented } from '@/components/shared/form-bits';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDate, humanize } from '@/lib/utils';

interface Booking { bookingId: string; category: string; wedding: { name: string; startDate: string; endDate: string; status: string }; items: { id: string; name: string; description?: string | null; quantity: string | null; unit: string | null; done: boolean; doneAt: string | null }[]; done: number; total: number }
type View = 'active' | 'completed';

export default function Page() {
  const [view, setView] = useState<View>('active');
  const q = useApi<Booking[]>('/portal/vendor/deliverables');
  const toggle = async (b: Booking, itemId: string, done: boolean) => {
    try { await api.patch(`/portal/vendor/deliverables/${b.bookingId}/${itemId}`, { done }); q.reload(); } catch (e) { notify.err(e); }
  };
  return (
    <div>
      <PageHeader title="Service Deliverables" subtitle="Tick off each contracted service as you deliver it." actions={<Segmented<View> value={view} onChange={setView} options={[{ v: 'active', l: 'Active weddings' }, { v: 'completed', l: 'Completed weddings' }]} />} />
      <Async q={q}>
        {(rows) => {
          const list = rows.filter((b) => (b.wedding.status === 'COMPLETED') === (view === 'completed'));
          if (!list.length) return <Card><EmptyState title="No deliverables" hint="Deliverables come from the services in your confirmed quotation." /></Card>;
          return (
            <div className="grid gap-5 lg:grid-cols-2">
              {list.map((b) => (
                <Card key={b.bookingId} title={b.wedding.name} action={<span className="text-xs text-ink-soft">{humanize(b.category)} · {fmtDate(b.wedding.startDate)}</span>}>
                  <div className="flex items-center gap-3 mb-3"><div className="flex-1"><ProgressBar value={b.total ? (b.done / b.total) * 100 : 0} /></div><span className="text-xs num">{b.done}/{b.total}</span></div>
                  <ul className="divide-y divide-line">
                    {b.items.map((i) => (
                      <li key={i.id} className="flex items-start gap-3 py-2.5">
                        <input id={`${b.bookingId}-${i.id}`} type="checkbox" className="mt-1 h-4 w-4 accent-[#401827]" checked={i.done} onChange={(e) => toggle(b, i.id, e.target.checked)} />
                        <label htmlFor={`${b.bookingId}-${i.id}`} className="min-w-0 flex-1 cursor-pointer"><span className={`text-sm ${i.done ? 'line-through text-ink-soft' : 'font-medium'}`}>{i.name}</span>{i.quantity && <span className="text-xs text-ink-soft ml-2">{Number(i.quantity)} {i.unit}</span>}{i.description && <p className="text-xs text-ink-soft">{i.description}</p>}</label>
                        {i.done && <span className="text-xs text-success inline-flex items-center gap-1"><Check className="h-3 w-3" />Done</span>}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          );
        }}
      </Async>
    </div>
  );
}
