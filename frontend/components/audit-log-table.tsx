'use client';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { DownloadLink, Muted, Pager, SimpleTable, usePaged } from '@/components/finance/fin-bits';
import { useApi } from '@/hooks/use-api';
import { fmtDateTime, humanize } from '@/lib/utils';

interface Row { id: string; createdAt: string; action: string; entity: string; entityId?: string | null; message?: string | null; actor?: { id: string; name: string; role: string } | null; wedding?: { id: string; name: string } | null }
interface Filters { entities: string[]; actions: string[]; actors: { id: string; name: string; role: string }[] }

/**
 * Filterable audit trail (date / user / action / record) with CSV export. Used by /audit-logs (Finance, Founder) and /admin/audit (SysAdmin).
 * `basePath` is the list endpoint (default /audit); it must accept the same query (search, entity, action, actorId, from, to, weddingId) and `format=csv`.
 */
export function AuditLogTable({ basePath = '/audit', weddingId, title = 'Audit trail' }: { basePath?: string; weddingId?: string; title?: string }) {
  const [f, setF] = useState({ actorId: '', action: '', entity: '', from: '', to: '' });
  const filters = useApi<Filters>(`${basePath}/filters`);
  const q = useMemo(() => ({ actorId: f.actorId || undefined, action: f.action || undefined, entity: f.entity || undefined, from: f.from || undefined, to: f.to || undefined, weddingId }), [f, weddingId]);
  const p = usePaged<Row>(basePath, q, 20);
  const set = (k: keyof typeof f) => (v: string) => { setF({ ...f, [k]: v }); p.setPage(1); };
  const csv = `${basePath}?${new URLSearchParams({ format: 'csv', ...(p.search ? { search: p.search } : {}), ...Object.fromEntries(Object.entries(q).filter(([, v]) => v) as [string, string][]) }).toString()}`;
  const fd = filters.data;

  return (
    <Card pad={false} title={title} action={<DownloadLink href={csv} />}>
      <div className="px-5 pb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <input className="input lg:col-span-2" type="search" placeholder="Search description, record or user…" value={p.search} onChange={(e) => p.setSearch(e.target.value)} aria-label="Search audit log" />
        <Select value={f.actorId} onChange={set('actorId')} placeholder="All users" options={(fd?.actors ?? []).map((a) => ({ v: a.id, l: a.name }))} />
        <Select value={f.entity} onChange={set('entity')} placeholder="All records" options={(fd?.entities ?? []).map((e) => ({ v: e, l: humanize(e.replace(/([a-z])([A-Z])/g, '$1_$2')) }))} />
        <Select value={f.action} onChange={set('action')} placeholder="All actions" options={(fd?.actions ?? []).map((a) => ({ v: a, l: humanize(a) }))} />
        <div className="flex gap-2">
          <input className="input min-w-0" type="date" value={f.from} max={f.to || undefined} onChange={(e) => set('from')(e.target.value)} aria-label="From date" />
          <input className="input min-w-0" type="date" value={f.to} min={f.from || undefined} onChange={(e) => set('to')(e.target.value)} aria-label="To date" />
        </div>
      </div>
      <SimpleTable head={['When', 'User', 'Action', 'Record', 'Details']} loading={p.loading && !p.rows.length} error={p.error} onRetry={p.reload} empty={!p.rows.length} minWidth={760}>
        {p.rows.map((r) => (
          <tr key={r.id}>
            <td className="td whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
            <td className="td">{r.actor?.name ?? <span className="text-ink-soft">System</span>}{r.actor && <Muted>{humanize(r.actor.role)}</Muted>}</td>
            <td className="td"><span className="inline-flex rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium">{humanize(r.action)}</span></td>
            <td className="td">{humanize(r.entity.replace(/([a-z])([A-Z])/g, '$1_$2'))}{r.wedding && <Muted>{r.wedding.name}</Muted>}</td>
            <td className="td max-w-[420px]">{r.message ?? '—'}</td>
          </tr>
        ))}
      </SimpleTable>
      <Pager p={p} />
    </Card>
  );
}
