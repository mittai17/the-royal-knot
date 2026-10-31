'use client';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, PiggyBank, Percent, TrendingUp } from 'lucide-react';
import { Card, EmptyState, Field, Modal, Skeleton, StatCard, StatusBadge, ErrorState } from '@/components/ui/primitives';
import { Segmented, Select } from '@/components/shared/form-bits';
import { Can } from '@/components/shared/can';
import { BusyButton, D, SimpleTable } from '@/components/finance/fin-bits';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useWedding } from '@/lib/wedding-context';
import { notify } from '@/lib/toast';
import { humanize, inr, inrCompact, toNum } from '@/lib/utils';
import type { Money } from '@/types';

const tick = { fontSize: 11, fill: '#777078' };
type Tab = 'overall' | 'wedding' | 'category' | 'vendor';
interface Var { variance: Money; variancePct: number | null; overBudget: boolean }
interface Ov {
  totals: Var & { weddings: number; budgetedWeddings: number; revenue: Money; planned: Money; budgetedActual: Money; committed: Money; actual: Money; profit: Money; marginPct: number };
  byWedding: (Var & { weddingId: string; name: string; status: string; startDate: string; budgetSource: string; planned: Money; committed: Money; actual: Money; revenue: Money; profit: Money; marginPct: number })[];
  byCategory: (Var & { category: string; planned: Money; committed: Money; actual: Money })[];
  byVendor: { vendorId: string; vendor: string; bookings: number; committed: Money; billed: Money; paid: Money; remaining: Money }[];
}
interface BudgetDoc { id: string; version: number; name: string; items: { category: string; plannedAmount: Money }[] }

const VarCell = ({ v }: { v: Var }) => <span className={`tabular-nums ${v.overBudget ? 'text-danger' : toNum(v.variance) < 0 ? 'text-success' : ''}`}>{toNum(v.variance) > 0 ? '+' : ''}{inr(v.variance)}{v.variancePct != null && <span className="text-xs text-ink-soft"> ({v.variancePct > 0 ? '+' : ''}{v.variancePct}%)</span>}</span>;

function EditModal({ weddingId, name, onClose, onSaved }: { weddingId: string | null; name: string; onClose: () => void; onSaved: () => void }) {
  const cur = useApi<{ current: BudgetDoc | null }>(weddingId ? `/budgets/wedding/${weddingId}` : null);
  const [rows, setRows] = useState<{ category: string; plannedAmount: string }[]>([]);
  const [busy, setBusy] = useState('');
  useEffect(() => { if (cur.data) setRows(cur.data.current?.items.map((i) => ({ category: i.category, plannedAmount: String(toNum(i.plannedAmount)) })) ?? [{ category: 'Catering', plannedAmount: '' }]); }, [cur.data]);
  const total = rows.reduce((a, r) => a + (Number(r.plannedAmount) || 0), 0);
  const valid = rows.length > 0 && rows.every((r) => r.category.trim() && Number(r.plannedAmount) >= 0 && r.plannedAmount !== '');
  const save = async (mode: 'new' | 'update') => {
    setBusy(mode);
    const items = rows.map((r) => ({ category: r.category.trim(), plannedAmount: Number(r.plannedAmount) }));
    try {
      if (mode === 'update' && cur.data?.current) await api.patch(`/budgets/${cur.data.current.id}`, { items }); else await api.post('/budgets', { weddingId, items });
      notify.ok(mode === 'new' ? 'New budget version saved' : 'Budget updated'); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(''); }
  };
  return (
    <Modal open={!!weddingId} onClose={onClose} title={`Budget · ${name}`} footer={<>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      {cur.data?.current && <BusyButton className="btn-secondary" busy={busy === 'update'} disabled={!valid} onClick={() => save('update')}>Update v{cur.data.current.version}</BusyButton>}
      <BusyButton busy={busy === 'new'} disabled={!valid} onClick={() => save('new')}>Save as new version</BusyButton></>}>
      {cur.loading ? <Skeleton className="h-40" /> : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_140px_32px] gap-2">
              <input className="input" placeholder="Category" value={r.category} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} aria-label="Category" />
              <input className="input" type="number" min={0} placeholder="Planned ₹" value={r.plannedAmount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, plannedAmount: e.target.value } : x)))} aria-label="Planned amount" />
              <button className="btn-ghost btn-sm !px-2" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove">×</button>
            </div>
          ))}
          <button className="text-xs text-burgundy" onClick={() => setRows([...rows, { category: '', plannedAmount: '' }])}>+ Add category</button>
          <p className="text-sm pt-2">Total planned <span className="num">{inr(total)}</span></p>
          <p className="text-xs text-ink-soft">A new version that raises the total creates an approval request for the Founder.</p>
        </div>
      )}
    </Modal>
  );
}

export function BudgetsPanel() {
  const { weddings } = useWedding();
  const [tab, setTab] = useState<Tab>('overall');
  const [wid, setWid] = useState('');
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const ov = useApi<Ov>('/budgets/overview', { weddingId: wid || undefined });
  const o = ov.data;
  if (ov.error) return <Card><ErrorState message={ov.error} onRetry={ov.reload} /></Card>;
  const chart = (o?.byWedding ?? []).filter((w) => toNum(w.planned) > 0 || toNum(w.actual) > 0).slice(0, 10).map((w) => ({ name: w.name.replace(' Wedding', ''), Planned: toNum(w.planned), Committed: toNum(w.committed), Actual: toNum(w.actual) }));
  const catChart = (o?.byCategory ?? []).slice(0, 10).map((c) => ({ name: c.category, Planned: toNum(c.planned), Actual: toNum(c.actual) }));
  const t = o?.totals;
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {!t ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[94px] rounded-xl" />) : <>
          <StatCard label="Revenue" value={inrCompact(t.revenue)} hint={`${t.weddings} weddings`} icon={<Banknote className="h-5 w-5" />} />
          <StatCard label="Planned budget" value={inrCompact(t.planned)} hint={`${t.budgetedWeddings} budgeted · actual ${inrCompact(t.budgetedActual)}`} icon={<PiggyBank className="h-5 w-5" />} />
          <StatCard label="Net profit" value={inrCompact(t.profit)} hint={`Costs ${inrCompact(t.actual)}`} icon={<TrendingUp className="h-5 w-5" />} />
          <StatCard label="Margin" value={`${t.marginPct}%`} hint={t.overBudget ? <span className="text-danger">{t.variancePct}% over plan</span> : 'within plan'} icon={<Percent className="h-5 w-5" />} />
        </>}
      </div>
      <Card pad={false} title={<Segmented value={tab} onChange={setTab} options={[{ v: 'overall', l: 'Overall' }, { v: 'wedding', l: 'By wedding' }, { v: 'category', l: 'By category' }, { v: 'vendor', l: 'By vendor' }]} />}
        action={<Select className="!w-52" value={wid} onChange={setWid} placeholder="All weddings" options={weddings.map((w) => ({ v: w.id, l: w.name }))} />}>
        <div className="pt-1">
          {tab === 'overall' && (!o ? <Skeleton className="h-72 m-5" /> : !chart.length ? <EmptyState title="No budgets yet" hint="Set a budget on the “By wedding” tab to compare plan against actual cost." /> : (
            <div className="px-5 pb-5 grid xl:grid-cols-2 gap-6">
              <div><p className="label">Planned vs actual by wedding</p><div className="h-72"><ResponsiveContainer><BarChart data={chart}><CartesianGrid vertical={false} stroke="#E9E4DE" /><XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} /><YAxis tick={tick} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => inrCompact(v)} /><Tooltip formatter={(v) => inr(v as number)} /><Legend iconType="square" wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="Planned" fill="#C6A46A" radius={[3, 3, 0, 0]} /><Bar dataKey="Committed" fill="#E9E4DE" radius={[3, 3, 0, 0]} /><Bar dataKey="Actual" fill="#401827" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
              <div><p className="label">Planned vs actual by category (budgeted weddings)</p><div className="h-72"><ResponsiveContainer><BarChart data={catChart}><CartesianGrid vertical={false} stroke="#E9E4DE" /><XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} /><YAxis tick={tick} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => inrCompact(v)} /><Tooltip formatter={(v) => inr(v as number)} /><Legend iconType="square" wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="Planned" fill="#C6A46A" radius={[3, 3, 0, 0]} /><Bar dataKey="Actual" fill="#401827" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
            </div>
          ))}
          {tab === 'wedding' && (
            <SimpleTable head={['Wedding', 'Date', 'Planned', 'Committed', 'Actual cost', 'Variance', 'Revenue', 'Profit', 'Margin', '']} minWidth={1000} loading={ov.loading && !o} empty={!o?.byWedding.length}>
              {o?.byWedding.map((w) => (
                <tr key={w.weddingId}><td className="td font-medium">{w.name}<span className="block text-xs text-ink-soft">{w.budgetSource}</span></td><td className="td"><D v={w.startDate} /></td>
                  <td className="td tabular-nums">{toNum(w.planned) ? inr(w.planned) : <span className="text-ink-soft">Not set</span>}</td><td className="td tabular-nums">{inr(w.committed)}</td><td className="td tabular-nums">{inr(w.actual)}</td>
                  <td className="td">{toNum(w.planned) ? <VarCell v={w} /> : '—'}</td><td className="td tabular-nums">{inr(w.revenue)}</td><td className={`td tabular-nums ${toNum(w.profit) < 0 ? 'text-danger' : ''}`}>{inr(w.profit)}</td><td className={`td tabular-nums ${w.marginPct < 15 ? 'text-danger' : ''}`}>{w.marginPct.toFixed(1)}%</td>
                  <td className="td text-right"><Can roles={['FINANCE']}><button className="btn-secondary btn-sm" onClick={() => setEdit({ id: w.weddingId, name: w.name })}>{toNum(w.planned) ? 'Edit' : 'Set budget'}</button></Can></td></tr>
              ))}
            </SimpleTable>
          )}
          {tab === 'category' && (
            <SimpleTable head={['Category', 'Planned', 'Committed (vendors)', 'Actual', 'Variance']} loading={ov.loading && !o} empty={!o?.byCategory.length}>
              {o?.byCategory.map((c) => <tr key={c.category}><td className="td font-medium">{c.category}</td><td className="td tabular-nums">{toNum(c.planned) ? inr(c.planned) : '—'}</td><td className="td tabular-nums">{inr(c.committed)}</td><td className="td tabular-nums">{inr(c.actual)}</td><td className="td">{toNum(c.planned) ? <VarCell v={c} /> : <StatusBadge status="Unplanned" tone="neutral" />}</td></tr>)}
            </SimpleTable>
          )}
          {tab === 'vendor' && (
            <SimpleTable head={['Vendor', 'Bookings', 'Committed', 'Billed', 'Paid', 'Remaining']} loading={ov.loading && !o} empty={!o?.byVendor.length}>
              {o?.byVendor.map((v) => <tr key={v.vendorId}><td className="td font-medium">{v.vendor}</td><td className="td">{v.bookings}</td><td className="td tabular-nums">{inr(v.committed)}</td><td className="td tabular-nums">{inr(v.billed)}</td><td className="td tabular-nums">{inr(v.paid)}</td><td className="td tabular-nums">{inr(v.remaining)}</td></tr>)}
            </SimpleTable>
          )}
        </div>
        <p className="px-5 pb-4 text-xs text-ink-soft">Actual cost = vendor bills (settled invoice or negotiated amount plus approved extras) plus approved expenses. {humanize('committed')} = negotiated vendor contracts.</p>
      </Card>
      <EditModal weddingId={edit?.id ?? null} name={edit?.name ?? ''} onClose={() => setEdit(null)} onSaved={ov.reload} />
    </>
  );
}
