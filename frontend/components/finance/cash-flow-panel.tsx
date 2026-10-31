'use client';
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Scale } from 'lucide-react';
import { Card, ErrorState, Skeleton, StatCard } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { SimpleTable } from '@/components/finance/fin-bits';
import { useApi } from '@/hooks/use-api';
import { useWedding } from '@/lib/wedding-context';
import { inr, inrCompact, toNum } from '@/lib/utils';
import type { Money } from '@/types';
import { useState } from 'react';

const tick = { fontSize: 11, fill: '#777078' };
interface Month { month: string; inflow: Money; outflow: Money; inflowActual: Money; inflowForecast: Money; outflowActual: Money; outflowForecast: Money; net: Money; cumulative: Money; isForecast: boolean; isCurrent: boolean }
interface Flow { currentMonth: string; months: Month[]; totals: { inflowActual: Money; outflowActual: Money; inflowForecast: Money; outflowForecast: Money; net: Money; netToDate: Money }; notes: string }
const label = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });

export function CashFlowPanel() {
  const { weddings } = useWedding();
  const [wid, setWid] = useState('');
  const r = useApi<Flow>('/budgets/cash-flow', { weddingId: wid || undefined });
  if (r.error) return <Card><ErrorState message={r.error} onRetry={r.reload} /></Card>;
  const d = r.data;
  const data = (d?.months ?? []).map((m) => ({ name: label(m.month), Inflow: toNum(m.inflow), Outflow: toNum(m.outflow), Cumulative: toNum(m.cumulative), forecast: m.isForecast }));
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {!d ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[94px] rounded-xl" />) : <>
          <StatCard label="Cash in (actual)" value={inrCompact(d.totals.inflowActual)} hint={`+ ${inrCompact(d.totals.inflowForecast)} forecast`} icon={<ArrowDownRight className="h-5 w-5" />} />
          <StatCard label="Cash out (actual)" value={inrCompact(d.totals.outflowActual)} hint={`+ ${inrCompact(d.totals.outflowForecast)} forecast`} icon={<ArrowUpRight className="h-5 w-5" />} />
          <StatCard label="Net to date" value={inrCompact(d.totals.netToDate)} icon={<Scale className="h-5 w-5" />} />
          <StatCard label="Net incl. forecast" value={inrCompact(d.totals.net)} hint="over the window shown" icon={<Scale className="h-5 w-5" />} />
        </>}
      </div>
      <Card title="Inflow, outflow and running net" action={<Select className="!w-52" value={wid} onChange={setWid} placeholder="All weddings" options={weddings.map((w) => ({ v: w.id, l: w.name }))} />}>
        {!d ? <Skeleton className="h-72" /> : (
          <>
            <div className="h-72"><ResponsiveContainer><ComposedChart data={data}><CartesianGrid vertical={false} stroke="#E9E4DE" /><XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} /><YAxis tick={tick} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => inrCompact(v)} /><Tooltip formatter={(v) => inr(v as number)} /><Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Inflow" fill="#21845A" radius={[3, 3, 0, 0]}>{data.map((x, i) => <Cell key={i} fillOpacity={x.forecast ? 0.45 : 1} />)}</Bar>
              <Bar dataKey="Outflow" fill="#C94B4B" radius={[3, 3, 0, 0]}>{data.map((x, i) => <Cell key={i} fillOpacity={x.forecast ? 0.45 : 1} />)}</Bar>
              <Line type="monotone" dataKey="Cumulative" stroke="#401827" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div>
            <p className="text-xs text-ink-soft mt-2">Lighter bars are forecast months. {d.notes}</p>
          </>
        )}
      </Card>
      <Card pad={false} title="By month" className="mt-5">
        <div className="pt-1"><SimpleTable head={['Month', 'Inflow', 'Outflow', 'Net', 'Running net', '']} loading={!d} empty={!d?.months.length}>
          {d?.months.map((m) => <tr key={m.month}><td className="td font-medium">{label(m.month)}{m.isCurrent && <span className="ml-2 text-xs text-ink-soft">this month</span>}</td>
            <td className="td tabular-nums">{inr(m.inflow)}{toNum(m.inflowForecast) > 0 && <span className="block text-xs text-ink-soft">{inr(m.inflowForecast)} forecast</span>}</td>
            <td className="td tabular-nums">{inr(m.outflow)}{toNum(m.outflowForecast) > 0 && <span className="block text-xs text-ink-soft">{inr(m.outflowForecast)} forecast</span>}</td>
            <td className={`td tabular-nums ${toNum(m.net) < 0 ? 'text-danger' : ''}`}>{inr(m.net)}</td><td className={`td tabular-nums ${toNum(m.cumulative) < 0 ? 'text-danger' : ''}`}>{inr(m.cumulative)}</td>
            <td className="td text-xs text-ink-soft">{m.isForecast ? 'Forecast' : m.isCurrent ? 'Actual + forecast' : 'Actual'}</td></tr>)}
        </SimpleTable></div>
      </Card>
    </>
  );
}
