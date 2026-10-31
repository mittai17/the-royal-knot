'use client';
import Link from 'next/link';
import { Card, EmptyState, PageHeader, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Async, FileLink } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { fmtDate, humanize, inr } from '@/lib/utils';

interface Data {
  summary: Record<string, number>;
  quotations: { id: string; requestId: string; title: string; category: string; wedding: { name: string }; stage: string; grandTotal: string; lines: number; validUntil?: string | null; decisionNote?: string | null; submittedAt: string }[];
}

export default function Page() {
  const q = useApi<Data>('/portal/vendor/quotations');
  return (
    <div className="space-y-5">
      <PageHeader title="My Quotations" subtitle="Everything you have quoted, and where it stands." />
      <Async q={q}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Submitted" value={d.summary.SUBMITTED ?? 0} /><StatCard label="Under review" value={d.summary.UNDER_REVIEW ?? 0} hint="all vendors have quoted" />
              <StatCard label="Accepted" value={d.summary.ACCEPTED ?? 0} /><StatCard label="Rejected" value={d.summary.REJECTED ?? 0} />
            </div>
            <Card pad={false}>
              {d.quotations.length === 0 ? <EmptyState title="No quotations yet" hint="Respond to a new RFQ to see it here." action={<Link className="btn-primary btn-sm" href="/vendor-portal/rfqs">View RFQs</Link>} /> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[760px] dt"><thead><tr><th className="th">RFQ</th><th className="th">Wedding</th><th className="th">Submitted</th><th className="th">Total</th><th className="th">Status</th><th className="th" /></tr></thead>
                  <tbody>{d.quotations.map((x) => (
                    <tr key={x.id}><td className="td"><p className="font-medium">{x.title}</p><p className="text-xs text-ink-soft">{humanize(x.category)} · {x.lines} lines</p></td><td className="td">{x.wedding.name}</td><td className="td">{fmtDate(x.submittedAt)}</td><td className="td num">{inr(x.grandTotal)}</td>
                      <td className="td"><StatusBadge status={x.stage} />{x.decisionNote && x.stage === 'REJECTED' && <p className="text-xs text-ink-soft mt-1 max-w-[220px]">{x.decisionNote}</p>}</td>
                      <td className="td"><div className="flex gap-2 justify-end"><Link className="btn-secondary btn-sm" href={`/vendor-portal/rfqs/${x.requestId}`}>Open</Link><FileLink path={`/portal/vendor/quotations/${x.id}/pdf`} label="PDF" preview /></div></td></tr>
                  ))}</tbody></table></div>
              )}
            </Card>
          </>
        )}
      </Async>
    </div>
  );
}
