'use client';
import { EmptyState, Card, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { fmtDate, humanize, inr } from '@/lib/utils';

interface Row {
  id: string; category: string; contractAmount: string; negotiatedAmount?: string | null;
  wedding: { name: string; location: string; venue?: string | null; startDate: string; endDate: string; expectedGuests: number; status: string };
  arrival?: { status: string } | null; billing: { finalBill: string; paid: string; remaining: string };
}

export default function Page() {
  const q = useApi<Row[]>('/portal/vendor/bookings');
  return (
    <div>
      <PageHeader title="My Bookings" subtitle="Weddings you are confirmed for." />
      <Async q={q}>
        {(rows) => rows.length === 0 ? <Card><EmptyState title="No confirmed bookings yet" hint="When a client selects your quotation it shows up here." /></Card> : (
          <Card pad={false}>
            <div className="overflow-x-auto"><table className="w-full min-w-[820px] dt"><thead><tr><th className="th">Wedding</th><th className="th">Service</th><th className="th">Dates</th><th className="th">Guests</th><th className="th">Contract</th><th className="th">Paid / balance</th><th className="th">Status</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}><td className="td"><p className="font-medium">{r.wedding.name}</p><p className="text-xs text-ink-soft">{r.wedding.venue ?? r.wedding.location}</p></td>
                  <td className="td">{humanize(r.category)}</td><td className="td whitespace-nowrap">{fmtDate(r.wedding.startDate, 'dd MMM')} – {fmtDate(r.wedding.endDate)}</td><td className="td">{r.wedding.expectedGuests}</td>
                  <td className="td num">{inr(r.negotiatedAmount ?? r.contractAmount)}</td><td className="td"><span className="num">{inr(r.billing.paid)}</span><p className="text-xs text-ink-soft">Balance {inr(r.billing.remaining)}</p></td>
                  <td className="td"><StatusBadge status={r.wedding.status} />{r.arrival && <div className="mt-1"><StatusBadge status={r.arrival.status} /></div>}</td></tr>
              ))}</tbody></table></div>
          </Card>
        )}
      </Async>
    </div>
  );
}
