'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Loader2 } from 'lucide-react';
import { Avatar, Card, Field, Modal, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Select } from '@/components/shared/form-bits';
import { useApi, asRows } from '@/hooks/use-api';
import { useAuth, ROLE_LABEL } from '@/lib/auth';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { ROLES } from '@/lib/enums';
import { ago, humanize } from '@/lib/utils';
import type { Role, User } from '@/types';
import type { TeamLoad } from '@/types/analytics';

type Row = User & { load?: TeamLoad };
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

export default function TeamPage() {
  const { can } = useAuth();
  const users = useApi<unknown>('/users', { pageSize: 100 });
  const load = useApi<unknown>('/users/workload');
  const [modal, setModal] = useState<{ open: boolean; member?: User }>({ open: false });
  const loads = new Map(asRows<TeamLoad>(load.data).map((l) => [l.id, l]));
  const rows: Row[] = asRows<User>(users.data).map((u) => ({ ...u, load: loads.get(u.id) }));

  const cols: ColumnDef<Row, unknown>[] = [
    { id: 'name', header: 'Member', accessorFn: (u) => u.name, cell: ({ row: { original: u } }) => <div className="flex items-center gap-3"><Avatar name={u.name} size={36} /><div><p className="font-medium">{u.name}</p><p className="text-xs text-ink-soft">{u.email}</p></div></div> },
    { id: 'role', header: 'Role', accessorFn: (u) => u.role, cell: ({ row: { original: u } }) => ROLE_LABEL[u.role as Role] ?? humanize(u.role) },
    { id: 'avail', header: 'Availability', enableSorting: false, cell: ({ row: { original: u } }) => <StatusBadge status={u.status === 'DISABLED' ? 'CANCELLED' : u.available ? 'ACTIVE' : 'PENDING'} tone={u.status === 'DISABLED' ? 'danger' : u.available ? 'success' : 'warning'} /> },
    { id: 'w', header: 'Weddings', accessorFn: (u) => u.load?.assignedWeddings ?? 0 },
    { id: 'open', header: 'Open tasks', accessorFn: (u) => u.load?.openTasks ?? 0 },
    { id: 'done', header: 'Completed', accessorFn: (u) => u.load?.completedTasks ?? 0 },
    { id: 'over', header: 'Overdue', accessorFn: (u) => u.load?.overdueTasks ?? 0, cell: ({ row: { original: u } }) => <span className={u.load?.overdueTasks ? 'text-danger num' : ''}>{u.load?.overdueTasks ?? 0}</span> },
    { id: 'last', header: 'Last active', enableSorting: false, cell: ({ row: { original: u } }) => u.lastLoginAt ? ago(u.lastLoginAt) : 'Never' },
  ];
  return (
    <>
      <PageHeader title="Team Management" subtitle="Roles, availability and workload." actions={can('ADMIN') && <button className="btn-primary" onClick={() => setModal({ open: true })}><Plus className="h-4 w-4" />Add member</button>} />
      <Card pad={false}><DataTable columns={cols} data={rows} loading={users.loading} error={users.error} onRetry={users.reload} onRowClick={can('ADMIN') ? (u) => setModal({ open: true, member: u }) : undefined} /></Card>
      <MemberModal key={modal.member?.id ?? 'new'} member={modal.member} open={modal.open} onClose={() => setModal({ open: false })} onSaved={() => { users.reload(); load.reload(); }} />
    </>
  );
}
