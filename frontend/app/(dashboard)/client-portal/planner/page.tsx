'use client';
import Link from 'next/link';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { Avatar, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { fmtDate, humanize } from '@/lib/utils';

interface Data { wedding: { name: string; startDate: string }; planner: { name: string; email: string; phone?: string | null } | null; packageType: string }

export default function Page() {
  const q = useApi<Data>('/portal/client/planner');
  return (
    <div>
      <PageHeader title="Our Planner" subtitle="The person who is running your wedding at The Royal Knot." />
      <Async q={q} rows={2}>
        {(d) => !d.planner ? <Card><EmptyState title="No planner assigned yet" hint="Your planner will appear here as soon as one is assigned to your wedding." /></Card> : (
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="flex flex-wrap items-center gap-5 pt-5">
                <Avatar name={d.planner.name} size={72} />
                <div className="min-w-0">
                  <h2 className="font-serif text-2xl text-burgundy-deep">{d.planner.name}</h2>
                  <p className="text-sm text-ink-soft">Lead wedding planner · {d.wedding.name}</p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <a className="btn-primary" href={`mailto:${d.planner.email}`}><Mail className="h-4 w-4" />Email</a>
                    {d.planner.phone && <a className="btn-secondary" href={`tel:${d.planner.phone.replace(/\s/g, '')}`}><Phone className="h-4 w-4" />Call</a>}
                    <Link className="btn-secondary" href="/client-portal/chat"><MessageCircle className="h-4 w-4" />Open chat</Link>
                  </div>
                </div>
              </div>
            </Card>
            <Card title="Contact details">
              <dl className="space-y-3 text-sm">
                <div><dt className="text-xs text-ink-soft">Email</dt><dd className="break-all">{d.planner.email}</dd></div>
                <div><dt className="text-xs text-ink-soft">Phone</dt><dd>{d.planner.phone ?? '—'}</dd></div>
                <div><dt className="text-xs text-ink-soft">Package</dt><dd>{humanize(d.packageType)}</dd></div>
                <div><dt className="text-xs text-ink-soft">Wedding starts</dt><dd>{fmtDate(d.wedding.startDate)}</dd></div>
              </dl>
            </Card>
          </div>
        )}
      </Async>
    </div>
  );
}
