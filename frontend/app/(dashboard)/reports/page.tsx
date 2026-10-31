'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, Percent, TrendingUp, Wallet } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, StatCard, StatusBadge, Skeleton } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Segmented } from '@/components/shared/form-bits';
import { useApi, asRows } from '@/hooks/use-api';
import { fmtDate, humanize, inr, inrCompact, toNum } from '@/lib/utils';
import type { Overview, Profitability, TeamLoad, VendorPerf, WeddingProfit } from '@/types/analytics';
import { RoleGate } from '@/components/shared/can';
import { G } from '@/lib/permissions';

const tick = { fontSize: 11, fill: '#777078' };
type Tab = 'profit' | 'vendors' | 'team';
const money = (k: keyof WeddingProfit) => ({ accessorFn: (w: WeddingProfit) => toNum(w[k]), cell: ({ row: { original: w } }: { row: { original: WeddingProfit } }) => <span className="tabular-nums">{inr(w[k])}</span> });

const profitCols: ColumnDef<WeddingProfit, unknown>[] = [
  { id: 'name', header: 'Wedding', accessorFn: (w) => w.name, cell: ({ row: { original: w } }) => <Link href={`/weddings/${w.weddingId}`} className="font-medium hover:underline">{w.name}</Link> },
  { id: 'revenue', header: 'Revenue', ...money('revenue') },
  { id: 'additionalRevenue', header: 'Additional', ...money('additionalRevenue') },
  { id: 'received', header: 'Received', ...money('received') },
  { id: 'vendorCosts', header: 'Vendor costs', ...money('vendorCosts') },
  { id: 'teamCosts', header: 'Team', ...money('teamCosts') },
  { id: 'otherExpenses', header: 'Other', ...money('otherExpenses') },
  { id: 'receivables', header: 'Receivable', ...money('receivables') },
  { id: 'payables', header: 'Vendor payable', ...money('payables') },
  { id: 'grossProfit', header: 'Gross profit', ...money('grossProfit') },
  { id: 'netProfit', header: 'Net profit', accessorFn: (w) => toNum(w.netProfit), cell: ({ row: { original: w } }) => <span className={`num ${toNum(w.netProfit) < 0 ? 'text-danger' : ''}`}>{inr(w.netProfit)}</span> },
  { id: 'margin', header: 'Margin', accessorFn: (w) => w.marginPct, cell: ({ row: { original: w } }) => <span className={`num ${w.marginPct < 15 ? 'text-danger' : w.marginPct > 30 ? 'text-success' : ''}`}>{w.marginPct.toFixed(1)}%</span> },
];
const vendorCols: ColumnDef<VendorPerf, unknown>[] = [
  { id: 'name', header: 'Vendor', accessorFn: (v) => v.name, cell: ({ row: { original: v } }) => <div><p className="font-medium">{v.name}</p><p className="text-xs text-ink-soft">{humanize(v.category)}</p></div> },
  { id: 'assignments', header: 'Assignments', accessorFn: (v) => v.assignments },
  { id: 'timeliness', header: 'On-time', accessorFn: (v) => v.timelinessPct ?? -1, cell: ({ row: { original: v } }) => v.timelinessPct == null ? <span className="text-ink-soft">No data</span> : <span className={v.timelinessPct < 75 ? 'text-danger num' : 'num'}>{v.timelinessPct}%</span> },
  { id: 'delay', header: 'Avg delay', accessorFn: (v) => v.avgDelayMinutes, cell: ({ row: { original: v } }) => `${v.avgDelayMinutes} min` },
  { id: 'quoted', header: 'Quoted', accessorFn: (v) => toNum(v.quoted), cell: ({ row: { original: v } }) => <span className="tabular-nums">{toNum(v.quoted) ? inr(v.quoted) : '—'}</span> },
  { id: 'actual', header: 'Actual', accessorFn: (v) => toNum(v.actual), cell: ({ row: { original: v } }) => <span className="tabular-nums">{toNum(v.actual) ? inr(v.actual) : '—'}</span> },
  { id: 'variance', header: 'Variance', accessorFn: (v) => v.costVariancePct ?? 0, cell: ({ row: { original: v } }) => v.costVariancePct == null ? '—' : <span className={`tabular-nums ${v.costVariancePct > 0 ? 'text-danger' : 'text-success'}`}>{v.costVariancePct > 0 ? '+' : ''}{v.costVariancePct}%</span> },
  { id: 'reliability', header: 'Reliability', accessorFn: (v) => v.reliabilityScore, cell: ({ row: { original: v } }) => <span className={`num ${v.reliabilityScore < 70 ? 'text-danger' : v.reliabilityScore >= 90 ? 'text-success' : ''}`}>{v.reliabilityScore}</span> },
  { id: 'rating', header: 'Rating', accessorFn: (v) => v.rating, cell: ({ row: { original: v } }) => v.rating.toFixed(1) },
];
const teamCols: ColumnDef<TeamLoad, unknown>[] = [
  { id: 'name', header: 'Team member', accessorFn: (t) => t.name, cell: ({ row: { original: t } }) => <div><p className="font-medium">{t.name}</p><p className="text-xs text-ink-soft">{humanize(t.role)}</p></div> },
  { id: 'w', header: 'Weddings', accessorFn: (t) => t.assignedWeddings },
  { id: 'open', header: 'Open tasks', accessorFn: (t) => t.openTasks },
  { id: 'done', header: 'Completed', accessorFn: (t) => t.completedTasks },
  { id: 'over', header: 'Overdue', accessorFn: (t) => t.overdueTasks, cell: ({ row: { original: t } }) => <span className={t.overdueTasks ? 'text-danger num' : ''}>{t.overdueTasks}</span> },
];

function ReportsPageInner() {
  const [tab, setTab] = useState<Tab>('profit');
  const ov = useApi<Overview>('/analytics/overview');
  const pr = useApi<Profitability>('/analytics/profitability');
  const vp = useApi<unknown>(tab === 'vendors' ? '/analytics/vendors' : null);
  const tm = useApi<unknown>(tab === 'team' ? '/analytics/team' : null);
  const profits = pr.data?.weddings ?? [];
  const chart = profits.slice(0, 12).map((w) => ({ name: w.name.replace(' Wedding', ''), Revenue: toNum(w.revenue), Costs: toNum(w.vendorCosts) + toNum(w.teamCosts) + toNum(w.otherExpenses), Profit: toNum(w.netProfit) }));
  const o = ov.data;

  if (ov.error) return <><PageHeader title="Reports & Analytics" /><Card><ErrorState message={ov.error} onRetry={ov.reload} /></Card></>;
  return (
    <>
      <PageHeader title="Reports & Analytics" subtitle="Which weddings made money, and which vendors earned their place." />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {!o ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[94px] rounded-xl" />) : <>
          <StatCard label="Total revenue" value={inrCompact(o.totals.revenue)} hint={`${o.totals.weddings} weddings · avg ${inrCompact(o.totals.averageWeddingValue)}`} icon={<Banknote className="h-5 w-5" />} />
          <StatCard label="Total expenses" value={inrCompact(o.totals.totalExpenses)} hint={`Vendor payables ${inrCompact(o.totals.payables)}`} icon={<Wallet className="h-5 w-5" />} />
          <StatCard label="Net profit" value={inrCompact(o.totals.netProfit)} hint={`Additional revenue ${inrCompact(o.totals.additionalRevenue)}`} icon={<TrendingUp className="h-5 w-5" />} />
          <StatCard label="Profit margin" value={`${Math.round(o.totals.marginPct)}%`} hint={`Receivables ${inrCompact(o.totals.receivables)}`} icon={<Percent className="h-5 w-5" />} />
        </>}
      </div>
      <div className="grid xl:grid-cols-[1fr_340px] gap-5 mb-5">
        <Card title="Revenue, costs and profit by wedding">
          {pr.loading ? <Skeleton className="h-72" /> : chart.length === 0 ? <EmptyState title="No data yet" /> : <div className="h-72"><ResponsiveContainer><BarChart data={chart}><CartesianGrid vertical={false} stroke="#E9E4DE" /><XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} /><YAxis tick={tick} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => inrCompact(v)} /><Tooltip formatter={(v) => inr(v as number)} /><Legend iconType="square" wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="Revenue" fill="#401827" radius={[3, 3, 0, 0]} /><Bar dataKey="Costs" fill="#E9E4DE" radius={[3, 3, 0, 0]} /><Bar dataKey="Profit" fill="#C6A46A" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>}
        </Card>
        <div className="space-y-5">
          <Card title="Most profitable"><ul className="space-y-2.5 text-sm">{(o?.mostProfitable ?? []).slice(0, 3).map((w) => <li key={w.weddingId} className="flex justify-between"><span>{w.name}</span><span className="num text-success">{inrCompact(w.netProfit)}</span></li>)}{!o?.mostProfitable?.length && <li className="text-ink-soft">—</li>}</ul></Card>
          <Card title="Lowest margin"><ul className="space-y-2.5 text-sm">{(o?.lowestMargin ?? []).slice(0, 3).map((w) => <li key={w.weddingId} className="flex justify-between"><span>{w.name}</span><span className={`num ${w.marginPct < 15 ? 'text-danger' : ''}`}>{w.marginPct.toFixed(1)}%</span></li>)}{!o?.lowestMargin?.length && <li className="text-ink-soft">—</li>}</ul></Card>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <Card title="Upcoming client payments"><ul className="divide-y divide-line text-sm">{(o?.upcomingClientPayments ?? []).slice(0, 5).map((p) => <li key={p.id} className="py-2 flex items-center gap-3"><span className="flex-1">{p.wedding}<span className="block text-xs text-ink-soft">{humanize(p.type)} · {fmtDate(p.dueDate)}</span></span><span className="num">{inrCompact(p.outstanding)}</span><StatusBadge status={p.overdue ? 'OVERDUE' : 'UPCOMING'} /></li>)}{!o?.upcomingClientPayments?.length && <li className="py-3 text-ink-soft">Nothing upcoming.</li>}</ul></Card>
        <Card title="Upcoming vendor payments"><ul className="divide-y divide-line text-sm">{(o?.upcomingVendorPayments ?? []).slice(0, 5).map((p) => <li key={p.weddingVendorId} className="py-2 flex items-center gap-3"><span className="flex-1">{p.vendor}<span className="block text-xs text-ink-soft">{p.wedding} · {humanize(p.category)}</span></span><span className="num">{inrCompact(p.remainingPayable)}</span></li>)}{!o?.upcomingVendorPayments?.length && <li className="py-3 text-ink-soft">Nothing upcoming.</li>}</ul></Card>
      </div>
      <Card pad={false} title={<Segmented value={tab} onChange={setTab} options={[{ v: 'profit', l: 'Wedding profitability' }, { v: 'vendors', l: 'Vendor performance' }, { v: 'team', l: 'Team workload' }]} />}>
        <div className="pt-2">
          {tab === 'profit' && <DataTable columns={profitCols} data={profits} loading={pr.loading} error={pr.error} onRetry={pr.reload} />}
          {tab === 'vendors' && <DataTable columns={vendorCols} data={asRows<VendorPerf>(vp.data)} loading={vp.loading} error={vp.error} onRetry={vp.reload} />}
          {tab === 'team' && <DataTable columns={teamCols} data={asRows<TeamLoad>(tm.data)} loading={tm.loading} error={tm.error} onRetry={tm.reload} />}
        </div>
      </Card>
    </>
  );
}


export default function ReportsPage() {
  return <RoleGate roles={G.ANALYTICS}><ReportsPageInner /></RoleGate>;
}
