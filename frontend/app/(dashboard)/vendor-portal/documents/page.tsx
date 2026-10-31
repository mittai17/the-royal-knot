'use client';
import { useRef, useState } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { Async, FileLink } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDate, humanize } from '@/lib/utils';

interface Doc { id: string; name: string; category: string; size: number; version: number; createdAt: string; wedding?: { name: string } | null; uploadedBy?: { name: string } | null }
const CATS = ['VENDOR_CONTRACT', 'VENDOR_QUOTATION', 'INVOICE', 'EVIDENCE', 'PHOTO', 'OTHER'];
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function Page() {
  const q = useApi<Doc[]>('/portal/vendor/documents');
  const ref = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('OTHER');
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { const f = new FormData(); f.append('file', file); f.append('category', category); await api.upload('/portal/vendor/documents', f); notify.ok('Document uploaded'); q.reload(); } catch (e) { notify.err(e); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Documents" subtitle="Files shared with you and files you upload for the planning team." actions={<>
        <Select className="w-44" value={category} onChange={setCategory} options={CATS} />
        <input ref={ref} type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <button className="btn-primary" disabled={busy} onClick={() => ref.current?.click()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Upload</button>
      </>} />
      <Async q={q}>
        {(rows) => (
          <Card pad={false}>
            {rows.length === 0 ? <EmptyState title="No documents yet" hint="Contracts, run sheets and files you upload will be listed here. PDF, images, CSV, Word and Excel up to 15 MB." /> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[680px] dt"><thead><tr><th className="th">Document</th><th className="th">Type</th><th className="th">Wedding</th><th className="th">Added</th><th className="th">Size</th><th className="th" /></tr></thead>
                <tbody>{rows.map((x) => (
                  <tr key={x.id}><td className="td"><span className="inline-flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-ink-soft" />{x.name}{x.version > 1 && <span className="text-xs text-ink-soft">v{x.version}</span>}</span></td><td className="td">{humanize(x.category)}</td><td className="td">{x.wedding?.name ?? '—'}</td><td className="td">{fmtDate(x.createdAt)}</td><td className="td">{size(x.size)}</td>
                    <td className="td"><div className="flex gap-2 justify-end"><FileLink path={`/portal/vendor/documents/${x.id}/preview`} preview label="View" className="btn-ghost btn-sm" /><FileLink path={`/portal/vendor/documents/${x.id}/download`} /></div></td></tr>
                ))}</tbody></table></div>
            )}
          </Card>
        )}
      </Async>
    </div>
  );
}
