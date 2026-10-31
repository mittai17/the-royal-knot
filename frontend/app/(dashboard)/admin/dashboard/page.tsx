'use client';
import Link from 'next/link';
import { Activity, HardDrive, HeartHandshake, ShieldCheck, Users } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, PageHeader, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Load, fmtBytes } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { ago, humanize } from '@/lib/utils';

interface Dash {
  users: { total: number; active: number }; roles: { total: number; active: number }; weddings: { active: number; total: number };
  storage: { documentBytes: number; documents: number; bucketBytes: number | null; bucketObjects: number | null };
  activity: { date: string; events: number; logins: number; failedLogins: number; activeUsers: number }[]; security: { failedLogins24h: number };
  health: { status: string; services: Record<string, { status: string; latencyMs: number | null }> };
  recent: { id: string; at: string; action: string; entity: string; message?: string; actor?: string }[];
}

export default function AdminDashboard() {
  const d = useApi<Dash>('/admin/dashboard');
  const x = d.data;
  return (
    <>
      <PageHeader title="System Administration" subtitle="Users, activity and the health of the platform." />
      <Load state={d}>
        {x && <div className="space-y-5">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Total users" value={x.users.total} hint={`${x.users.active} active`} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Active roles" value={`${x.roles.active}/${x.roles.total}`} hint="with active users" icon={<ShieldCheck className="h-5 w-5" />} />
            <StatCard label="Active weddings" value={x.weddings.active} hint={`${x.weddings.total} total`} icon={<HeartHandshake className="h-5 w-5" />} />
            <StatCard label="Storage used" value={fmtBytes(x.storage.bucketBytes ?? x.storage.documentBytes)} hint={`${x.storage.bucketObjects ?? x.storage.documents} files`} icon={<HardDrive className="h-5 w-5" />} />
          </div>
          <div className="grid xl:grid-cols-3 gap-5">
            <Card title="User activity, last 30 days" className="xl:col-span-2" action={<span className="text-xs text-ink-soft">{x.security.failedLogins24h} failed sign-ins in 24 h</span>}>
              <div className="h-64" role="img" aria-label="Daily events, sign-ins and active users for the last 30 days">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={x.activity} margin={{ left: -16, right: 8, top: 8 }}>
                    <CartesianGrid stroke="#E9E4DE" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 11 }} interval={4} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="events" name="Events" stroke="#401827" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="logins" name="Sign-ins" stroke="#C6A46A" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="activeUsers" name="Active users" stroke="#477BC4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 text-xs text-ink-soft mt-2"><span><i className="inline-block h-2 w-2 rounded-full bg-burgundy mr-1" />Events</span><span><i className="inline-block h-2 w-2 rounded-full bg-gold mr-1" />Sign-ins</span><span><i className="inline-block h-2 w-2 rounded-full bg-info mr-1" />Active users</span></div>
            </Card>
            <Card title="System health" action={<Link href="/admin/monitoring" className="text-xs text-burgundy hover:underline">Monitoring</Link>}>
              <div className="flex items-center gap-2 mb-3"><Activity className="h-4 w-4 text-ink-soft" /><StatusBadge status={x.health.status === 'ok' ? 'ACTIVE' : x.health.status.toUpperCase()} tone={x.health.status === 'ok' ? 'success' : x.health.status === 'degraded' ? 'warning' : 'danger'} /></div>
              <ul className="divide-y divide-line text-sm">{Object.entries(x.health.services).map(([k, s]) => <li key={k} className="flex items-center justify-between py-2"><span className="capitalize">{k}</span><span className="flex items-center gap-2 text-xs text-ink-soft">{s.latencyMs != null && `${s.latencyMs} ms`}<StatusBadge status={s.status === 'up' ? 'ACTIVE' : s.status} tone={s.status === 'up' ? 'success' : s.status === 'disabled' ? 'neutral' : 'danger'} /></span></li>)}</ul>
            </Card>
          </div>
          <Card title="Recent activity" action={<Link href="/admin/audit" className="text-xs text-burgundy hover:underline">Audit log</Link>}>
            <ul className="divide-y divide-line text-sm">{x.recent.map((r) => <li key={r.id} className="flex justify-between gap-3 py-2"><span className="min-w-0 truncate">{r.message ?? `${humanize(r.entity)} ${r.action}`}{r.actor && <span className="text-ink-soft"> · {r.actor}</span>}</span><span className="text-xs text-ink-soft whitespace-nowrap">{ago(r.at)}</span></li>)}</ul>
          </Card>
        </div>}
      </Load>
    </>
  );
}
