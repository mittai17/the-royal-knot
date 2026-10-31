'use client';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, PageHeader, StatCard } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { Load, fmtBytes } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { ago, humanize } from '@/lib/utils';

interface Rep {
  days: number; totals: { events: number; logins: number; failedLogins: number; activeUsers: number };
  userActivity: { userId: string; name: string; role: string | null; actions: number; logins: number; lastActive: string | null }[];
  moduleUsage: { module: string; events: number }[]; daily: { date: string; events: number; logins: number; failedLogins: number }[];
  errors: { errorsSinceStart: number; errorsInRange: number; warningsInRange: number; failedLogins: number; failedJobs: number; note: string };
  storage: { bucketBytes: number | null; bucketObjects: number | null; documentsByCategory: { category: string; count: number; bytes: number }[]; usersByRole: { role: string; count: number }[] };
}

export default function AdminReports() {
  const [days, setDays] = useState('30');
  const r = useApi<Rep>('/admin/reports', { days });
  const x = r.data;
  return (
    <>
      <PageHeader title="Reports" subtitle="User activity, module usage, errors and storage." actions={<Select className="w-40" value={days} onChange={setDays} options={[{ v: '7', l: 'Last 7 days' }, { v: '30', l: 'Last 30 days' }, { v: '90', l: 'Last 90 days' }]} />} />
      <Load state={r}>{x && <div className="space-y-5">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard label="Events" value={x.totals.events} /><StatCard label="Sign-ins" value={x.totals.logins} /><StatCard label="Failed sign-ins" value={x.totals.failedLogins} />
          <StatCard label="App errors" value={x.errors.errorsInRange} hint={`${x.errors.warningsInRange} warnings`} /><StatCard label="Failed jobs" value={x.errors.failedJobs} />
        </div>
        <div className="grid xl:grid-cols-2 gap-5">
          <Card title="Daily activity"><div className="h-56" role="img" aria-label="Daily events and sign-ins"><ResponsiveContainer width="100%" height="100%"><LineChart data={x.daily} margin={{ left: -16, right: 8 }}><CartesianGrid stroke="#E9E4DE" vertical={false} /><XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 11 }} minTickGap={24} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Line dataKey="events" name="Events" stroke="#401827" strokeWidth={2} dot={false} /><Line dataKey="logins" name="Sign-ins" stroke="#C6A46A" strokeWidth={2} dot={false} /><Line dataKey="failedLogins" name="Failed" stroke="#C94B4B" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></Card>
          <Card title="Module usage (events)"><div className="h-56" role="img" aria-label="Events by module"><ResponsiveContainer width="100%" height="100%"><BarChart data={x.moduleUsage.slice(0, 10)} layout="vertical" margin={{ left: 40, right: 8 }}><CartesianGrid stroke="#E9E4DE" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="module" tick={{ fontSize: 11 }} width={90} /><Tooltip /><Bar dataKey="events" name="Events" fill="#401827" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></Card>
        </div>
        <div className="grid xl:grid-cols-2 gap-5">
          <Card title="Most active users" pad={false}><div className="overflow-x-auto"><table className="w-full" style={{ minWidth: 440 }}><thead><tr><th className="th">User</th><th className="th">Actions</th><th className="th">Sign-ins</th><th className="th">Last active</th></tr></thead><tbody>{x.userActivity.map((u) => <tr key={u.userId}><td className="td">{u.name}<span className="block text-xs text-ink-soft">{humanize(u.role)}</span></td><td className="td">{u.actions}</td><td className="td">{u.logins}</td><td className="td">{u.lastActive ? ago(u.lastActive) : '—'}</td></tr>)}</tbody></table></div></Card>
          <Card title="Storage">
            <p className="text-sm mb-3">Primary bucket: <b>{fmtBytes(x.storage.bucketBytes)}</b> in {x.storage.bucketObjects ?? '—'} objects</p>
            <table className="w-full text-sm"><thead><tr><th className="th">Document category</th><th className="th">Files</th><th className="th">Size</th></tr></thead><tbody>{x.storage.documentsByCategory.map((c) => <tr key={c.category}><td className="td">{humanize(c.category)}</td><td className="td">{c.count}</td><td className="td">{fmtBytes(c.bytes)}</td></tr>)}</tbody></table>
            <p className="text-xs text-ink-soft mt-3">{x.errors.note}</p>
          </Card>
        </div>
      </div>}</Load>
    </>
  );
}
