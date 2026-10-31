'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import { Card, Field, Modal, PageHeader, Pagination, StatCard, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Select, SearchInput } from '@/components/shared/form-bits';
import { AttachmentLinks, STATUSES, type FeedbackRow } from '@/components/feedback/shared';
import { Can, RoleGate } from '@/components/shared/can';
import { useApi } from '@/hooks/use-api';
import { useList } from '@/hooks/use-list';
import { useUserEvents } from '@/hooks/use-user-live';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { ago, fmtDateTime, humanize } from '@/lib/utils';

const KINDS = [{ v: 'REQUEST', l: 'Client requests' }, { v: 'FEEDBACK', l: 'Client feedback' }, { v: 'SUPPORT', l: 'Vendor support' }];

function Detail({ row, onClose, onSaved }: { row: FeedbackRow | null; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (row && row.id !== lastId) { setLastId(row.id); setStatus(row.status); setReply(row.response ?? ''); }
  const save = async () => {
    if (!row) return;
    setBusy(true);
    try { await api.patch(`/feedback/${row.id}`, { status, response: reply }); notify.ok('Request updated'); onSaved(); onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!row} onClose={onClose} title={row?.subject ?? ''} width="max-w-xl" side
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><Can roles={['PLANNER']}><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save reply</button></Can></>}>
      {row && (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={row.status} /><StatusBadge status={row.kind} tone="gold" />{row.category && <span className="text-xs text-ink-soft">{row.category}</span>}</div>
          <div><p className="text-xs text-ink-soft mb-1">From {row.submittedBy?.name ?? 'Unknown'} ({humanize(row.submittedBy?.role)}){row.wedding ? ` · ${row.wedding.name}` : ''} · {fmtDateTime(row.createdAt)}</p><p className="whitespace-pre-wrap">{row.body}</p><AttachmentLinks base="/feedback" id={row.id} items={row.attachments} /></div>
          {row.rating ? <p className="text-xs text-ink-soft">Rating: <span className="font-medium text-ink">{row.rating} / 5</span></p> : null}
          <Can roles={['PLANNER']}>
            <Field label="Status"><Select value={status} onChange={setStatus} options={STATUSES} /></Field>
            <Field label="Reply to the submitter"><textarea className="input min-h-[120px] py-2" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={4000} placeholder="Write a reply. The submitter is notified instantly." /></Field>
          </Can>
          {row.response && <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-ink-soft mb-1">Current reply{row.assignedTo ? ` by ${row.assignedTo.name}` : ''}</p><p className="whitespace-pre-wrap">{row.response}</p></div>}
        </div>
      )}
    </Modal>
  );
}

export default function FeedbackPage() {
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState<FeedbackRow | null>(null);
  const list = useList<FeedbackRow>('/feedback', { status: status || undefined, kind: kind || undefined }, 12);
  const summary = useApi<{ OPEN: number; IN_PROGRESS: number; RESOLVED: number; CLOSED: number; total: number }>('/feedback/summary');
  const reloadAll = () => { list.reload(); summary.reload(); };
  useUserEvents(['notification'], reloadAll);

  const cols: ColumnDef<FeedbackRow, unknown>[] = [
    { id: 'subject', header: 'Request', enableSorting: false, cell: ({ row: { original: r } }) => <div className="max-w-sm"><p className="font-medium truncate">{r.subject}</p><p className="text-xs text-ink-soft line-clamp-1">{r.body}</p></div> },
    { id: 'kind', header: 'Type', enableSorting: false, cell: ({ row: { original: r } }) => <div><StatusBadge status={r.kind} tone="gold" />{r.category && <p className="text-xs text-ink-soft mt-1">{r.category}</p>}</div> },
    { id: 'from', header: 'From', enableSorting: false, cell: ({ row: { original: r } }) => <div><p>{r.submittedBy?.name ?? '—'}</p><p className="text-xs text-ink-soft">{r.wedding?.name ?? humanize(r.submittedBy?.role)}</p></div> },
    { id: 'status', header: 'Status', enableSorting: false, cell: ({ row: { original: r } }) => <StatusBadge status={r.status} /> },
    { id: 'assigned', header: 'Handled by', enableSorting: false, cell: ({ row: { original: r } }) => r.assignedTo?.name ?? <span className="text-ink-soft">Unassigned</span> },
    { id: 'created', header: 'Received', enableSorting: false, cell: ({ row: { original: r } }) => <span className="whitespace-nowrap">{ago(r.createdAt)}</span> },
  ];

  return (
    <RoleGate roles={['PLANNER', 'EVENT_MANAGER']}>
      <PageHeader title="Feedback & Requests" subtitle="Client requests, feedback and vendor support tickets." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Open" value={summary.data?.OPEN ?? '—'} /><StatCard label="In progress" value={summary.data?.IN_PROGRESS ?? '—'} />
        <StatCard label="Resolved" value={summary.data?.RESOLVED ?? '—'} /><StatCard label="All requests" value={summary.data?.total ?? '—'} />
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search subject or message…" />
          <Select className="w-44" value={status} onChange={(v) => { setStatus(v); list.setPage(1); }} options={STATUSES} placeholder="All statuses" />
          <Select className="w-44" value={kind} onChange={(v) => { setKind(v); list.setPage(1); }} options={KINDS} placeholder="All types" />
        </div>
        <DataTable columns={cols} data={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setOpen} emptyTitle="Nothing in the queue" emptyHint="Requests from clients and support tickets from vendors land here." />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      </Card>
      <Detail row={open} onClose={() => setOpen(null)} onSaved={reloadAll} />
    </RoleGate>
  );
}
