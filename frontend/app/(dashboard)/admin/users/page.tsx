'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, Plus } from 'lucide-react';
import { Avatar, Card, Field, Modal, PageHeader, Pagination, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { SearchInput, Select } from '@/components/shared/form-bits';
import { Confirm, RevealOnce, useBusy } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useAuth, ROLE_LABEL } from '@/lib/auth';
import { ROLES } from '@/lib/enums';
import { notify } from '@/lib/toast';
import { ago, fmtDateTime, humanize } from '@/lib/utils';
import type { Role, User } from '@/types';

interface Login { id: string; at: string; action: string; ok: boolean; ip: string | null; via: string }
const PAGE = 15;

function UserModal({ user, open, onClose, onSaved, onTemp }: { user?: User; open: boolean; onClose: () => void; onSaved: () => void; onTemp: (p: string) => void }) {
  const { user: me } = useAuth();
  const [f, setF] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', role: (user?.role ?? 'OPERATIONS') as string });
  const [confirm, setConfirm] = useState<null | 'deactivate' | 'reset'>(null);
  const { busy, run } = useBusy();
  const logins = useApi<Login[]>(user && open ? `/admin/users/${user.id}/logins` : null);
  const internalRoles = ROLES.filter((r) => r.v !== 'CLIENT' && r.v !== 'VENDOR' && (me?.role === 'FOUNDER' || r.v !== 'FOUNDER'));
  const external = user && (user.role === 'CLIENT' || user.role === 'VENDOR');
  const self = user?.id === me?.id;
  const save = () => run('save', async () => {
    if (user) await api.patch(`/admin/users/${user.id}`, { name: f.name, email: f.email, phone: f.phone || undefined, ...(f.role !== user.role ? { role: f.role } : {}) });
    else { const r = await api.post<{ temporaryPassword?: string }>('/admin/users', { name: f.name, email: f.email, phone: f.phone || undefined, role: f.role }); if (r.data.temporaryPassword) onTemp(r.data.temporaryPassword); }
    onSaved(); onClose();
  }, user ? 'User updated' : 'User created');
  const act = async (path: string, ok: string) => { const r = await run(path, () => api.post<{ temporaryPassword?: string }>(`/admin/users/${user!.id}/${path}`), ok); if (r && (r as { data: { temporaryPassword?: string } }).data.temporaryPassword) onTemp((r as { data: { temporaryPassword: string } }).data.temporaryPassword); onSaved(); setConfirm(null); if (path !== 'force-password-change') onClose(); };
  return (
    <>
      <Modal open={open} onClose={onClose} side title={user ? user.name : 'Add user'} width="max-w-xl" footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={!!busy || f.name.length < 2 || !f.email} onClick={save}>{busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}{user ? 'Save changes' : 'Create user'}</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name" className="col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Role" className="col-span-2">
            {external ? <p className="text-sm">{ROLE_LABEL[user!.role as Role]} (linked portal account)</p> : <Select value={f.role} onChange={(v) => setF({ ...f, role: v })} options={internalRoles.map((r) => ({ v: r.v, l: r.l }))} />}
            {self && <p className="text-xs text-ink-soft mt-1">You cannot change your own role.</p>}
          </Field>
          {!user && <p className="col-span-2 text-xs text-ink-soft">A one-time temporary password is generated; the user must change it at first sign-in.</p>}
        </div>
        {user && <>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setConfirm('reset')}>Reset password</button>
            <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => act('force-password-change', 'User must change password at next sign-in')}>Require password change</button>
            {user.status === 'ACTIVE' ? <button className="btn-secondary btn-sm !text-danger" disabled={self} onClick={() => setConfirm('deactivate')}>Deactivate</button> : <button className="btn-secondary btn-sm" onClick={() => act('activate', 'User re-activated')}>Re-activate</button>}
          </div>
          <h3 className="font-serif text-lg mt-6 mb-2">Login history</h3>
          {logins.loading ? <p className="text-sm text-ink-soft">Loading…</p> : logins.error ? <p className="text-sm text-danger">{logins.error}</p> : !logins.data?.length ? <p className="text-sm text-ink-soft">No sign-ins recorded.</p> :
            <ul className="divide-y divide-line text-sm">{logins.data.slice(0, 15).map((l) => <li key={l.id} className="flex justify-between gap-3 py-2"><span>{l.action === 'login' ? 'Signed in' : l.action === 'login.failed' ? <span className="text-danger">Failed sign-in</span> : humanize(l.action)}{l.ip && <span className="text-ink-soft"> · {l.ip}</span>}</span><span className="text-xs text-ink-soft whitespace-nowrap">{fmtDateTime(l.at)}</span></li>)}</ul>}
        </>}
      </Modal>
      <Confirm open={confirm === 'deactivate'} title="Deactivate user" danger confirmLabel="Deactivate" busy={!!busy} message={<>{user?.name} will be signed out everywhere and will not be able to sign in until re-activated.</>} onConfirm={() => act('deactivate', 'User deactivated')} onClose={() => setConfirm(null)} />
      <Confirm open={confirm === 'reset'} title="Reset password" confirmLabel="Reset" busy={!!busy} message={<>Generate a new temporary password for {user?.name}? Their sessions are ended and they must choose a new password at next sign-in.</>} onConfirm={() => act('reset-password', 'Password reset')} onClose={() => setConfirm(null)} />
    </>
  );
}

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState<{ open: boolean; user?: User }>({ open: false });
  const [temp, setTemp] = useState<string | null>(null);
  const list = useApi<User[]>('/admin/users', { page, pageSize: PAGE, search: search || undefined, role: role || undefined, status: status || undefined });
  const cols: ColumnDef<User, unknown>[] = [
    { id: 'name', header: 'User', accessorFn: (u) => u.name, cell: ({ row: { original: u } }) => <div className="flex items-center gap-3"><Avatar name={u.name} size={34} /><div><p className="font-medium">{u.name}</p><p className="text-xs text-ink-soft">{u.email}</p></div></div> },
    { id: 'role', header: 'Role', accessorFn: (u) => u.role, cell: ({ row: { original: u } }) => ROLE_LABEL[u.role as Role] ?? humanize(u.role) },
    { id: 'status', header: 'Status', enableSorting: false, cell: ({ row: { original: u } }) => <span className="flex gap-1.5"><StatusBadge status={u.status === 'DISABLED' ? 'Inactive' : 'Active'} tone={u.status === 'DISABLED' ? 'danger' : 'success'} />{u.mustChangePassword && <StatusBadge status="Password change due" tone="warning" />}</span> },
    { id: 'last', header: 'Last sign-in', enableSorting: false, cell: ({ row: { original: u } }) => u.lastLoginAt ? ago(u.lastLoginAt) : 'Never' },
  ];
  return (
    <>
      <PageHeader title="User Management" subtitle="Create, edit and deactivate accounts, assign roles and review sign-in history." actions={<button className="btn-primary" onClick={() => setModal({ open: true })}><Plus className="h-4 w-4" />Add user</button>} />
      <div className="flex flex-wrap gap-3 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name or email…" />
        <Select className="w-52" value={role} onChange={(v) => { setRole(v); setPage(1); }} placeholder="All roles" options={ROLES.map((r) => ({ v: r.v, l: r.l }))} />
        <Select className="w-40" value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="Any status" options={[{ v: 'ACTIVE', l: 'Active' }, { v: 'DISABLED', l: 'Inactive' }]} />
      </div>
      <Card pad={false}>
        <DataTable columns={cols} data={list.data ?? []} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(u) => setModal({ open: true, user: u })} emptyTitle="No users match" />
        <Pagination page={page} pageSize={PAGE} total={list.meta?.total ?? 0} onPage={setPage} />
      </Card>
      <UserModal key={modal.user?.id ?? 'new'} user={modal.user} open={modal.open} onClose={() => setModal({ open: false })} onSaved={list.reload} onTemp={setTemp} />
      <RevealOnce title="Temporary password" value={temp} onClose={() => setTemp(null)} />
    </>
  );
}
