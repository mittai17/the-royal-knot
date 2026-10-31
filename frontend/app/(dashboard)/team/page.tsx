'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Loader2, ArrowRightLeft } from 'lucide-react';
import { Avatar, Card, Field, Modal, PageHeader, ProgressBar, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Select } from '@/components/shared/form-bits';
import { useApi, asRows } from '@/hooks/use-api';
import { useAuth, ROLE_LABEL } from '@/lib/auth';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { ROLES } from '@/lib/enums';
import { ago, humanize } from '@/lib/utils';
import type { Role, User } from '@/types';

interface Row extends User {
  activeWeddings: { id: string; name: string; status: string; startDate: string }[]; activeWeddingCount: number; openTasks: number; completedTasks: number; overdueTasks: number; taskCompletionPct: number | null; workload: number;
}
interface UserDetail extends User { activity: { id: string; message?: string | null; entity: string; action: string; createdAt: string }[]; weddings: { id: string; name: string }[]; tasks: { id: string; name: string }[] }

function MemberModal({ member, open, onClose, onSaved }: { member?: User; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'PLANNER', password: '' });
  const [busy, setBusy] = useState(false);
  const detail = useApi<UserDetail>(member && open ? `/users/${member.id}` : null);
  const save = async () => {
    setBusy(true);
    try { member ? await api.patch(`/users/${member.id}`, { role: f.role === 'PLANNER' && member.role !== 'PLANNER' ? member.role : f.role }) : await api.post('/users', { ...f, phone: f.phone || undefined }); notify.ok(member ? 'Member updated' : 'Member added'); onSaved(); onClose(); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  const toggle = async (patch: Record<string, unknown>) => { if (!member) return; try { await api.patch(`/users/${member.id}`, patch); notify.ok('Updated'); onSaved(); onClose(); } catch (e) { notify.err(e); } };
  return (
    <Modal open={open} onClose={onClose} side title={member ? member.name : 'Add team member'} footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || (!member && (!f.name || !f.email || f.password.length < 8))} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{member ? 'Save role' : 'Create account'}</button></>}>
      {member ? (
        <div className="space-y-5">
          <Field label="Role"><Select value={f.role === 'PLANNER' ? member.role : f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLES} /></Field>
          <div className="flex gap-2"><button className="btn-secondary btn-sm" onClick={() => toggle({ available: !member.available })}>{member.available ? 'Mark unavailable' : 'Mark available'}</button><button className="btn-secondary btn-sm" onClick={() => toggle({ status: member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}>{member.status === 'ACTIVE' ? 'Disable account' : 'Enable account'}</button></div>
          <div><h3 className="font-serif text-lg mb-2">Recent activity</h3><ul className="space-y-2 text-sm">{(detail.data?.activity ?? []).slice(0, 8).map((a) => <li key={a.id} className="flex justify-between gap-3"><span>{a.message ?? `${a.entity} ${a.action}`}</span><span className="text-xs text-ink-soft whitespace-nowrap">{ago(a.createdAt)}</span></li>)}{!detail.data?.activity?.length && <li className="text-ink-soft">No activity yet.</li>}</ul></div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name" className="col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Role"><Select value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLES} /></Field>
          <Field label="Temporary password (8+ chars, upper, lower, digit)"><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <p className="col-span-2 text-xs text-ink-soft">They’ll be asked to change this password at first sign-in.</p>
        </div>
      )}
    </Modal>
  );
}

function ReassignModal({ rows, open, onClose, onDone }: { rows: Row[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [scope, setScope] = useState('selected');
  const [busy, setBusy] = useState(false);
  const src = rows.find((r) => r.id === from);
  const targets = rows.filter((r) => r.id !== from && r.status === 'ACTIVE');
  const go = async () => {
    setBusy(true);
    try { const r = await api.post<{ weddings: number; tasks: number; to: string }>('/team/reassign', { fromUserId: from, toUserId: to, weddingIds: picked, taskScope: picked.length ? scope : 'all' }); notify.ok(`Moved ${r.data.weddings} wedding(s) and ${r.data.tasks} task(s) to ${r.data.to}`); onDone(); onClose(); setPicked([]); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Reassign work" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !from || !to || (!picked.length && scope !== 'all')} onClick={go}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Reassign</button></>}>
      <div className="space-y-4">
        <Field label="From"><Select value={from} onChange={(v) => { setFrom(v); setPicked([]); setTo(''); }} placeholder="Choose a team member" options={rows.filter((r) => r.activeWeddingCount || r.openTasks).map((r) => ({ v: r.id, l: `${r.name} (${r.activeWeddingCount} weddings, ${r.openTasks} open tasks)` }))} /></Field>
        {src && <Field label="Weddings to move">{src.activeWeddings.length === 0 ? <p className="text-sm text-ink-soft">No active weddings.</p> : <ul className="space-y-1">{src.activeWeddings.map((w) => <li key={w.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#401827]" checked={picked.includes(w.id)} onChange={() => setPicked(picked.includes(w.id) ? picked.filter((x) => x !== w.id) : [...picked, w.id])} />{w.name}</label></li>)}</ul>}</Field>}
        <Field label="Open tasks"><Select value={scope} onChange={setScope} options={[{ v: 'selected', l: 'Move tasks of the selected weddings' }, { v: 'none', l: 'Leave tasks where they are' }, { v: 'all', l: 'Move ALL of their open tasks' }]} /></Field>
        <Field label="To"><Select value={to} onChange={setTo} placeholder="Choose a team member" options={targets.map((r) => ({ v: r.id, l: `${r.name} · ${r.activeWeddingCount} weddings, ${r.openTasks} open tasks` }))} /></Field>
      </div>
    </Modal>
  );
}

export default function TeamPage() {
  const { can } = useAuth();
  const team = useApi<Row[]>('/team/overview');
  const [modal, setModal] = useState<{ open: boolean; member?: User }>({ open: false });
  const [reassign, setReassign] = useState(false);
  const rows = team.data ?? [];

  const cols: ColumnDef<Row, unknown>[] = [
    { id: 'name', header: 'Member', accessorFn: (u) => u.name, cell: ({ row: { original: u } }) => <div className="flex items-center gap-3"><Avatar name={u.name} size={36} /><div><p className="font-medium">{u.name}</p><p className="text-xs text-ink-soft">{u.email}</p></div></div> },
    { id: 'role', header: 'Role', accessorFn: (u) => u.role, cell: ({ row: { original: u } }) => ROLE_LABEL[u.role as Role] ?? humanize(u.role) },
    { id: 'avail', header: 'Availability', enableSorting: false, cell: ({ row: { original: u } }) => <StatusBadge status={u.status === 'DISABLED' ? 'CANCELLED' : u.available ? 'ACTIVE' : 'PENDING'} tone={u.status === 'DISABLED' ? 'danger' : u.available ? 'success' : 'warning'} /> },
    { id: 'w', header: 'Active weddings', accessorFn: (u) => u.activeWeddingCount, cell: ({ row: { original: u } }) => <span title={u.activeWeddings.map((w) => w.name).join(', ')}>{u.activeWeddingCount}{u.activeWeddings[0] && <span className="block text-xs text-ink-soft max-w-[180px] truncate">{u.activeWeddings.map((w) => w.name).join(', ')}</span>}</span> },
    { id: 'open', header: 'Open tasks', accessorFn: (u) => u.openTasks },
    { id: 'pct', header: 'Task completion', accessorFn: (u) => u.taskCompletionPct ?? -1, cell: ({ row: { original: u } }) => u.taskCompletionPct == null ? <span className="text-ink-soft">No tasks</span> : <div className="w-28"><p className="text-xs mb-1">{u.taskCompletionPct}% <span className="text-ink-soft">({u.completedTasks} done)</span></p><ProgressBar value={u.taskCompletionPct} /></div> },
    { id: 'over', header: 'Overdue', accessorFn: (u) => u.overdueTasks, cell: ({ row: { original: u } }) => <span className={u.overdueTasks ? 'text-danger num' : ''}>{u.overdueTasks}</span> },
    { id: 'load', header: 'Workload', accessorFn: (u) => u.workload, cell: ({ row: { original: u } }) => <span className={u.workload >= 55 ? 'text-danger num' : u.workload >= 35 ? 'text-[#A8701A] num' : 'num'}>{u.workload >= 55 ? 'High' : u.workload >= 35 ? 'Medium' : u.workload > 0 ? 'Light' : 'Free'}</span> },
    { id: 'last', header: 'Last active', enableSorting: false, cell: ({ row: { original: u } }) => u.lastLoginAt ? ago(u.lastLoginAt) : 'Never' },
  ];
  return (
    <>
      <PageHeader title="Team Management" subtitle="Members, active weddings, workload and task completion." actions={can('ADMIN') && <><button className="btn-secondary" onClick={() => setReassign(true)}><ArrowRightLeft className="h-4 w-4" />Reassign work</button><button className="btn-primary" onClick={() => setModal({ open: true })}><Plus className="h-4 w-4" />Add member</button></>} />
      <Card pad={false}><DataTable columns={cols} data={rows} loading={team.loading} error={team.error} onRetry={team.reload} onRowClick={can('ADMIN') ? (u) => setModal({ open: true, member: u }) : undefined} /></Card>
      <MemberModal key={modal.member?.id ?? 'new'} member={modal.member} open={modal.open} onClose={() => setModal({ open: false })} onSaved={team.reload} />
      <ReassignModal rows={rows} open={reassign} onClose={() => setReassign(false)} onDone={team.reload} />
    </>
  );
}
