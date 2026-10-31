'use client';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, PageHeader, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Load, Meter, fmtBytes, fmtDuration, useInterval } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { fmtTime } from '@/lib/utils';

interface Snap {
  status: string; time: string; sampledSince: string;
  services: { name: string; status: string; latencyMs: number | null; uptimePct: number | null; samples: number }[];
  process: { pid: number; node: string; uptimeSeconds: number; cpuPct: number; rssBytes: number; heapUsedBytes: number; heapTotalBytes: number };
  system: { hostname: string; platform: string; cpus: number; cpuModel: string; cpuPct: number; loadAvg: number[]; totalMemBytes: number; freeMemBytes: number; uptimeSeconds: number };
  disks: { path: string; totalBytes: number; usedBytes: number; freeBytes: number; usedPct: number }[];
  history: { t: number; process: number; system: number; rssMb: number }[];
}

export default function MonitoringPage() {
  const s = useApi<Snap>('/admin/monitoring');
  const [auto, setAuto] = useState(true);
  useInterval(() => s.reload(), 10_000, auto);
  const x = s.data;
  const memPct = x ? ((x.system.totalMemBytes - x.system.freeMemBytes) / x.system.totalMemBytes) * 100 : 0;
  return (
    <>
      <PageHeader title="System Monitoring" subtitle="Service status, uptime and resource usage." actions={<>
        <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[#401827]" />Auto-refresh (10 s)</label>
        <button className="btn-secondary" onClick={() => s.reload()}><RefreshCw className="h-4 w-4" />Refresh</button></>} />
      <Load state={s}>{x && <div className="space-y-5">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Overall" value={<StatusBadge status={x.status === 'ok' ? 'Healthy' : x.status} tone={x.status === 'ok' ? 'success' : x.status === 'degraded' ? 'warning' : 'danger'} />} hint={`checked ${fmtTime(x.time)}`} />
          <StatCard label="API CPU" value={`${x.process.cpuPct}%`} hint={`system ${x.system.cpuPct}% · ${x.system.cpus} cores`} />
          <StatCard label="API memory" value={fmtBytes(x.process.rssBytes)} hint={`heap ${fmtBytes(x.process.heapUsedBytes)}`} />
          <StatCard label="API uptime" value={fmtDuration(x.process.uptimeSeconds)} hint={`host ${fmtDuration(x.system.uptimeSeconds)}`} />
        </div>
        <div className="grid xl:grid-cols-3 gap-5">
          <Card title="Services" className="xl:col-span-2" pad={false}>
            <div className="overflow-x-auto"><table className="w-full" style={{ minWidth: 480 }}><thead><tr><th className="th">Service</th><th className="th">Status</th><th className="th">Latency</th><th className="th">Uptime</th></tr></thead>
              <tbody>{x.services.map((v) => <tr key={v.name}><td className="td capitalize font-medium">{v.name}</td><td className="td"><StatusBadge status={v.status === 'up' ? 'Up' : v.status} tone={v.status === 'up' ? 'success' : v.status === 'disabled' ? 'neutral' : 'danger'} /></td><td className="td">{v.latencyMs != null ? `${v.latencyMs} ms` : '—'}</td><td className="td">{v.uptimePct != null ? `${v.uptimePct}%` : '—'} <span className="text-xs text-ink-soft">({v.samples} checks)</span></td></tr>)}</tbody></table></div>
            <p className="px-5 py-3 text-xs text-ink-soft">Uptime is measured by this API since {fmtTime(x.sampledSince)} and resets when it restarts.</p>
          </Card>
          <Card title="Resources">
            <div className="space-y-4 text-sm">
              <div><div className="flex justify-between mb-1"><span>System memory</span><span>{fmtBytes(x.system.totalMemBytes - x.system.freeMemBytes)} / {fmtBytes(x.system.totalMemBytes)}</span></div><Meter pct={memPct} /></div>
              {x.disks.map((d) => <div key={d.path}><div className="flex justify-between mb-1"><span>Disk <code>{d.path}</code></span><span>{fmtBytes(d.usedBytes)} / {fmtBytes(d.totalBytes)}</span></div><Meter pct={d.usedPct} /></div>)}
              <p className="text-xs text-ink-soft">Load average {x.system.loadAvg.join(' · ')}<br />{x.system.platform} · Node {x.process.node}</p>
            </div>
          </Card>
        </div>
        <Card title="CPU, last 15 minutes">
          {x.history.length < 2 ? <p className="text-sm text-ink-soft">Collecting samples…</p> : <div className="h-52" role="img" aria-label="CPU usage history"><ResponsiveContainer width="100%" height="100%"><LineChart data={x.history} margin={{ left: -16, right: 8 }}>
            <CartesianGrid stroke="#E9E4DE" vertical={false} /><XAxis dataKey="t" tickFormatter={(t: number) => fmtTime(new Date(t))} tick={{ fontSize: 11 }} minTickGap={40} /><YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 'auto']} />
            <Tooltip labelFormatter={(t) => fmtTime(new Date(Number(t)))} /><Line dataKey="system" name="System" stroke="#C6A46A" strokeWidth={2} dot={false} isAnimationActive={false} /><Line dataKey="process" name="API" stroke="#401827" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>}
        </Card>
      </div>}</Load>
    </>
  );
}
