'use client';
import { Eye, FileText, PenLine } from 'lucide-react';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Async, FileLink } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { fmtDate, humanize, inr } from '@/lib/utils';

interface Data {
  agreements: { id: string; version: number; status: string; amount: string; paymentTerms: string; createdAt: string; signatures: { id: string; signerName: string; signerRole: string; signedAt: string }[] }[];
  documents: { id: string; name: string; category: string; mimeType: string; size: number; version: number; createdAt: string }[];
}
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function Page() {
  const q = useApi<Data>('/portal/client/documents');
  return (
    <div className="space-y-5">
      <PageHeader title="Documents & Contracts" subtitle="Your agreements, signed contracts and shared files." />
      <Async q={q}>
        {(d) => (
          <>
            <Card title="Agreements & contracts">
              {d.agreements.length === 0 ? <EmptyState title="No agreements shared yet" hint="Your planner will share the planning agreement here for review and signature." /> : (
                <ul className="divide-y divide-line">
                  {d.agreements.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-4 py-4">
                      <div className="h-10 w-10 rounded-xl bg-gold-soft text-burgundy grid place-items-center shrink-0"><PenLine className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">Wedding planning agreement · v{a.version}</p>
                        <p className="text-xs text-ink-soft">Contract value {inr(a.amount)} · shared {fmtDate(a.createdAt)}</p>
                        {a.signatures.map((s) => <p key={s.id} className="text-xs text-success mt-0.5">Signed by {s.signerName} ({humanize(s.signerRole)}) on {fmtDate(s.signedAt)}</p>)}
                      </div>
                      <StatusBadge status={a.status} />
                      <FileLink path={`/portal/client/agreements/${a.id}/pdf`} label="View PDF" preview className="btn-secondary btn-sm" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Shared documents" pad={false}>
              {d.documents.length === 0 ? <EmptyState title="No documents yet" hint="Schedules, floor plans and receipts shared with you will appear here." /> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[620px] dt"><thead><tr><th className="th">Document</th><th className="th">Type</th><th className="th">Added</th><th className="th">Size</th><th className="th" /></tr></thead>
                  <tbody>{d.documents.map((x) => (
                    <tr key={x.id}><td className="td"><span className="inline-flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-ink-soft" />{x.name}{x.version > 1 && <span className="text-xs text-ink-soft">v{x.version}</span>}</span></td>
                      <td className="td">{humanize(x.category)}</td><td className="td">{fmtDate(x.createdAt)}</td><td className="td">{size(x.size)}</td>
                      <td className="td"><div className="flex justify-end gap-2"><FileLink path={`/portal/client/documents/${x.id}/preview`} preview label="View" className="btn-ghost btn-sm" /><FileLink path={`/portal/client/documents/${x.id}/download`} /></div></td></tr>
                  ))}</tbody></table></div>
              )}
            </Card>
            <p className="text-xs text-ink-soft inline-flex items-center gap-1"><Eye className="h-3 w-3" />Only documents your planner has shared with you are listed.</p>
          </>
        )}
      </Async>
    </div>
  );
}
