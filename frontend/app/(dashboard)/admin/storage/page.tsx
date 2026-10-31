'use client';
import { useState } from 'react';
import { ChevronRight, Download, Folder, Trash2 } from 'lucide-react';
import { Card, EmptyState, PageHeader, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Confirm, Load, Meter, fmtBytes, useBusy } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { api, apiUrl } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { fmtDateTime } from '@/lib/utils';
import { notify } from '@/lib/toast';

interface Overview { endpoint: string; primaryBucket: string; totalBytes: number; totalObjects: number; buckets: { name: string; objects: number; bytes: number; truncated: boolean; primary: boolean }[]; documents: { count: number; bytes: number; byCategory: { category: string; count: number; bytes: number }[] } }
interface Listing { folders: string[]; files: { key: string; name: string; size: number; lastModified: string | null; referencedBy: string | null }[]; truncated: boolean }

export default function StoragePage() {
  const ov = useApi<Overview>('/admin/storage/overview');
  const [bucket, setBucket] = useState('');
  const [prefix, setPrefix] = useState('');
  const b = bucket || ov.data?.primaryBucket || '';
  const ls = useApi<Listing>(b ? '/admin/storage/objects' : null, { bucket: b, prefix });
  const [del, setDel] = useState<{ key: string; ref: string | null; force?: string } | null>(null);
  const { busy, run } = useBusy();
  const crumbs = prefix.split('/').filter(Boolean);
  const remove = async (force: boolean) => {
    if (!del) return;
    await run('del', async () => {
      try { await api.del(`/admin/storage/objects?bucket=${encodeURIComponent(b)}&key=${encodeURIComponent(del.key)}${force ? '&force=true' : ''}`); notify.ok('File deleted'); setDel(null); ls.reload(); ov.reload(); }
      catch (e) { if (e instanceof ApiError && e.status === 409) setDel({ ...del, force: e.message }); else throw e; }
    });
  };
  const max = Math.max(1, ...(ov.data?.buckets.map((x) => x.bytes) ?? [1]));
  return (
    <>
      <PageHeader title="File Storage" subtitle={ov.data ? `MinIO at ${ov.data.endpoint}` : 'Object storage buckets, usage and files.'} />
      <Load state={ov}>{ov.data && <div className="space-y-5">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total used" value={fmtBytes(ov.data.totalBytes)} />
          <StatCard label="Objects" value={ov.data.totalObjects} />
          <StatCard label="Buckets" value={ov.data.buckets.length} />
          <StatCard label="Documents (DB)" value={ov.data.documents.count} hint={fmtBytes(ov.data.documents.bytes)} />
        </div>
        <Card title="Buckets" pad={false}>
          <div className="overflow-x-auto"><table className="w-full" style={{ minWidth: 560 }}><thead><tr><th className="th">Bucket</th><th className="th">Objects</th><th className="th">Size</th><th className="th w-48">Share</th><th className="th" /></tr></thead>
            <tbody>{ov.data.buckets.map((x) => <tr key={x.name}><td className="td font-medium">{x.name} {x.primary && <StatusBadge status="Primary" tone="gold" />}</td><td className="td">{x.objects}{x.truncated && '+'}</td><td className="td">{fmtBytes(x.bytes)}</td><td className="td"><Meter pct={(x.bytes / max) * 100} /></td><td className="td text-right"><button className="btn-secondary btn-sm" onClick={() => { setBucket(x.name); setPrefix(''); }}>Browse</button></td></tr>)}</tbody></table></div>
        </Card>
        <Card title={<span className="flex flex-wrap items-center gap-1 text-base"><button className="hover:underline" onClick={() => setPrefix('')}>{b}</button>{crumbs.map((c, i) => <span key={i} className="flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 text-ink-soft" /><button className="hover:underline" onClick={() => setPrefix(crumbs.slice(0, i + 1).join('/') + '/')}>{c.length > 14 ? c.slice(0, 8) + '…' : c}</button></span>)}</span>} pad={false}>
          <Load state={ls}>
            {ls.data && !ls.data.folders.length && !ls.data.files.length ? <EmptyState title="This folder is empty" /> : <div className="overflow-x-auto"><table className="w-full" style={{ minWidth: 620 }}><thead><tr><th className="th">Name</th><th className="th">Size</th><th className="th">Modified</th><th className="th">Used by</th><th className="th" /></tr></thead>
              <tbody>
                {ls.data?.folders.map((f) => <tr key={f}><td className="td" colSpan={5}><button className="flex items-center gap-2 hover:underline" onClick={() => setPrefix(f)}><Folder className="h-4 w-4 text-gold" />{f.slice(prefix.length)}</button></td></tr>)}
                {ls.data?.files.map((f) => <tr key={f.key}>
                  <td className="td break-all">{f.name}</td><td className="td whitespace-nowrap">{fmtBytes(f.size)}</td><td className="td whitespace-nowrap">{fmtDateTime(f.lastModified)}</td><td className="td text-xs text-ink-soft">{f.referencedBy ?? '—'}</td>
                  <td className="td text-right whitespace-nowrap"><a className="btn-ghost btn-sm !px-2" aria-label={`Download ${f.name}`} href={apiUrl(`/admin/storage/download?bucket=${encodeURIComponent(b)}&key=${encodeURIComponent(f.key)}`)}><Download className="h-4 w-4" /></a><button className="btn-ghost btn-sm !px-2" aria-label={`Delete ${f.name}`} onClick={() => setDel({ key: f.key, ref: f.referencedBy })}><Trash2 className="h-4 w-4" /></button></td>
                </tr>)}
              </tbody></table></div>}
            {ls.data?.truncated && <p className="px-5 py-3 text-xs text-ink-soft">Showing the first 300 entries.</p>}
          </Load>
        </Card>
      </div>}</Load>
      <Confirm open={!!del} danger title={del?.force ? 'File is in use' : 'Delete file'} confirmLabel={del?.force ? 'Delete anyway' : 'Delete'} busy={busy === 'del'} onClose={() => setDel(null)} onConfirm={() => remove(!!del?.force)}
        message={del?.force ? <>{del.force}</> : <>Permanently delete <b className="break-all">{del?.key}</b>? This cannot be undone.{del?.ref && <span className="block mt-2 text-warning">Referenced by: {del.ref}</span>}</>} />
    </>
  );
}
