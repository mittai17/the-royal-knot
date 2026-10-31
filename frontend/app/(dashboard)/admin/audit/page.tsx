'use client';
import { PageHeader, StatCard } from '@/components/ui/primitives';
import { AuditLogTable } from '@/components/audit-log-table';
import { Card } from '@/components/ui/primitives';
import { Load } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { fmtDateTime } from '@/lib/utils';

interface Sum { logins24h: number; failedLogins24h: number; usersActive24h: number; recentFailedLogins: { id: string; at: string; message?: string; ip: string | null }[] }

export default function AdminAuditPage() {
  const s = useApi<Sum>('/admin/audit/summary');
  return (
    <>
      <PageHeader title="Audit Logs & Security" subtitle="Every change and sign-in, with filters and CSV export." />
      <Load state={s}>{s.data && <div className="grid xl:grid-cols-4 gap-4 mb-5">
        <StatCard label="Sign-ins (24 h)" value={s.data.logins24h} />
        <StatCard label="Failed sign-ins (24 h)" value={<span className={s.data.failedLogins24h ? 'text-danger' : ''}>{s.data.failedLogins24h}</span>} />
        <StatCard label="Users active (24 h)" value={s.data.usersActive24h} />
        <Card title="Latest failed sign-ins" className="xl:col-span-1">{s.data.recentFailedLogins.length === 0 ? <p className="text-sm text-ink-soft">None.</p> : <ul className="text-xs space-y-1">{s.data.recentFailedLogins.map((r) => <li key={r.id} className="flex justify-between gap-2"><span className="truncate">{r.ip ?? 'unknown ip'}</span><span className="text-ink-soft whitespace-nowrap">{fmtDateTime(r.at)}</span></li>)}</ul>}</Card>
      </div>}</Load>
      <AuditLogTable />
    </>
  );
}
