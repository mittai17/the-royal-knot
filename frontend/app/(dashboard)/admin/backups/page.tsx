'use client';
import { useState } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Confirm, Load, fmtBytes, useBusy, useInterval } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { api, apiUrl } from '@/lib/api';
import { fmtDateTime } from '@/lib/utils';

interface Rec { id: string; status: string; kind: string; size: number | null; note: string | null; startedAt: string; finishedAt: string | null; triggeredBy: string | null; format: string | null; location: string | null; durationMs: number | null }
interface Data { items: Rec[]; capabilities: { pgDump: boolean; format: string }; restoreHelp: string }
const tone = (s: string) => (s === 'SUCCESS' ? 'success' : s === 'FAILED' ? 'danger' : 'info');

export default function BackupsPage() {
  const l = useApi<Data>('/admin/backups');
  const running = l.data?.items.some((b) => b.status === 'RUNNING' || b.status === 'PENDING');
  useInterval(() => l.reload(), 3000, !!running);
  const [del, setDel] = useState<Rec | null>(null);
  const { busy, run } = useBusy();
  return (
    <>
      <PageHeader title="Backups & Recovery" subtitle={l.data ? `Method: ${l.data.capabilities.format}. Files are stored in MinIO.` : undefined}
        actions={<button className="btn-primary" disabled={!!running || busy === 'go'} onClick={() => run('go', async () => { await api.post('/admin/backups'); l.reload(); }, 'Backup started')}>{(running || busy === 'go') && <Loader2 className="h-4 w-4 animate-spin" />}{running ? 'Backup running…' : 'Back up now'}</button>} />
      <Load state={l}>{l.data && <div className="space-y-5">
        {!l.data.capabilities.pgDump && <div className="rounded-lg bg-warning-soft px-4 py-3 text-sm">pg_dump is not installed on the API host, so backups are a JSON export of every table (password hashes and sessions excluded, uploaded files not included). Install the PostgreSQL client tools in the API image for restore-grade dumps.</div>}
        <Card pad={false}>
          {!l.data.items.length ? <EmptyState title="No backups yet" hint="Use “Back up now” to create the first one." /> : <div className="overflow-x-auto"><table className="w-full" style={{ minWidth: 760 }}>
            <thead><tr><th className="th">Started</th><th className="th">Status</th><th className="th">Format</th><th className="th">Size</th><th className="th">By</th><th className="th">Notes</th><th className="th" /></tr></thead>
            <tbody>{l.data.items.map((b) => <tr key={b.id}>
              <td className="td whitespace-nowrap">{fmtDateTime(b.startedAt)}{b.durationMs != null && <span className="block text-xs text-ink-soft">{(b.durationMs / 1000).toFixed(1)} s</span>}</td>
              <td className="td"><StatusBadge status={b.status} tone={tone(b.status)} /></td><td className="td">{b.format ?? '—'}{b.location && <span className="block text-xs text-ink-soft">{b.location}</span>}</td>
              <td className="td">{fmtBytes(b.size)}</td><td className="td">{b.triggeredBy ?? 'System'}</td><td className="td max-w-[260px] text-xs text-ink-soft">{b.note ?? ''}</td>
              <td className="td text-right whitespace-nowrap">{b.status === 'SUCCESS' && <a className="btn-ghost btn-sm !px-2" aria-label="Download backup" href={apiUrl(`/admin/backups/${b.id}/download`)}><Download className="h-4 w-4" /></a>}{b.status !== 'RUNNING' && <button className="btn-ghost btn-sm !px-2" aria-label="Delete backup" onClick={() => setDel(b)}><Trash2 className="h-4 w-4" /></button>}</td>
            </tr>)}</tbody></table></div>}
        </Card>
        <Card title="Recovery"><p className="text-sm text-ink-soft">{l.data.restoreHelp}</p></Card>
      </div>}</Load>
      <Confirm open={!!del} danger title="Delete backup" confirmLabel="Delete" busy={busy === 'del'} message={<>Delete the backup from {del && fmtDateTime(del.startedAt)}? The file is removed from storage.</>} onClose={() => setDel(null)} onConfirm={() => run('del', async () => { await api.del(`/admin/backups/${del!.id}`); setDel(null); l.reload(); }, 'Backup deleted')} />
    </>
  );
}
