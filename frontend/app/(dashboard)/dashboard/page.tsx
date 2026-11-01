'use client';
import Link from 'next/link';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarCheck, CheckCircle2, Heart, IndianRupee, ListChecks, MessagesSquare, Store, Wallet } from 'lucide-react';
import { Hero } from '@/components/dashboard/hero';
import { Card, EmptyState, ErrorState, ProgressBar, Skeleton, StatCard, StatusBadge } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth';
import { ago, fmtDate, fmtTime, humanize, inr, inrCompact, toNum } from '@/lib/utils';
import type { DashboardData } from '@/types/analytics';

const COLORS = { burgundy: '#401827', gold: '#C6A46A', soft: '#E9E4DE', success: '#21845A', info: '#477BC4', warning: '#D99A35', danger: '#C94B4B' };
const tick = { fontSize: 11, fill: '#777078' };
const ViewAll = ({ href }: { href: string }) => <Link href={href} className="text-xs text-burgundy hover:underline">View All →</Link>;
const COVERS = ['linear-gradient(135deg,#401827,#8B4A55)', 'linear-gradient(135deg,#6B4A2B,#C6A46A)', 'linear-gradient(135deg,#28121D,#5B2A3C)', 'linear-gradient(135deg,#2C4A5E,#7FA3B8)'];
const monthLabel = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, (m ?? 1) - 1, 1).toLocaleString('en', { month: 'short', year: '2-digit' }); };

function Kpis({ d }: { d: DashboardData }) {
  const f = d.finance;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <StatCard label="Total Weddings" value={d.kpis.totalWeddings} hint={`${d.kpis.activeWeddings} active`} icon={<Heart className="h-5 w-5" />} />
      <StatCard label="Active Enquiries" value={d.kpis.activeEnquiries} hint="In pipeline" icon={<MessagesSquare className="h-5 w-5" />} />
      {f && <StatCard label="Contracted Revenue" value={inrCompact(f.contractedRevenue)} hint="This season" icon={<IndianRupee className="h-5 w-5" />} />}
      {f && <StatCard label="Payments Received" value={inrCompact(f.received)} hint={`${f.receivedPct}% of total`} icon={<Wallet className="h-5 w-5" />} />}
      <StatCard label="Active Vendors" value={d.kpis.activeVendors} hint="Working with us" icon={<Store className="h-5 w-5" />} />
      <StatCard label="Pending Tasks" value={d.kpis.pendingTasks} hint={d.kpis.overdueTasks ? `${d.kpis.overdueTasks} overdue` : 'On track'} icon={<ListChecks className="h-5 w-5" />} />
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const dash = useApi<DashboardData>('/dashboard');
  const pipe = useApi<{ followUpsDue: number }>('/enquiries/pipeline/summary');
  const d = dash.data;

  if (dash.error) return <ErrorState message={dash.error} onRetry={dash.reload} />;

  const to = d?.taskOverview;
  const donut = to ? [
    { name: 'Completed', value: to.byStatus.DONE ?? 0, c: COLORS.success },
    { name: 'In Progress', value: (to.byStatus.IN_PROGRESS ?? 0), c: COLORS.info },
    { name: 'Pending', value: (to.byStatus.TO_PLAN ?? 0) + (to.byStatus.BLOCKED ?? 0), c: COLORS.warning },
    { name: 'Overdue', value: to.overdue, c: COLORS.danger },
  ] : [];
  const rev = (d?.finance?.monthly ?? []).map((m) => ({ month: monthLabel(m.month), Contracted: toNum(m.revenue), Received: toNum(m.received), Outstanding: toNum(m.outstanding) }));
  const perf = (d?.finance?.monthly ?? []).map((m) => ({ month: monthLabel(m.month), Revenue: toNum(m.revenue), Profit: toNum(m.profit) }));

  return (
    <div className="space-y-5">
      <Hero name={user?.name ?? ''} weddings={d?.kpis.totalWeddings ?? 0} inProgress={d?.kpis.activeWeddings ?? 0} followUps={pipe.data?.followUpsDue ?? 0} />
      {d ? <Kpis d={d} /> : <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[94px] rounded-xl" />)}</div>}

      <div className="grid xl:grid-cols-[1fr_380px] gap-5">
        <Card title="Ongoing Weddings" action={<ViewAll href="/weddings" />}>
          {!d ? <Skeleton className="h-52 rounded-xl" /> : d.ongoingWeddings.length === 0 ? <EmptyState title="No ongoing weddings" /> : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {d.ongoingWeddings.map((w, i) => (
                <Link key={w.id} href={`/weddings/${w.id}`} className="rounded-xl border border-line overflow-hidden hover:shadow-pop transition-shadow bg-white">
                  <div className="relative h-28" style={{ background: COVERS[i % 4] }}>
                    <span className="absolute top-2.5 left-2.5"><StatusBadge status={w.status} /></span>
                    <svg className="absolute bottom-0 inset-x-0 opacity-30" viewBox="0 0 200 40" aria-hidden><path d="M0 40V28a16 16 0 0 1 32 0v12M40 40V24a20 20 0 0 1 40 0v16M88 40V28a16 16 0 0 1 32 0v12M128 40V24a20 20 0 0 1 40 0v16" fill="none" stroke="#fff" strokeWidth="1" /></svg>
                  </div>
                  <div className="p-3.5">
                    <p className="font-serif text-[17px] text-burgundy-deep truncate">{w.name}</p>
                    <p className="text-xs text-ink-soft mt-0.5 truncate">{fmtDate(w.startDate, 'MMM d')} – {fmtDate(w.endDate, 'd, yyyy')} · {w.venue ?? w.location}</p>
                    <div className="flex items-center justify-between text-xs text-ink-soft mt-2.5"><span>{w.expectedGuests} Guests</span><span>{w.budget ? inrCompact(w.budget) : ''}</span></div>
                    <div className="flex items-center gap-2 mt-2"><div className="flex-1"><ProgressBar value={w.progress} /></div><span className="text-[11px] tabular-nums text-ink-soft">{w.progress}%</span></div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title="Today’s Schedule" action={<span className="text-xs text-ink-soft">{d?.today.wedding?.name ?? fmtDate(new Date(), 'EEE, dd MMM')}</span>}>
          {!d ? <Skeleton className="h-52" /> : d.today.schedule.length === 0 ? <EmptyState title="Nothing scheduled today" hint="Event-day timelines appear here." /> : (
            <ol className="space-y-3">
              {d.today.schedule.slice(0, 7).map((t) => (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <span className="w-[62px] text-xs text-ink-soft tabular-nums">{fmtTime(t.scheduledAt)}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${t.status === 'COMPLETED' ? 'bg-success' : t.status === 'IN_PROGRESS' ? 'bg-warning' : t.status === 'DELAYED' ? 'bg-danger' : 'bg-line'}`} />
                  <span className="flex-1 truncate">{t.title}</span><StatusBadge status={t.status} />
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 2xl:grid-cols-4 gap-5">
        {d?.finance && (
          <Card title="Revenue Overview">
            {rev.length === 0 ? <EmptyState title="No revenue data yet" /> : (
              <div className="h-56"><ResponsiveContainer><BarChart data={rev} barGap={2}><CartesianGrid vertical={false} stroke="#E9E4DE" /><XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} /><YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => inrCompact(v)} width={56} /><Tooltip formatter={(v) => inr(v as number)} /><Legend iconType="square" wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="Contracted" fill={COLORS.burgundy} radius={[3, 3, 0, 0]} /><Bar dataKey="Received" fill={COLORS.gold} radius={[3, 3, 0, 0]} /><Bar dataKey="Outstanding" fill={COLORS.soft} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
            )}
          </Card>
        )}

        <Card title="Task Overview" action={<ViewAll href="/tasks" />}>
          {!to || to.total === 0 ? <EmptyState title="No tasks yet" /> : (
            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="relative h-32 w-32 shrink-0"><ResponsiveContainer><PieChart><Pie data={donut} dataKey="value" innerRadius={38} outerRadius={56} paddingAngle={2} stroke="none">{donut.map((x) => <Cell key={x.name} fill={x.c} />)}</Pie></PieChart></ResponsiveContainer><div className="absolute inset-0 grid place-items-center text-center pointer-events-none"><div><p className="num text-xl">{to.total}</p><p className="text-[10px] text-ink-soft">Total Tasks</p></div></div></div>
              <ul className="flex-1 min-w-[150px] space-y-2 text-sm">{donut.map((x) => <li key={x.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: x.c }} /><span className="flex-1 text-ink-soft">{x.name}</span><span className="tabular-nums font-medium">{x.value}</span></li>)}</ul>
            </div>
          )}
        </Card>

        {d?.finance && (
          <Card title="Upcoming Payments" action={<ViewAll href="/payments" />}>
            {d.finance.upcomingPayments.length === 0 ? <EmptyState title="Nothing due soon" /> : (
              <ul className="space-y-3">{d.finance.upcomingPayments.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center gap-3"><div className="h-9 w-9 rounded-lg bg-gold-soft grid place-items-center"><CalendarCheck className="h-4 w-4 text-burgundy" /></div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{p.wedding}</p><p className="text-xs text-ink-soft">{humanize(p.type)} · {fmtDate(p.dueDate, 'dd MMM')}</p></div>
                  <div className="text-right"><p className="num text-sm">{inrCompact(p.outstanding)}</p><StatusBadge status={p.overdue ? 'OVERDUE' : 'UPCOMING'} /></div></li>
              ))}</ul>
            )}
          </Card>
        )}

        <Card title="Live Vendor Status" action={<ViewAll href="/command-centre" />}>
          {!d || d.today.vendorStatus.length === 0 ? <EmptyState title="No vendor arrivals tracked" hint="Appears on event day." /> : (
            <ul className="space-y-3">{d.today.vendorStatus.slice(0, 5).map((v) => (
              <li key={v.id} className="flex items-center gap-3 text-sm"><div className="min-w-0 flex-1"><p className="truncate">{v.vendor.name}</p><p className="text-xs text-ink-soft">{v.arrival ? fmtTime(v.arrival.actualAt ?? v.arrival.expectedAt) : '—'}{!!v.arrival?.delayMinutes && <span className="text-danger"> · +{v.arrival.delayMinutes}m</span>}</p></div><StatusBadge status={v.arrival?.status ?? 'EXPECTED'} /></li>
            ))}</ul>
          )}
        </Card>
      </div>

      <div className="grid xl:grid-cols-[1.3fr_1fr_1fr] gap-5">
        <Card title="Recent Enquiries" action={<ViewAll href="/enquiries" />}>
          {!d || d.recentEnquiries.length === 0 ? <EmptyState title="No enquiries yet" /> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-ink-soft"><th className="py-2 font-semibold">Couple</th><th className="font-semibold">Date</th><th className="font-semibold">Budget</th><th className="font-semibold">Status</th></tr></thead><tbody>
              {d.recentEnquiries.map((e) => <tr key={e.id} className="border-t border-line/70"><td className="py-2.5"><Link href="/enquiries" className="hover:underline">{e.couple}</Link><span className="block text-xs text-ink-soft">{e.assignedTo ?? 'Unassigned'}</span></td><td className="text-ink-soft">{fmtDate(e.preferredDate, 'MMM d, yyyy')}</td><td className="tabular-nums">{e.budget ? inrCompact(e.budget) : '—'}</td><td><StatusBadge status={e.stage} /></td></tr>)}
            </tbody></table></div>
          )}
        </Card>

        <Card title="Recent Activity">
          {!d || d.recentActivity.filter((a) => !/signed (in|out)/i.test(a.message ?? "")).length === 0 ? <EmptyState title="No activity yet" /> : (
            <ul className="space-y-3">{d.recentActivity.filter((a) => !/signed (in|out)/i.test(a.message ?? "")).slice(0, 6).map((a) => <li key={a.id} className="flex items-start gap-3 text-sm"><CheckCircle2 className="h-4 w-4 text-burgundy mt-0.5 shrink-0" /><span className="flex-1">{a.message}{a.wedding && <span className="text-ink-soft"> ({a.wedding})</span>}</span><span className="text-xs text-ink-soft whitespace-nowrap">{ago(a.at)}</span></li>)}</ul>
          )}
        </Card>

        {d?.finance && (
          <Card title="Season Performance">
            {perf.length === 0 ? <EmptyState title="No data yet" /> : (<>
              <div className="h-52"><ResponsiveContainer><AreaChart data={perf}><CartesianGrid vertical={false} stroke="#E9E4DE" /><XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} /><YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => inrCompact(v)} width={56} /><Tooltip formatter={(v) => inr(v as number)} /><Area dataKey="Revenue" stroke={COLORS.burgundy} fill={COLORS.burgundy} fillOpacity={0.08} strokeWidth={2} /><Area dataKey="Profit" stroke={COLORS.gold} fill={COLORS.gold} fillOpacity={0.12} strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-line"><div><p className="num text-lg">{inrCompact(d.finance.contractedRevenue)}</p><p className="text-[11px] text-ink-soft">Total Revenue</p></div><div><p className="num text-lg">{inrCompact(d.finance.netProfit)}</p><p className="text-[11px] text-ink-soft">Net Profit</p></div><div><p className="num text-lg">{Math.round(d.finance.marginPct)}%</p><p className="text-[11px] text-ink-soft">Profit Margin</p></div></div>
            </>)}
          </Card>
        )}
      </div>
    </div>
  );
}
