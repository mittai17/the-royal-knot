'use client';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { SearchInput, Segmented } from '@/components/shared/form-bits';
import { Load, useInterval } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { fmtDateTime } from '@/lib/utils';

interface Data { logs: { id: number; time: string; level: string; context: string; message: string }[]; counts: Record<string, number>; bufferSize: number; bufferMax: number; failedJobs: { queue: string; id: string; name: string; reason: string; attempts: number; at: string | null }[] }
const LV: Record<string, string> = { error: 'text-danger', warn: 'text-[#A8701A]', log: 'text-ink-soft', debug: 'text-ink-soft', verbose: 'text-ink-soft' };

export default function SupportLogsPage() {
  const [level, setLevel] = useState<'' | 'error' | 'warn' | 'log'>('');
  const [search, setSearch] = useState('');
  const [auto, setAuto] = useState(false);
  const d = useApi<Data>('/admin/support-logs', { level: level || undefined, search: search || undefined, limit: 300 });
  useInterval(() => d.reload(), 5000, auto);
  return (
    <>
      <PageHeader title="Support & Logs" subtitle={d.data ? `Last ${d.data.bufferSize} of ${d.data.bufferMax} application log lines (kept in memory, cleared on restart).` : undefined} actions={<>
        <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[#401827]" />Live (5 s)</label>
        <button className="btn-secondary" onClick={() => d.reload()}><RefreshCw className="h-4 w-4" />Refresh</button></>} />
      <div className="flex flex-wrap gap-3 mb-4"><Segmented value={level} onChange={setLevel} options={[{ v: '', l: 'All' }, { v: 'error', l: `Errors${d.data ? ` (${d.data.counts.error ?? 0})` : ''}` }, { v: 'warn', l: `Warnings${d.data ? ` (${d.data.counts.warn ?? 0})` : ''}` }, { v: 'log', l: 'Info' }]} /><SearchInput value={search} onChange={setSearch} placeholder="Search logs…" /></div>
      <Load state={d}>{d.data && <div className="space-y-5">
        <Card title="Application log" pad={false}>
          {!d.data.logs.length ? <EmptyState title="No log lines match" /> : <div className="max-h-[480px] overflow-auto font-mono text-xs divide-y divide-line/60">{d.data.logs.map((l) => <div key={l.id} className="px-4 py-1.5 flex gap-3"><span className="text-ink-soft whitespace-nowrap">{fmtDateTime(l.time)}</span><span className={`w-10 shrink-0 uppercase ${LV[l.level] ?? ''}`}>{l.level}</span><span className="text-ink-soft w-24 shrink-0 truncate">{l.context}</span><span className="break-all whitespace-pre-wrap min-w-0">{l.message}</span></div>)}</div>}
        </Card>
        <Card title="Failed background jobs" pad={false}>
          {!d.data.failedJobs.length ? <EmptyState title="No failed jobs" /> : <div className="overflow-x-auto"><table className="w-full" style={{ minWidth: 560 }}><thead><tr><th className="th">Queue</th><th className="th">Job</th><th className="th">Reason</th><th className="th">Attempts</th><th className="th">When</th></tr></thead><tbody>{d.data.failedJobs.map((j) => <tr key={`${j.queue}-${j.id}`}><td className="td">{j.queue}</td><td className="td">{j.name} #{j.id}</td><td className="td text-danger break-words max-w-[360px]">{j.reason}</td><td className="td">{j.attempts}</td><td className="td whitespace-nowrap">{fmtDateTime(j.at)}</td></tr>)}</tbody></table></div>}
        </Card>
      </div>}</Load>
    </>
  );
}
