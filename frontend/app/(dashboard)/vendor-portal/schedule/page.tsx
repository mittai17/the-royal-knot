'use client';
import { useState } from 'react';
import { Clock, MapPin } from 'lucide-react';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Segmented } from '@/components/shared/form-bits';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { fmtDate, fmtTime, humanize } from '@/lib/utils';

interface Data {
  days: { date: string; entries: { key: string; kind: 'EVENT' | 'RUN_SHEET' | 'ARRIVAL'; title: string; at: string; weddingName: string; venue?: string | null; status?: string; category: string }[] }[];
}
type View = 'upcoming' | 'all';

export default function Page() {
  const [view, setView] = useState<View>('upcoming');
  const q = useApi<Data>('/portal/vendor/schedule');
  const today = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
  return (
    <div>
      <PageHeader title="Event Schedule" subtitle="Your events and run-sheet timings across all weddings." actions={<Segmented<View> value={view} onChange={setView} options={[{ v: 'upcoming', l: 'Upcoming' }, { v: 'all', l: 'All' }]} />} />
      <Async q={q}>
        {(d) => {
          const days = d.days.filter((x) => view === 'all' || x.date >= today);
          if (!days.length) return <Card><EmptyState title="Nothing scheduled" hint="Your upcoming events will appear here." /></Card>;
          return (
            <div className="space-y-5">
              {days.map((day) => (
                <Card key={day.date} title={fmtDate(day.date + 'T12:00:00', 'EEEE, dd MMMM yyyy')} action={day.date === today ? <span className="text-xs rounded-full bg-gold-soft px-2.5 py-0.5 text-[#8A6B2E]">Today</span> : undefined}>
                  <ul className="space-y-3">
                    {day.entries.map((e) => (
                      <li key={e.key} className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 ${e.kind === 'EVENT' ? 'bg-gold-soft/50' : 'border border-line'}`}>
                        <span className="num text-sm w-20 inline-flex items-center gap-1 text-ink-soft"><Clock className="h-3 w-3" />{e.kind === 'EVENT' ? 'All day' : fmtTime(e.at)}</span>
                        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{e.title}</p><p className="text-xs text-ink-soft">{e.weddingName}{e.venue && <span className="inline-flex items-center gap-1 ml-2"><MapPin className="h-3 w-3" />{e.venue}</span>}</p></div>
                        <span className="text-xs text-ink-soft">{e.kind === 'ARRIVAL' ? 'Your arrival' : e.kind === 'EVENT' ? humanize(e.category) : 'Run sheet'}</span>
                        {e.status && <StatusBadge status={e.status} />}
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
