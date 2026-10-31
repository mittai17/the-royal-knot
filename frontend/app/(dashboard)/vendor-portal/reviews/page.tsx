'use client';
import { useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { Card, EmptyState, PageHeader, StatCard } from '@/components/ui/primitives';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDate } from '@/lib/utils';

interface Review { id: string; rating: number; punctuality?: number | null; comment?: string | null; createdAt: string; wedding?: { name: string } | null; response: { text: string; at: string } | null }
interface Data { summary: { count: number; average: number | null; punctuality: number | null; distribution: { stars: number; count: number }[] }; reviews: Review[] }

const Stars = ({ n }: { n: number }) => <span className="inline-flex" aria-label={`${n} out of 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`h-4 w-4 ${i <= n ? 'fill-gold text-gold' : 'text-line'}`} />)}</span>;

function Respond({ r, onDone }: { r: Review; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(r.response?.text ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await api.post(`/portal/vendor/reviews/${r.id}/respond`, { text }); notify.ok('Response published'); setOpen(false); onDone(); } catch (e) { notify.err(e); } finally { setBusy(false); } };
  if (!open) return <button className="btn-secondary btn-sm mt-3" onClick={() => setOpen(true)}>{r.response ? 'Edit response' : 'Respond'}</button>;
  return (
    <div className="mt-3 space-y-2">
      <textarea className="input min-h-[80px]" maxLength={1500} placeholder="Thank the couple or address their feedback…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2"><button className="btn-primary btn-sm" disabled={busy || !text.trim()} onClick={save}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Publish response</button><button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  );
}

export default function Page() {
  const q = useApi<Data>('/portal/vendor/reviews');
  return (
    <div className="space-y-5">
      <PageHeader title="Reviews & Feedback" subtitle="What clients and planners say about your work." />
      <Async q={q}>
        {(d) => (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <StatCard label="Average rating" value={d.summary.average ?? '—'} hint={`${d.summary.count} review${d.summary.count === 1 ? '' : 's'}`} />
              <StatCard label="Punctuality" value={d.summary.punctuality ?? '—'} hint="out of 5" />
              <Card pad={false} className="px-5 py-4">
                {d.summary.distribution.map((s) => (
                  <div key={s.stars} className="flex items-center gap-2 text-xs"><span className="w-3">{s.stars}</span><div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-gold" style={{ width: `${d.summary.count ? (s.count / d.summary.count) * 100 : 0}%` }} /></div><span className="w-4 text-right text-ink-soft">{s.count}</span></div>
                ))}
              </Card>
            </div>
            <Card title="Client reviews">
              {d.reviews.length === 0 ? <EmptyState title="No reviews yet" hint="Reviews appear after a wedding is completed." /> : (
                <ul className="divide-y divide-line">{d.reviews.map((r) => (
                  <li key={r.id} className="py-4">
                    <div className="flex flex-wrap items-center gap-3"><Stars n={r.rating} /><span className="text-xs text-ink-soft">{r.wedding?.name ?? 'Wedding'} · {fmtDate(r.createdAt)}{r.punctuality ? ` · punctuality ${r.punctuality}/5` : ''}</span></div>
                    {r.comment && <p className="text-sm mt-2">{r.comment}</p>}
                    {r.response && <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm"><p className="text-xs text-ink-soft mb-1">Your response · {fmtDate(r.response.at)}</p>{r.response.text}</div>}
                    <Respond r={r} onDone={q.reload} />
                  </li>
                ))}</ul>
              )}
            </Card>
          </>
        )}
      </Async>
    </div>
  );
}
