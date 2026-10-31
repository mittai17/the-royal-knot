'use client';
import { useCallback, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Siren, Wrench } from 'lucide-react';
import { Card, Field, Modal, Pagination, StatCard, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Segmented, Select, SearchInput } from '@/components/shared/form-bits';
import { Can } from '@/components/shared/can';
import { useApi } from '@/hooks/use-api';
import { useList } from '@/hooks/use-list';
import { useUsers } from '@/hooks/use-users';
import { api } from '@/lib/api';
import { SEVERITIES } from '@/lib/enums';
import { useAuth } from '@/lib/auth';
import { G } from '@/lib/permissions';
import { notify } from '@/lib/toast';
import { useWedding } from '@/lib/wedding-context';
import { ago, fmtDateTime } from '@/lib/utils';
import { LiveWatch } from './live-watch';
import type { IncidentRow, IncidentStats } from './types';

type Tab = '' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
interface Hist { id: string; action: string; message?: string | null; createdAt: string; actor?: { name: string } | null }

function IncidentDetail({ inc, ops, onClose, onChanged }: { inc: IncidentRow; ops: boolean; onClose: () => void; onChanged: () => void }) {
  const { users } = useUsers();
  const hist = useApi<Hist[]>(`/incidents/${inc.id}/history`);
  const [resolution, setResolution] = useState(inc.resolution ?? '');
  const [busy, setBusy] = useState(false);
  const patch = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await api.patch(`/incidents/${inc.id}`, body); notify.ok(ok); onChanged(); void hist.reload(); if (body.status === 'RESOLVED') onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  const resolved = inc.status === 'RESOLVED';
  return (
    <Modal open onClose={onClose} side width="max-w-md" title={inc.title}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2"><StatusBadge status={inc.severity} /><StatusBadge status={inc.status} /><span className="text-xs text-ink-soft self-center">{inc.wedding.name} · {fmtDateTime(inc.createdAt)}</span></div>
        <p className="text-sm">{inc.description}</p>
        {ops && !resolved && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority"><Select value={inc.severity} onChange={(v) => patch({ severity: v }, 'Priority updated')} options={SEVERITIES} /></Field>
            <Field label="Assigned to"><Select value={inc.assignedToId ?? ''} onChange={(v) => v && patch({ assignedToId: v }, 'Assignee updated')} options={users.map((u) => ({ v: u.id, l: u.name }))} placeholder="Unassigned" /></Field>
          </div>
        )}
        {!ops || resolved ? <p className="text-sm text-ink-soft">Assigned to {inc.assignedTo?.name ?? 'nobody'}.</p> : null}
        {resolved ? (
          <div className="rounded-lg bg-success-soft px-3 py-2.5 text-sm"><p className="font-medium text-success">Resolved {inc.resolvedAt ? ago(inc.resolvedAt) : ''}</p><p className="mt-1">{inc.resolution}</p></div>
        ) : ops ? (
          <div className="space-y-2">
            <Field label="Resolution note"><textarea className="input min-h-[84px]" placeholder="What was done to fix it?" value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
            <div className="flex gap-2 justify-end">
              {inc.status === 'OPEN' && <button disabled={busy} className="btn-secondary" onClick={() => patch({ status: 'IN_PROGRESS' }, 'Marked in progress')}><Wrench className="h-4 w-4" />Start work</button>}
              <button disabled={busy || !resolution.trim()} className="btn-primary" onClick={() => patch({ status: 'RESOLVED', resolution }, 'Incident resolved')}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Mark resolved</button>
            </div>
          </div>
        ) : null}
        {ops && resolved && <button disabled={busy} className="btn-secondary btn-sm" onClick={() => patch({ status: 'OPEN' }, 'Incident reopened')}>Reopen</button>}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft mb-2">History</p>
          {hist.loading ? <p className="text-sm text-ink-soft">Loading…</p> : !(hist.data ?? []).length ? <p className="text-sm text-ink-soft">No history yet.</p> : (
            <ol className="space-y-2.5 border-l-2 border-line ml-1">{hist.data!.map((h) => <li key={h.id} className="pl-3 text-sm"><p>{h.message ?? h.action}</p><p className="text-xs text-ink-soft">{h.actor?.name ?? 'System'} · {fmtDateTime(h.createdAt)}</p></li>)}</ol>
          )}
        </div>
      </div>
    </Modal>
  );
}

function LogIncident({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { weddings, selectedId } = useWedding();
  const { users } = useUsers();
  const [f, setF] = useState({ weddingId: selectedId ?? '', title: '', description: '', severity: 'MEDIUM', assignedToId: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post(`/weddings/${f.weddingId}/incidents`, { title: f.title, description: f.description, severity: f.severity, assignedToId: f.assignedToId || undefined }); notify.ok('Incident logged'); onSaved(); onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Log incident" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.weddingId || !f.title.trim() || !f.description.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Log incident</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Wedding" className="col-span-2"><Select value={f.weddingId} onChange={(v) => setF({ ...f, weddingId: v })} options={weddings.map((w) => ({ v: w.id, l: w.name }))} placeholder="Select wedding" /></Field>
        <Field label="Title" className="col-span-2"><input className="input" placeholder="DJ arrives late" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description" className="col-span-2"><textarea className="input min-h-[80px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Priority"><Select value={f.severity} onChange={(v) => setF({ ...f, severity: v })} options={SEVERITIES} /></Field>
        <Field label="Assign to"><Select value={f.assignedToId} onChange={(v) => setF({ ...f, assignedToId: v })} options={users.map((u) => ({ v: u.id, l: u.name }))} placeholder="Unassigned" /></Field>
      </div>
    </Modal>
  );
}

export function IncidentsBoard() {
  const { can } = useAuth();
  const ops = can(...G.EVENT_OPS);
  const { weddings } = useWedding();
  const [tab, setTab] = useState<Tab>('');
  const [severity, setSeverity] = useState('');
  const [wedding, setWedding] = useState('');
  const [mine, setMine] = useState(false);
  const list = useList<IncidentRow>('/events/incidents', { status: tab || undefined, severity: severity || undefined, weddingId: wedding || undefined, mine: mine || undefined }, 15);
  const stats = useApi<IncidentStats>('/events/incidents/stats', { weddingId: wedding || undefined });
  const [open, setOpen] = useState<IncidentRow | null>(null);
  const [logging, setLogging] = useState(false);
  const refresh = useCallback(() => { list.reload(); void stats.reload(); }, [list, stats]);

  const cols: ColumnDef<IncidentRow, unknown>[] = [
    { id: 'title', header: 'Incident', cell: ({ row: { original: i } }) => <div className="min-w-0 max-w-[26rem]"><p className="font-medium truncate">{i.title}</p><p className="text-xs text-ink-soft truncate">{i.wedding.name} · {i.description}</p></div> },
    { id: 'severity', header: 'Priority', accessorKey: 'severity', cell: ({ row: { original: i } }) => <StatusBadge status={i.severity} /> },
    { id: 'status', header: 'Status', accessorKey: 'status', cell: ({ row: { original: i } }) => <StatusBadge status={i.status} /> },
    { id: 'assignee', header: 'Assigned to', cell: ({ row: { original: i } }) => i.assignedTo?.name ?? <span className="text-ink-soft">Unassigned</span> },
    { id: 'createdAt', header: 'Logged', accessorKey: 'createdAt', cell: ({ row: { original: i } }) => <span className="text-xs text-ink-soft whitespace-nowrap">{ago(i.createdAt)}</span> },
    { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: i } }) => <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setOpen(i); }}>{ops && i.status !== 'RESOLVED' ? 'Manage' : 'View'}</button> },
  ];
  const st = stats.data;
  return (
    <div className="space-y-5">
      {weddings.filter((w) => w.status === 'EVENT_DAY').map((w) => <LiveWatch key={w.id} weddingId={w.id} events={['incident.created', 'incident.updated']} onChange={refresh} />)}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Open" value={st?.open ?? '—'} icon={<Siren className="h-5 w-5" />} />
        <StatCard label="In progress" value={st?.inProgress ?? '—'} icon={<Wrench className="h-5 w-5" />} />
        <StatCard label="Resolved" value={st?.resolved ?? '—'} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="High priority open" value={st?.highPriorityOpen ?? '—'} icon={<AlertTriangle className="h-5 w-5" />} />
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <Segmented<Tab> value={tab} onChange={(v) => { setTab(v); list.setPage(1); }} options={[{ v: '', l: 'All' }, { v: 'OPEN', l: 'Open' }, { v: 'IN_PROGRESS', l: 'In progress' }, { v: 'RESOLVED', l: 'Resolved' }]} />
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search incidents…" />
            <Select className="!w-36" value={severity} onChange={(v) => { setSeverity(v); list.setPage(1); }} options={SEVERITIES} placeholder="Any priority" />
            <Select className="!w-44" value={wedding} onChange={(v) => { setWedding(v); list.setPage(1); }} options={weddings.map((w) => ({ v: w.id, l: w.name }))} placeholder="All weddings" />
            <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); list.setPage(1); }} />Assigned to me</label>
            <Can roles={G.EVENT_OPS}><button className="btn-primary" onClick={() => setLogging(true)}><Plus className="h-4 w-4" />Log incident</button></Can>
          </div>
        </div>
        <DataTable columns={cols} data={list.rows} loading={list.loading && !list.rows.length} error={list.error} onRetry={list.reload} onRowClick={setOpen} onSort={list.setSort} emptyTitle="No incidents" emptyHint={tab || severity || list.search ? 'No incidents match these filters.' : 'All clear. Log anything that needs attention during an event.'} />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      </Card>
      {open && <IncidentDetail key={open.id + open.status} inc={open} ops={ops} onClose={() => setOpen(null)} onChanged={refresh} />}
      {logging && <LogIncident onClose={() => setLogging(false)} onSaved={refresh} />}
    </div>
  );
}
