'use client';
import { useState } from 'react';
import { Loader2, LogIn, LogOut } from 'lucide-react';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDate, fmtDateTime, humanize } from '@/lib/utils';

interface Row { bookingId: string; category: string; wedding: { name: string; venue?: string | null; location: string; startDate: string; endDate: string }; arrival: { status: string; expectedAt: string; actualAt?: string | null; delayMinutes: number } | null; windowOpen: boolean }

export default function Page() {
  const q = useApi<Row[]>('/portal/vendor/check-in');
  const [busy, setBusy] = useState('');
  const act = async (id: string, kind: 'arrive' | 'depart') => {
    setBusy(id + kind);
    try { await api.post(`/portal/vendor/check-in/${id}/${kind}`, {}); notify.ok(kind === 'arrive' ? 'Checked in — the event team has been notified' : 'Checked out — thank you'); q.reload(); }
    catch (e) { notify.err(e); } finally { setBusy(''); }
  };
  return (
    <div>
      <PageHeader title="Check-in / Check-out" subtitle="Let the event team know when your crew arrives and leaves." />
      <Async q={q}>
        {(rows) => rows.length === 0 ? <Card><EmptyState title="No events within the check-in window" hint="Check-in opens one day before a wedding you are booked for." /></Card> : (
          <div className="grid gap-5 md:grid-cols-2">
            {rows.map((r) => {
              const s = r.arrival?.status ?? 'EXPECTED';
              const arrived = s === 'ARRIVED' || s === 'DELAYED';
              return (
                <Card key={r.bookingId} title={r.wedding.name} action={<StatusBadge status={s} />}>
                  <p className="text-sm text-ink-soft">{humanize(r.category)} · {r.wedding.venue ?? r.wedding.location}</p>
                  <p className="text-xs text-ink-soft mt-1">{fmtDate(r.wedding.startDate, 'dd MMM')} – {fmtDate(r.wedding.endDate)}</p>
                  <dl className="grid grid-cols-2 gap-3 mt-4 text-sm">
                    <div><dt className="text-xs text-ink-soft">Expected</dt><dd>{r.arrival ? fmtDateTime(r.arrival.expectedAt) : '—'}</dd></div>
                    <div><dt className="text-xs text-ink-soft">Checked in</dt><dd>{r.arrival?.actualAt ? fmtDateTime(r.arrival.actualAt) : '—'}{r.arrival && r.arrival.delayMinutes > 0 ? <span className="text-warning"> · {r.arrival.delayMinutes} min late</span> : null}</dd></div>
                  </dl>
                  <div className="flex gap-3 mt-5">
                    <button className="btn-primary flex-1 justify-center h-12 text-base" disabled={!r.windowOpen || s !== 'EXPECTED' || !!busy} onClick={() => act(r.bookingId, 'arrive')}>{busy === r.bookingId + 'arrive' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}Check in</button>
                    <button className="btn-secondary flex-1 justify-center h-12 text-base" disabled={!arrived || !!busy} onClick={() => act(r.bookingId, 'depart')}>{busy === r.bookingId + 'depart' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}Check out</button>
                  </div>
                  {!r.windowOpen && <p className="text-xs text-ink-soft mt-3">Check-in opens one day before the wedding starts.</p>}
                </Card>
              );
            })}
          </div>
        )}
      </Async>
    </div>
  );
}
