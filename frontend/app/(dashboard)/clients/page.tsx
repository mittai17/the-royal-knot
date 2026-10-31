'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, Plus } from 'lucide-react';
import { Card, Field, Modal, PageHeader, Pagination, ProgressBar, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { SearchInput } from '@/components/shared/form-bits';
import { Can, RoleGate } from '@/components/shared/can';
import { useList } from '@/hooks/use-list';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { ago, fmtDate, inrCompact } from '@/lib/utils';

export interface ClientRow {
  id: string; name: string; phone?: string | null; email?: string | null; weddingsCount: number; enquiriesCount: number; portalUsers: number;
  wedding: { id: string; name: string; startDate: string; status: string } | null; lastContactAt: string | null;
  payments: { contractValue: number; expected: number; received: number; outstanding: number };
}

function AddClient({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ brideName: '', groomName: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>('/clients', { brideName: f.brideName.trim(), groomName: f.groomName.trim(), phone: f.phone || undefined, email: f.email || undefined });
      notify.ok('Client added'); setF({ brideName: '', groomName: '', phone: '', email: '' }); onSaved(r.data.id);
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add client" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.brideName.trim() || !f.groomName.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add client</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Bride’s name"><input className="input" value={f.brideName} onChange={(e) => setF({ ...f, brideName: e.target.value })} /></Field>
        <Field label="Groom’s name"><input className="input" value={f.groomName} onChange={(e) => setF({ ...f, groomName: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      </div>
      <p className="text-xs text-ink-soft mt-3">Most clients arrive through an enquiry. Use this for direct referrals.</p>
    </Modal>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const list = useList<ClientRow>('/clients', {}, 12);

  const cols: ColumnDef<ClientRow, unknown>[] = [
    { id: 'name', header: 'Couple', enableSorting: false, cell: ({ row: { original: c } }) => <div><p className="font-medium">{c.name}</p><p className="text-xs text-ink-soft">{c.phone ?? c.email ?? 'No contact on file'}</p></div> },
    { id: 'weddings', header: 'Weddings', enableSorting: false, cell: ({ row: { original: c } }) => c.wedding ? <div><p>{c.wedding.name}{c.weddingsCount > 1 ? <span className="text-xs text-ink-soft"> +{c.weddingsCount - 1} more</span> : null}</p><p className="text-xs text-ink-soft">{fmtDate(c.wedding.startDate)}</p></div> : <span className="text-ink-soft">{c.enquiriesCount ? 'Enquiry stage' : 'None yet'}</span> },
    { id: 'status', header: 'Status', enableSorting: false, cell: ({ row: { original: c } }) => c.wedding ? <StatusBadge status={c.wedding.status} /> : <StatusBadge status="NEW" /> },
    { id: 'pay', header: 'Payments', enableSorting: false, cell: ({ row: { original: c } }) => { const total = Math.max(c.payments.contractValue, c.payments.expected); return total ? <div className="min-w-[150px]"><p className="num text-sm">{inrCompact(c.payments.received)}<span className="text-xs font-normal text-ink-soft"> of {inrCompact(total)}</span></p><ProgressBar value={(c.payments.received / total) * 100} tone={c.payments.outstanding > 0 ? 'warning' : 'success'} /></div> : <span className="text-ink-soft">—</span>; } },
    { id: 'last', header: 'Last message', enableSorting: false, cell: ({ row: { original: c } }) => c.lastContactAt ? ago(c.lastContactAt) : <span className="text-ink-soft">—</span> },
    { id: 'portal', header: 'Portal', enableSorting: false, cell: ({ row: { original: c } }) => <StatusBadge status={c.portalUsers ? 'ACTIVE' : 'PENDING'} tone={c.portalUsers ? 'success' : 'neutral'} /> },
  ];

  return (
    <RoleGate roles={['PLANNER', 'FINANCE']}>
      <PageHeader title="Clients" subtitle="Every couple, their weddings, payments and conversations." actions={<Can roles={['PLANNER']}><button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add client</button></Can>} />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line"><SearchInput value={list.search} onChange={list.setSearch} placeholder="Search couple, phone, wedding…" /></div>
        <DataTable columns={cols} data={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(c) => router.push(`/clients/${c.id}`)} emptyTitle="No clients found" emptyHint="Clients are created when an enquiry is captured." />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      </Card>
      <AddClient open={adding} onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); router.push(`/clients/${id}`); }} />
    </RoleGate>
  );
}
