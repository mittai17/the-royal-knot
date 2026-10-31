'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, X, Loader2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, EmptyState, Field, Modal, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Select } from '@/components/shared/form-bits';
import { useApi, asRows } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { PAYMENT_METHODS } from '@/lib/enums';
import { fmtDate, humanize, inr, inrCompact, toInputDate, toNum } from '@/lib/utils';
import type { Expense, Vendor } from '@/types';

interface Summary { rows: { category: string; planned: string; actual: string; variance: string; overBudget: boolean }[]; totals: { planned: string; actual: string } }

function ExpenseForm({ weddingId, open, onClose, onSaved }: { weddingId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const vendors = asRows<Vendor>(useApi<unknown>(open ? '/vendors' : null, { pageSize: 100 }).data);
  const [f, setF] = useState({ category: '', description: '', amount: '', date: toInputDate(new Date().toISOString()), method: 'BANK_TRANSFER', vendorId: '', isTeamCost: false });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post('/expenses', { weddingId, ...f, amount: Number(f.amount), vendorId: f.vendorId || undefined }); notify.ok('Expense logged'); setF({ ...f, description: '', amount: '' }); onSaved(); onClose(); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Log expense" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.category || !f.description || !Number(f.amount)} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save expense</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Category"><input className="input" list="exp-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /><datalist id="exp-cats">{['Decoration', 'Catering', 'Photography', 'Transportation', 'Logistics', 'Team', 'Miscellaneous'].map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Amount (₹)"><input className="input" type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Description" className="col-span-2"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Method"><Select value={f.method} onChange={(v) => setF({ ...f, method: v })} options={PAYMENT_METHODS} /></Field>
        <Field label="Vendor (optional)" className="col-span-2"><Select value={f.vendorId} onChange={(v) => setF({ ...f, vendorId: v })} options={vendors.map((v) => ({ v: v.id, l: v.name }))} placeholder="None" /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#401827]" checked={f.isTeamCost} onChange={(e) => setF({ ...f, isTeamCost: e.target.checked })} />Internal team cost</label>
      </div>
    </Modal>
  );
}

export function ExpensesPanel({ weddingId }: { weddingId: string }) {
  const { can } = useAuth();
  const list = useApi<unknown>('/expenses', { weddingId, pageSize: 200, sort: 'date', order: 'desc' });
  const sum = useApi<Summary>(`/weddings/${weddingId}/expense-summary`);
  const [adding, setAdding] = useState(false);
  const reloadAll = () => { list.reload(); sum.reload(); };
  const decide = async (e: Expense, status: 'APPROVED' | 'REJECTED') => { try { await api.post(`/expenses/${e.id}/decision`, { status }); reloadAll(); } catch (err) { notify.err(err); } };

  const chart = (sum.data?.rows ?? []).map((r) => ({ category: r.category, Planned: toNum(r.planned), Actual: toNum(r.actual) }));
  const cols: ColumnDef<Expense, unknown>[] = [
    { id: 'date', header: 'Date', accessorFn: (e) => e.date, cell: ({ row: { original: e } }) => fmtDate(e.date, 'dd MMM') },
    { id: 'desc', header: 'Expense', enableSorting: false, cell: ({ row: { original: e } }) => <div><p className="font-medium">{e.description}</p><p className="text-xs text-ink-soft">{e.category}{e.vendor ? ` · ${e.vendor.name}` : ''}{e.isTeamCost ? ' · team' : ''}</p></div> },
    { id: 'responsible', header: 'Responsible', enableSorting: false, cell: ({ row: { original: e } }) => e.responsible?.name ?? '—' },
    { id: 'method', header: 'Method', enableSorting: false, cell: ({ row: { original: e } }) => humanize(e.method) },
    { id: 'amount', header: 'Amount', accessorFn: (e) => toNum(e.amount), cell: ({ row: { original: e } }) => <span className="num">{inr(e.amount)}</span> },
    { id: 'status', header: 'Approval', enableSorting: false, cell: ({ row: { original: e } }) => <StatusBadge status={e.status} /> },
    { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: e } }) => e.status === 'PENDING' && can('FINANCE') ? <span className="flex gap-1"><button className="btn-secondary btn-sm !px-2" aria-label="Approve" onClick={() => decide(e, 'APPROVED')}><Check className="h-4 w-4 text-success" /></button><button className="btn-secondary btn-sm !px-2" aria-label="Reject" onClick={() => decide(e, 'REJECTED')}><X className="h-4 w-4 text-danger" /></button></span> : null },
  ];

  return (
    <div className="space-y-5">
      <div className="grid xl:grid-cols-[1fr_380px] gap-5">
        <Card title="Planned vs actual" action={<span className="text-xs text-ink-soft">{inrCompact(sum.data?.totals.actual)} of {inrCompact(sum.data?.totals.planned)} planned</span>}>
          {chart.length === 0 ? <EmptyState title="No budget lines yet" /> : <div style={{ height: Math.max(260, chart.length * 34 + 48) }}><ResponsiveContainer><BarChart data={chart} layout="vertical" margin={{ left: 8 }} barGap={2}><CartesianGrid horizontal={false} stroke="#E9E4DE" /><XAxis type="number" tick={{ fontSize: 11, fill: '#777078' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => inrCompact(v)} /><YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#777078' }} axisLine={false} tickLine={false} width={104} interval={0} /><Tooltip formatter={(v) => inr(v as number)} /><Legend iconType="square" wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="Planned" fill="#E9E4DE" radius={[0, 3, 3, 0]} barSize={9} /><Bar dataKey="Actual" fill="#401827" radius={[0, 3, 3, 0]} barSize={9} /></BarChart></ResponsiveContainer></div>}
        </Card>
        <Card title="By category">
          <ul className="divide-y divide-line text-sm">{(sum.data?.rows ?? []).map((r) => { return <li key={r.category} className="flex justify-between py-2"><span>{r.category}</span><span className={r.overBudget ? 'text-danger num' : 'num'}>{inr(r.actual)} <span className="text-ink-soft font-normal">/ {inr(r.planned)}</span></span></li>; })}</ul>
        </Card>
      </div>
      <Card title="Expenses" action={<button className="btn-primary btn-sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Log expense</button>} pad={false}>
        <DataTable columns={cols} data={asRows<Expense>(list.data)} loading={list.loading} error={list.error} onRetry={list.reload} emptyTitle="No expenses logged" />
      </Card>
      <ExpenseForm weddingId={weddingId} open={adding} onClose={() => setAdding(false)} onSaved={reloadAll} />
    </div>
  );
}
