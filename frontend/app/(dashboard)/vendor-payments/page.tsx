'use client';
import { useState } from 'react';
import { Wallet, Clock, CheckCircle, AlertTriangle, ArrowUpRight, Search } from 'lucide-react';
import { PageHeader, Card, EmptyState, StatCard, StatusBadge, Skeleton } from '@/components/ui/primitives';
import { RoleGate } from '@/components/shared/can';
import { SearchInput } from '@/components/shared/form-bits';
import { useApi, asRows } from '@/hooks/use-api';
import { fmtDate, inr } from '@/lib/utils';

interface VendorPaymentItem {
  id: string;
  amount: number | string;
  status: string;
  kind?: string;
  method?: string;
  reference?: string | null;
  scheduledFor?: string | null;
  paidAt?: string | null;
  reason?: string | null;
  notes?: string | null;
  wedding?: { id: string; name: string } | null;
  weddingVendor?: { vendor: { id: string; name: string; category?: string } } | null;
  bill?: { id: string; billNumber?: string } | null;
  createdAt: string;
}

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'requests', label: 'Requests' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'advances', label: 'Advances' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'history', label: 'History' },
  { id: 'failed', label: 'Failed' },
] as const;

export default function VendorPaymentsPage() {
  const [tab, setTab] = useState<string>('all');
  const [search, setSearch] = useState('');

  const summary = useApi<{
    totalPaid?: number | string;
    awaitingApproval?: number | string;
    scheduled?: number | string;
    failed?: number | string;
  }>('/vendor-payments/summary');

  const paymentsApi = useApi<{ items?: VendorPaymentItem[]; total?: number } | VendorPaymentItem[]>(
    '/vendor-payments',
    {
      tab: tab === 'all' ? undefined : tab,
      search: search || undefined,
    }
  );

  const rawRows = asRows<VendorPaymentItem>(paymentsApi.data);
  const rows = Array.isArray(rawRows) ? rawRows : [];

  return (
    <RoleGate roles={['FINANCE', 'PLANNER']}>
      <PageHeader
        title="Vendor Payments"
        subtitle="Manage vendor payment requests, approvals, scheduled disbursements and final settlements."
      />

      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Paid"
            value={inr(summary.data?.totalPaid ?? 0)}
            icon={<CheckCircle className="h-5 w-5" />}
          />
          <StatCard
            label="Scheduled"
            value={inr(summary.data?.scheduled ?? 0)}
            icon={<Clock className="h-5 w-5" />}
          />
          <StatCard
            label="Awaiting Approval"
            value={inr(summary.data?.awaitingApproval ?? 0)}
            icon={<Wallet className="h-5 w-5" />}
          />
          <StatCard
            label="Failed / Alerts"
            value={inr(summary.data?.failed ?? 0)}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
        </div>

        <Card pad={false}>
          <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 bg-surface-2 p-1 rounded-lg">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tab === t.id
                      ? 'bg-white text-burgundy shadow-card'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="w-64">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search vendor or wedding…"
              />
            </div>
          </div>
          {paymentsApi.loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No vendor payments found"
                hint={
                  tab === 'all'
                    ? 'Vendor payments and disbursement records will appear here.'
                    : `No records in ${tab}.`
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-1 text-xs text-ink-soft">
                    <th className="py-3 px-4 font-medium">Vendor</th>
                    <th className="py-3 px-4 font-medium">Wedding</th>
                    <th className="py-3 px-4 font-medium">Kind</th>
                    <th className="py-3 px-4 font-medium">Amount</th>
                    <th className="py-3 px-4 font-medium">Method</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Scheduled / Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((p) => {
                    const vendorName =
                      p.weddingVendor?.vendor?.name ?? 'Vendor';
                    const weddingName = p.wedding?.name ?? '—';

                    return (
                      <tr key={p.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="py-3 px-4 font-medium text-ink">
                          {vendorName}
                          {p.weddingVendor?.vendor?.category && (
                            <span className="block text-xs text-ink-soft font-normal">
                              {p.weddingVendor.vendor.category}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-ink-soft">{weddingName}</td>
                        <td className="py-3 px-4 text-xs font-medium">
                          {p.kind ?? 'SETTLEMENT'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-ink">
                          {inr(p.amount)}
                        </td>
                        <td className="py-3 px-4 text-xs text-ink-soft">
                          {p.method ?? 'BANK_TRANSFER'}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="py-3 px-4 text-xs text-ink-soft">
                          {p.paidAt
                            ? fmtDate(p.paidAt)
                            : p.scheduledFor
                            ? `Scheduled: ${fmtDate(p.scheduledFor)}`
                            : fmtDate(p.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </RoleGate>
  );
}
