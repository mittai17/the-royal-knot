'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Avatar, Card, EmptyState, Field, StatusBadge } from '@/components/ui/primitives';
import { useApi, asRows } from '@/hooks/use-api';
import { useAuth, ROLE_LABEL } from '@/lib/auth';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { humanize } from '@/lib/utils';

interface TaskTpl { id: string; name: string; isDefault: boolean; items: { id: string; name: string; category: string; offsetDays: number; priority: string }[] }
export interface AgrTpl { id: string; name: string; packageType: string }

function Password() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const mismatch = f.confirm !== '' && f.confirm !== f.newPassword;
  const save = async () => {
    setBusy(true);
    try { await api.post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword }); notify.ok('Password changed'); setF({ currentPassword: '', newPassword: '', confirm: '' }); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Card title="Change password">
      <div className="space-y-4 max-w-sm">
        <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
        <Field label="New password (8+ chars, upper, lower, digit)"><input className="input" type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
        <Field label="Confirm new password" error={mismatch ? 'Passwords don’t match' : undefined}><input className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
        <button className="btn-primary" disabled={busy || mismatch || f.newPassword.length < 8 || !f.currentPassword} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Update password</button>
      </div>
    </Card>
  );
}



export function ProfileCard() {
  const { user } = useAuth();
  return <Card title="Profile"><div className="flex items-center gap-4"><Avatar name={user?.name} size={56} /><div><p className="font-medium text-lg">{user?.name}</p><p className="text-sm text-ink-soft">{user?.email}</p><p className="text-sm mt-1">{user && (ROLE_LABEL[user.role] ?? humanize(user.role))}</p></div></div></Card>;
}

export function AccountSection() {
  return <div className="grid xl:grid-cols-2 gap-5"><ProfileCard /><Password /></div>;
}

/** Read-only view of the planning checklist templates (staff roles that plan). */
export function TaskTemplates({ canEditHint }: { canEditHint?: boolean }) {
  const tpls = useApi<unknown>('/task-templates');
  const templates = asRows<TaskTpl>(tpls.data);
  return (
    <Card title="Planning checklist templates" className="xl:col-span-2">
      {canEditHint && <p className="text-sm text-ink-soft mb-3">Templates drive the auto-planned task set once a wedding is confirmed and the booking deposit is verified.</p>}
      {templates.length === 0 ? <EmptyState title="No templates" /> : templates.map((t) => (
        <details key={t.id} className="border border-line rounded-xl mb-3 group">
          <summary className="cursor-pointer list-none flex items-center justify-between px-4 py-3"><span className="font-medium">{t.name}</span><span className="flex items-center gap-2 text-xs text-ink-soft">{t.isDefault && <StatusBadge status="ACTIVE" />}{t.items.length} tasks</span></summary>
          <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Task</th><th className="th">Category</th><th className="th">Due (days from wedding)</th><th className="th">Priority</th></tr></thead><tbody>{t.items.map((i) => <tr key={i.id}><td className="td">{i.name}</td><td className="td">{humanize(i.category)}</td><td className="td tabular-nums">{i.offsetDays > 0 ? `+${i.offsetDays}` : i.offsetDays}</td><td className="td"><StatusBadge status={i.priority} /></td></tr>)}</tbody></table></div>
        </details>
      ))}
    </Card>
  );
}

export function AgreementTemplates() {
  const agr = useApi<unknown>('/agreement-templates');
  const rows = asRows<AgrTpl>(agr.data);
  return (
    <Card title="Agreement templates" className="xl:col-span-2">
      {rows.length === 0 ? <EmptyState title="No agreement templates" /> : <ul className="divide-y divide-line text-sm">{rows.map((a) => <li key={a.id} className="flex justify-between py-2.5"><span>{a.name}</span><span className="text-ink-soft">{humanize(a.packageType)}</span></li>)}</ul>}
    </Card>
  );
}
