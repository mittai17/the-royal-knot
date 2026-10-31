'use client';
import { useState } from 'react';
import { Loader2, QrCode, ReceiptText } from 'lucide-react';
import { Card, EmptyState, Modal, PageHeader, ProgressBar, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Async, FileLink, QrSvg } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDate, humanize, inr, toNum } from '@/lib/utils';

interface Payment { id: string; amount: string; method: string; reference?: string | null; paidAt: string; receiptNo: string }
interface Data {
  wedding: { name: string; contractValue: string };
  totals: { expected: string; received: string; outstanding: string };
  milestones: { id: string; type: string; dueDate: string; expectedAmount: string; received: string; outstanding: string; status: string; payments: Payment[] }[];
  receipts: (Payment & { milestone: string })[];
  invoices: { id: string; invoiceNo: string; status: string; issueDate: string; dueDate?: string | null; total: string; amountPaid: string }[];
}
interface Upi { amount: string; payee: string; upiUri: string; milestone: string }

export default function Page() {
  const q = useApi<Data>('/portal/client/payments');
  const [qr, setQr] = useState<Upi | null>(null);
  const [busy, setBusy] = useState('');
  const pay = async (id: string) => {
    setBusy(id);
    try { setQr((await api.get<Upi>('/portal/client/payments/upi-qr', { milestoneId: id })).data); } catch (e) { notify.err(e); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Payments & Invoices" subtitle="Your payment schedule, receipts and outstanding balance." />
      <Async q={q}>
        {(d) => {
          const pct = toNum(d.totals.expected) ? Math.round((toNum(d.totals.received) / toNum(d.totals.expected)) * 100) : 0;
          return (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total payable" value={inr(d.totals.expected)} hint="incl. approved extras" />
                <StatCard label="Paid so far" value={inr(d.totals.received)} hint={`${pct}% complete`} />
                <StatCard label="Outstanding balance" value={inr(d.totals.outstanding)} />
                <StatCard label="Receipts" value={d.receipts.length} />
              </div>
              <Card title="Payment schedule" pad={false}>
                <div className="px-5 pb-3"><ProgressBar value={pct} tone="success" /></div>
                {d.milestones.length === 0 ? <EmptyState title="No payment milestones yet" hint="Your payment schedule is set up once your agreement is confirmed." /> : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[720px] dt"><thead><tr><th className="th">Milestone</th><th className="th">Due</th><th className="th">Amount</th><th className="th">Paid</th><th className="th">Balance</th><th className="th">Status</th><th className="th" /></tr></thead>
                    <tbody>{d.milestones.map((m) => (
                      <tr key={m.id}><td className="td font-medium">{humanize(m.type)}</td><td className="td">{fmtDate(m.dueDate)}</td><td className="td num">{inr(m.expectedAmount)}</td><td className="td num">{inr(m.received)}</td><td className="td num">{inr(m.outstanding)}</td><td className="td"><StatusBadge status={m.status} /></td>
                        <td className="td text-right">{toNum(m.outstanding) > 0 && <button className="btn-primary btn-sm" disabled={busy === m.id} onClick={() => pay(m.id)}>{busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}Pay now</button>}</td></tr>
                    ))}</tbody></table></div>
                )}
              </Card>
              <div className="grid gap-5 lg:grid-cols-2">
                <Card title="Receipts" pad={false}>
                  {d.receipts.length === 0 ? <EmptyState title="No payments received yet" /> : (
                    <ul className="divide-y divide-line">{d.receipts.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><ReceiptText className="h-4 w-4 text-ink-soft" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{inr(r.amount)} · {humanize(r.milestone)}</p><p className="text-xs text-ink-soft">{fmtDate(r.paidAt)} · {humanize(r.method)} · {r.receiptNo}</p></div><FileLink path={`/portal/client/payments/${r.id}/receipt`} label="Receipt" /></li>
                    ))}</ul>
                  )}
                </Card>
                <Card title="Invoices" pad={false}>
                  {d.invoices.length === 0 ? <EmptyState title="No invoices issued" hint="Invoices from The Royal Knot appear here once sent." /> : (
                    <ul className="divide-y divide-line">{d.invoices.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{i.invoiceNo} · {inr(i.total)}</p><p className="text-xs text-ink-soft">Issued {fmtDate(i.issueDate)}{i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ''} · paid {inr(i.amountPaid)}</p></div><StatusBadge status={i.status} /></li>
                    ))}</ul>
                  )}
                </Card>
              </div>
            </>
          );
        }}
      </Async>
      <Modal open={!!qr} onClose={() => setQr(null)} title="Pay by UPI" width="max-w-sm">
        {qr && (
          <div className="text-center space-y-3">
            <QrSvg value={qr.upiUri} />
            <p className="num text-2xl">{inr(qr.amount)}</p>
            <p className="text-sm text-ink-soft">{humanize(qr.milestone)} milestone · pay to <span className="font-medium text-ink">{qr.payee}</span></p>
            <a className="btn-primary w-full justify-center" href={qr.upiUri}>Open in UPI app</a>
            <p className="text-xs text-ink-soft">Scan with any UPI app. Your planner records the payment once it reaches the bank, and a receipt appears here.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
