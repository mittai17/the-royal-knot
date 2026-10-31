'use client';
import Link from 'next/link';
import { CalendarCheck, CalendarClock, Inbox, Star, Wallet } from 'lucide-react';
import { Card, EmptyState, PageHeader, StatCard } from '@/components/ui/primitives';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { fmtDate, humanize, inr } from '@/lib/utils';

interface Dash {
  vendor: { name: string; businessName?: string | null; category: string; available: boolean };
  totalBookings: number; upcomingEvents: number; newRfqs: number;
  pendingPayments: { amount: string; bookings: number };
  rating: { average: number; reviews: number };
  quotations: { submitted: number; accepted: number; rejected: number };
  nextBookings: { id: string; category: string; wedding: { name: string; venue?: string | null; location: string; startDate: string; endDate: string } }[];
}

export default function Page() {
  const q = useApi<Dash>('/portal/vendor/dashboard');
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your bookings, requests and payments at a glance." />
      <Async q={q} rows={3}>
        {(d) => (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard icon={<CalendarCheck className="h-5 w-5" />} label="Total bookings" value={d.totalBookings} hint={humanize(d.vendor.category)} />
              <StatCard icon={<CalendarClock className="h-5 w-5" />} label="Upcoming events" value={d.upcomingEvents} />
              <StatCard icon={<Wallet className="h-5 w-5" />} label="Pending payments" value={inr(d.pendingPayments.amount)} hint={`${d.pendingPayments.bookings} bookings`} />
              <StatCard icon={<Inbox className="h-5 w-5" />} label="New RFQs" value={d.newRfqs} hint={<Link href="/vendor-portal/rfqs" className="underline">View</Link>} />
              <StatCard icon={<Star className="h-5 w-5" />} label="Rating" value={d.rating.average ? d.rating.average.toFixed(1) : '—'} hint={`${d.rating.reviews} review${d.rating.reviews === 1 ? '' : 's'}`} />
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              <Card title="Next bookings" className="lg:col-span-2" action={<Link href="/vendor-portal/bookings" className="text-xs text-burgundy underline">All bookings</Link>}>
                {d.nextBookings.length === 0 ? <EmptyState title="No upcoming bookings" hint="Confirmed weddings appear here." /> : (
                  <ul className="divide-y divide-line">{d.nextBookings.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="font-medium">{b.wedding.name}</p><p className="text-xs text-ink-soft">{b.wedding.venue ?? b.wedding.location} · {humanize(b.category)}</p></div><p className="text-sm">{fmtDate(b.wedding.startDate, 'dd MMM')} – {fmtDate(b.wedding.endDate)}</p></li>
                  ))}</ul>
                )}
              </Card>
              <Card title="Quotations">
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-ink-soft">Awaiting decision</dt><dd className="num">{d.quotations.submitted}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-soft">Accepted</dt><dd className="num text-success">{d.quotations.accepted}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-soft">Not selected</dt><dd className="num">{d.quotations.rejected}</dd></div>
                </dl>
                <Link className="btn-secondary btn-sm mt-4" href="/vendor-portal/quotations">My quotations</Link>
              </Card>
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}
