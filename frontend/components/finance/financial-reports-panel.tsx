'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/primitives';
import { DownloadLink, SimpleTable } from '@/components/finance/fin-bits';
import { useApi } from '@/hooks/use-api';
import { fmtDate, humanize, inr } from '@/lib/utils';

type Kind = 'text' | 'money' | 'pct' | 'date' | 'int';
type Col = [key: string, label: string, kind?: Kind];
interface Report { id: string; title: string; hint: string; cols: Col[]; totals?: (t: Record<string, unknown>) => [string, unknown, Kind?][]; extra?: { key: string; title: string; cols: Col[] } }

const REPORTS: Report[] = [
  { id: 'profitability', title: 'Profitability', hint: 'Revenue, cost and margin for every wedding.', cols: [['wedding', 'Wedding'], ['date', 'Date', 'date'], ['status', 'Status'], ['revenue', 'Revenue', 'money'], ['vendorCosts', 'Vendor costs', 'money'], ['teamCosts', 'Team', 'money'], ['otherExpenses', 'Other', 'money'], ['netProfit', 'Net profit', 'money'], ['marginPct', 'Margin', 'pct']],
    totals: (t) => [['Weddings', t.weddings, 'int'], ['Revenue', t.revenue, 'money'], ['Costs', Number(t.vendorCosts) + Number(t.expenses), 'money'], ['Net profit', t.netProfit, 'money'], ['Margin', t.marginPct, 'pct']] },
  { id: 'receivables', title: 'Receivables', hint: 'Unpaid milestones and invoices, aged by due date.', cols: [['source', 'Source'], ['reference', 'Reference'], ['wedding', 'Wedding'], ['dueDate', 'Due', 'date'], ['total', 'Total', 'money'], ['paid', 'Paid', 'money'], ['outstanding', 'Outstanding', 'money'], ['daysOverdue', 'Days late', 'int'], ['ageing', 'Ageing']],
    totals: (t) => [['Outstanding', t.outstanding, 'money'], ['Overdue', t.overdue, 'money'], ['Items', t.items, 'int']], extra: { key: 'ageing', title: 'Ageing', cols: [['bucket', 'Bucket'], ['count', 'Items', 'int'], ['outstanding', 'Outstanding', 'money']] } },
  { id: 'vendor-payments', title: 'Vendor payments', hint: 'What each vendor is owed, paid and still due.', cols: [['vendor', 'Vendor'], ['wedding', 'Wedding'], ['category', 'Service'], ['committed', 'Committed', 'money'], ['billed', 'Billed', 'money'], ['paid', 'Paid', 'money'], ['remaining', 'Remaining', 'money'], ['settlement', 'Settlement']],
    totals: (t) => [['Billed', t.billed, 'money'], ['Paid', t.paid, 'money'], ['Remaining', t.remaining, 'money'], ['Bills outstanding', t.billsOutstanding, 'money'], ['Overdue bills', t.billsOverdue, 'int']], extra: { key: 'apAgeing', title: 'Vendor bills ageing', cols: [['bucket', 'Bucket'], ['count', 'Bills', 'int'], ['outstanding', 'Outstanding', 'money']] } },
  { id: 'expense-analysis', title: 'Expense analysis', hint: 'Approved expenses by category and month.', cols: [['category', 'Category'], ['count', 'Entries', 'int'], ['amount', 'Amount', 'money'], ['sharePct', 'Share', 'pct']],
    totals: (t) => [['Approved', t.approved, 'money'], ['Pending', t.pending, 'money'], ['Team costs', t.teamCosts, 'money'], ['Entries', t.count, 'int']], extra: { key: 'monthly', title: 'By month', cols: [['month', 'Month'], ['amount', 'Amount', 'money']] } },
  { id: 'gst', title: 'GST summary', hint: 'Output tax on issued invoices vs input tax on verified vendor bills.', cols: [['month', 'Month'], ['taxableSales', 'Taxable sales', 'money'], ['outputTax', 'Output GST', 'money'], ['taxablePurchases', 'Taxable purchases', 'money'], ['inputTax', 'Input GST', 'money'], ['netPayable', 'Net payable', 'money']],
    totals: (t) => [['Output GST', t.outputTax, 'money'], ['Input GST', t.inputTax, 'money'], ['Net payable', t.netPayable, 'money']] },
  { id: 'season', title: 'Season performance', hint: 'Weddings, revenue and profit by month of the year.', cols: [['month', 'Month'], ['weddings', 'Weddings', 'int'], ['revenue', 'Revenue', 'money'], ['netProfit', 'Net profit', 'money'], ['marginPct', 'Margin', 'pct'], ['avgGuests', 'Avg guests', 'int'], ['avgValue', 'Avg value', 'money']],
    totals: (t) => [['Weddings', t.weddings, 'int'], ['Peak month', t.peakMonth ?? '—']] },
];

const fmt = (v: unknown, k: Kind = 'text') => {
  if (v == null || v === '') return '—';
  if (k === 'money') return inr(v);
  if (k === 'pct') return `${Number(v).toFixed(1)}%`;
  if (k === 'date') return fmtDate(String(v));
  if (k === 'int') return String(v);
  return /^[A-Z_]+$/.test(String(v)) ? humanize(String(v)) : String(v);
};

export function FinancialReportsPanel() {
  const [id, setId] = useState('profitability');
  const [range, setRange] = useState({ from: '', to: '' });
  const rep = REPORTS.find((r) => r.id === id)!;
  const q = { from: range.from || undefined, to: range.to || undefined };
  const r = useApi<Record<string, unknown>>(`/analytics/financial/${id}`, q);
  const rows = (r.data?.rows as Record<string, unknown>[] | undefined) ?? [];
  const totals = r.data?.totals as Record<string, unknown> | undefined;
  const extra = rep.extra ? (r.data?.[rep.extra.key] as Record<string, unknown>[] | undefined) : undefined;
  const csv = `/analytics/financial/${id}?${new URLSearchParams({ format: 'csv', ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) })}`;
  const note = r.data?.note as string | undefined;
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-5">
        {REPORTS.map((x) => <button key={x.id} onClick={() => setId(x.id)} className={`px-3 h-9 rounded-lg text-sm border ${x.id === id ? 'bg-burgundy text-white border-burgundy' : 'bg-white border-line text-ink hover:bg-surface-2'}`}>{x.title}</button>)}
      </div>
      <Card pad={false} title={rep.title} action={<div className="flex flex-wrap gap-2 justify-end">
        <input className="input !w-40" type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From date" />
        <input className="input !w-40" type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To date" />
        <DownloadLink href={csv} />
      </div>}>
        <p className="px-5 -mt-2 pb-3 text-sm text-ink-soft">{rep.hint}</p>
        {totals && rep.totals && !r.loading && (
          <div className="px-5 pb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            {rep.totals(totals).map(([label, v, k]) => <div key={label} className="rounded-xl bg-surface-2 px-4 py-3"><p className="text-xs text-ink-soft">{label}</p><p className="num text-lg">{fmt(v, k)}</p></div>)}
          </div>
        )}
        <SimpleTable head={rep.cols.map((c) => c[1])} loading={r.loading && !r.data} error={r.error} onRetry={r.reload} empty={!rows.length} minWidth={760}>
          {rows.map((row, i) => <tr key={i}>{rep.cols.map(([k, , kind], j) => <td key={k} className={`td ${kind && kind !== 'text' && kind !== 'date' ? 'tabular-nums' : ''} ${j === 0 ? 'font-medium' : ''}`}>{fmt(row[k], kind)}</td>)}</tr>)}
        </SimpleTable>
        {rep.extra && !!extra?.length && (
          <div className="border-t border-line mt-2 pt-3"><p className="label px-5">{rep.extra.title}</p>
            <SimpleTable head={rep.extra.cols.map((c) => c[1])} minWidth={400}>{extra.map((row, i) => <tr key={i}>{rep.extra!.cols.map(([k, , kind]) => <td key={k} className="td">{fmt(row[k], kind)}</td>)}</tr>)}</SimpleTable></div>
        )}
        {note && <p className="px-5 py-3 text-xs text-ink-soft">{note}</p>}
      </Card>
    </>
  );
}
