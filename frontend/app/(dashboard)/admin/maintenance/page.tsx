'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Confirm, Load, fmtBytes, useBusy } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { ago, humanize } from '@/lib/utils';

interface Info {
  app: { name: string; version: string; node: string; environment: string; startedAt: string };
  database: { version: string | null; sizeBytes: number; latestMigrations: { name: string; appliedAt: string | null }[] };
  update: { channel: string; message: string; currentVersion: string };
  history: { id: string; at: string; action: string; message: string; by: string | null }[];
}
interface Health { status: string; services: Record<string, { status: string; latencyMs: number | null }> }

const TASKS = [
  { key: 'clear-cache', label: 'Clear cache', desc: 'Removes application cache keys and in-memory caches. Job queues are never touched.', path: 'clear-cache', ok: 'Cache cleared' },
  { key: 'health', label: 'Run health check', desc: 'Probes database, Redis, MinIO, PDF service and Keycloak right now.', path: 'health-check', ok: 'Health check complete' },
  { key: 'optimize', label: 'Optimise database', desc: 'VACUUM ANALYZE: reclaims space and refreshes planner statistics.', path: 'optimize-database', ok: 'Database optimised', confirm: true },
  { key: 'reindex', label: 'Rebuild search indexes', desc: 'REINDEX of all application tables. Briefly locks tables; run off-peak.', path: 'reindex', ok: 'Indexes rebuilt', confirm: true },
] as const;

export default function MaintenancePage() {
  const info = useApi<Info>('/admin/maintenance/info');
  const [result, setResult] = useState<{ title: string; body: unknown } | null>(null);
  const [ask, setAsk] = useState<(typeof TASKS)[number] | null>(null);
  const { busy, run } = useBusy();
  const go = async (t: (typeof TASKS)[number]) => { setAsk(null); const r = await run(t.key, () => api.post(`/admin/maintenance/${t.path}`), t.ok); if (r) { setResult({ title: t.label, body: (r as { data: unknown }).data }); info.reload(); } };
  const health = result?.title === 'Run health check' ? (result.body as Health) : null;
  return (
    <>
      <PageHeader title="Maintenance" subtitle="Housekeeping tasks and application version." />
      <Load state={info}>{info.data && <div className="space-y-5">
        <div className="grid md:grid-cols-2 gap-4">{TASKS.map((t) => (
          <Card key={t.key} title={t.label}><p className="text-sm text-ink-soft mb-4">{t.desc}</p>
            <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => ('confirm' in t && t.confirm ? setAsk(t) : go(t))}>{busy === t.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Run</button></Card>))}
        </div>
        {result && <Card title={`Result: ${result.title}`}>
          {health ? <ul className="grid sm:grid-cols-5 gap-3 text-sm">{Object.entries(health.services).map(([k, v]) => <li key={k} className="rounded-lg border border-line p-3"><p className="capitalize font-medium">{k}</p><StatusBadge status={v.status === 'up' ? 'Up' : v.status} tone={v.status === 'up' ? 'success' : v.status === 'disabled' ? 'neutral' : 'danger'} /><p className="text-xs text-ink-soft mt-1">{v.latencyMs != null ? `${v.latencyMs} ms` : ''}</p></li>)}</ul>
            : <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-x-auto">{JSON.stringify(result.body, null, 2)}</pre>}
        </Card>}
        <div className="grid xl:grid-cols-2 gap-5">
          <Card title="Application & updates">
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-sm">
              <dt className="text-ink-soft">Version</dt><dd>{info.data.app.version}</dd><dt className="text-ink-soft">Environment</dt><dd>{info.data.app.environment}</dd><dt className="text-ink-soft">Node</dt><dd>{info.data.app.node}</dd><dt className="text-ink-soft">Running since</dt><dd>{ago(info.data.app.startedAt)}</dd>
              <dt className="text-ink-soft">Database</dt><dd>{info.data.database.version} · {fmtBytes(info.data.database.sizeBytes)}</dd><dt className="text-ink-soft">Latest migration</dt><dd className="break-all">{info.data.database.latestMigrations[0]?.name ?? '—'}</dd>
            </dl>
            <p className="text-sm text-ink-soft mt-4">{info.data.update.message}</p>
          </Card>
          <Card title="Recent maintenance">{!info.data.history.length ? <p className="text-sm text-ink-soft">Nothing run yet.</p> : <ul className="divide-y divide-line text-sm">{info.data.history.map((h) => <li key={h.id} className="flex justify-between gap-3 py-2"><span>{h.message ?? humanize(h.action)}{h.by && <span className="text-ink-soft"> · {h.by}</span>}</span><span className="text-xs text-ink-soft whitespace-nowrap">{ago(h.at)}</span></li>)}</ul>}</Card>
        </div>
      </div>}</Load>
      <Confirm open={!!ask} title={ask?.label ?? ''} message={ask?.desc} onConfirm={() => ask && go(ask)} onClose={() => setAsk(null)} confirmLabel="Run now" />
    </>
  );
}
