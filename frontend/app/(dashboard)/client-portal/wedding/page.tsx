'use client';
import { useEffect, useState } from 'react';
import { Loader2, MapPin, Users } from 'lucide-react';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Segmented } from '@/components/shared/form-bits';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDate, humanize } from '@/lib/utils';
import { ScheduleTimeline, VendorCards, type ScheduleData, type VendorRow } from '@/components/portal/client-views';

interface Data {
  wedding: { id: string; name: string; brideName: string; groomName: string; location: string; venue?: string | null; startDate: string; endDate: string; eventDays: number; expectedGuests: number; packageType: string; status: string; theme?: string | null };
  couple: { email?: string | null; phone?: string | null }; planner?: { name: string } | null; vendorCount: number; story: string;
  journey: { at: string; title: string; kind: string }[];
}
type Tab = 'overview' | 'story' | 'itinerary' | 'vendors';

function Story({ initial, onSaved }: { initial: string; onSaved: () => void }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(initial), [initial]);
  const save = async () => { setBusy(true); try { await api.patch('/portal/client/wedding/story', { story: text }); notify.ok('Story saved'); onSaved(); } catch (e) { notify.err(e); } finally { setBusy(false); } };
  return (
    <Card title="Our story" action={<button className="btn-primary btn-sm" disabled={busy || text === initial} onClick={save}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</button>}>
      <textarea className="input min-h-[180px]" maxLength={4000} placeholder="How did you meet? Share your story with the team so we can reflect it in your celebration." value={text} onChange={(e) => setText(e.target.value)} />
      <p className="text-xs text-ink-soft mt-1.5">{text.length}/4000 · visible to you and your planning team.</p>
    </Card>
  );
}

function Itinerary() { const q = useApi<ScheduleData>('/portal/client/schedule'); return <Async q={q}>{(d) => <ScheduleTimeline days={d.days} />}</Async>; }
function Vendors() { const q = useApi<{ vendors: VendorRow[] }>('/portal/client/vendors'); return <Async q={q}>{(d) => <VendorCards vendors={d.vendors} />}</Async>; }

export default function Page() {
  const [tab, setTab] = useState<Tab>('overview');
  const q = useApi<Data>('/portal/client/wedding');
  return (
    <div>
      <PageHeader title="My Wedding" subtitle="Overview, story, itinerary and vendors." actions={<Segmented<Tab> value={tab} onChange={setTab} options={[{ v: 'overview', l: 'Overview' }, { v: 'story', l: 'Our story' }, { v: 'itinerary', l: 'Itinerary' }, { v: 'vendors', l: 'Vendors' }]} />} />
      <Async q={q}>
        {(d) => tab === 'overview' ? (
          <div className="grid gap-5 lg:grid-cols-3">
            <Card title={d.wedding.name} className="lg:col-span-2" action={<StatusBadge status={d.wedding.status} />}>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-ink-soft">Couple</dt><dd className="font-medium">{d.wedding.brideName} &amp; {d.wedding.groomName}</dd></div>
                <div><dt className="text-xs text-ink-soft">Dates</dt><dd className="font-medium">{fmtDate(d.wedding.startDate, 'dd MMM')} – {fmtDate(d.wedding.endDate)}</dd></div>
                <div><dt className="text-xs text-ink-soft">Venue</dt><dd className="font-medium inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-ink-soft" />{d.wedding.venue ?? '—'}, {d.wedding.location}</dd></div>
                <div><dt className="text-xs text-ink-soft">Expected guests</dt><dd className="font-medium inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-ink-soft" />{d.wedding.expectedGuests}</dd></div>
                <div><dt className="text-xs text-ink-soft">Theme</dt><dd className="font-medium">{d.wedding.theme ?? '—'}</dd></div>
                <div><dt className="text-xs text-ink-soft">Package</dt><dd className="font-medium">{humanize(d.wedding.packageType)}</dd></div>
                <div><dt className="text-xs text-ink-soft">Planner</dt><dd className="font-medium">{d.planner?.name ?? 'To be assigned'}</dd></div>
                <div><dt className="text-xs text-ink-soft">Vendors booked</dt><dd className="font-medium">{d.vendorCount}</dd></div>
              </dl>
            </Card>
            <Card title="Our journey">
              {d.journey.length === 0 ? <EmptyState title="Nothing yet" /> : (
                <ol className="relative border-l border-line ml-2 space-y-4 pl-5 max-h-[420px] overflow-y-auto">
                  {d.journey.map((j, i) => <li key={i} className="relative"><span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" /><p className="text-sm">{j.title}</p><p className="text-xs text-ink-soft">{fmtDate(j.at)}</p></li>)}
                </ol>
              )}
            </Card>
          </div>
        ) : tab === 'story' ? <Story initial={d.story} onSaved={q.reload} />
          : tab === 'itinerary' ? <Itinerary /> : <Vendors />}
      </Async>
    </div>
  );
}
