'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Avatar, Card, EmptyState, Field, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { useApi, asRows } from '@/hooks/use-api';
import { useAuth, ROLE_LABEL } from '@/lib/auth';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { humanize } from '@/lib/utils';
import { Segmented } from '@/components/shared/form-bits';
import { MasterList } from '@/components/admin/master-list';
import { TemplateEditor, type Tpl } from '@/components/admin/template-editor';
import { Load, Toggle, useBusy } from '@/components/admin/kit';

interface TaskTpl { id: string; name: string; isDefault: boolean; items: { id: string; name: string; category: string; offsetDays: number; priority: string }[] }
interface AgrTpl { id: string; name: string; packageType: string }

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


function ApprovalLimits() {
  const l = useApi<Record<string, number>>('/settings/approval-limits');
  const [f, setF] = useState<Record<string, number> | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (l.data) setF({ ...l.data }); }, [l.data]);
  const LABELS: [string, string][] = [['vendorPayment', 'Vendor payment'], ['extraExpense', 'Extra expense'], ['clientDiscount', 'Client discount'], ['vendorContract', 'Vendor contract']];
  return (
    <Card title="Approval limits (INR)" className="max-w-2xl">
      <p className="text-sm text-ink-soft mb-4">Amounts above these limits need Founder approval.</p>
      <Load state={l}>{f && <><div className="grid sm:grid-cols-2 gap-4">{LABELS.map(([k, label]) => <Field key={k} label={label}><input className="input" type="number" min={0} value={f[k] ?? 0} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} /></Field>)}</div>
        <button className="btn-primary mt-5" disabled={!!busy || JSON.stringify(f) === JSON.stringify(l.data)} onClick={() => run('s', async () => { await api.put('/settings/approval-limits', f); l.reload(); }, 'Approval limits saved')}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save limits</button></>}</Load>
    </Card>
  );
}

function Milestones() {
  const l = useApi<{ type: string; label: string; percent: number; dueRule?: string }[]>('/settings/payment-milestones');
  const [f, setF] = useState<{ type: string; label: string; percent: number; dueRule?: string }[] | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (l.data) setF(l.data.map((m) => ({ ...m }))); }, [l.data]);
  const total = (f ?? []).reduce((a, m) => a + (Number(m.percent) || 0), 0);
  return (
    <Card title="Payment milestone template" className="max-w-2xl">
      <p className="text-sm text-ink-soft mb-4">How a contract value is split across client payment milestones.</p>
      <Load state={l}>{f && <><div className="space-y-3">{f.map((m, i) => <div key={m.type} className="grid grid-cols-[1fr_110px] gap-3 items-end"><Field label={`${m.label}${m.dueRule ? `: ${m.dueRule}` : ''}`}><input className="input" value={m.label} onChange={(e) => setF(f.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></Field><Field label="Share (%)"><input className="input" type="number" min={0} max={100} value={m.percent} onChange={(e) => setF(f.map((x, j) => j === i ? { ...x, percent: Number(e.target.value) } : x))} /></Field></div>)}</div>
        <p className={`text-sm mt-3 ${Math.round(total * 100) === 10000 ? 'text-success' : 'text-danger'}`}>Total {total}% {Math.round(total * 100) === 10000 ? '' : '(must be 100%)'}</p>
        <button className="btn-primary mt-4" disabled={!!busy || Math.round(total * 100) !== 10000} onClick={() => run('s', async () => { await api.put('/settings/payment-milestones', { milestones: f }); l.reload(); }, 'Milestones saved')}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save milestones</button></>}</Load>
    </Card>
  );
}

function EmailTemplates() {
  const l = useApi<Tpl[]>('/admin/email/templates');
  const [edit, setEdit] = useState<{ open: boolean; tpl?: Tpl }>({ open: false });
  const { run } = useBusy();
  return (
    <Card title="Email templates" pad={false} className="max-w-3xl">
      <Load state={l}>{!l.data?.length ? <EmptyState title="No templates" /> : <ul className="divide-y divide-line">{l.data.map((t) => <li key={t.id} className="flex items-center gap-3 px-5 py-3"><button className="flex-1 text-left min-w-0" onClick={() => setEdit({ open: true, tpl: t })}><p className="font-medium">{t.name}</p><p className="text-xs text-ink-soft truncate">{t.subject}</p></button><Toggle checked={t.enabled} label={`${t.name} enabled`} onChange={(v) => run('t', async () => { await api.patch(`/admin/email/templates/${t.id}`, { enabled: v }); l.reload(); })} /></li>)}</ul>}</Load>
      <TemplateEditor key={edit.tpl?.id ?? 'x'} tpl={edit.tpl} open={edit.open} onClose={() => setEdit({ open: false })} onSaved={l.reload} />
    </Card>
  );
}

function Company() {
  const o = useApi<{ profile: Record<string, string> }>('/admin/org');
  const [f, setF] = useState<Record<string, string> | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (o.data) setF({ ...o.data.profile }); }, [o.data]);
  const KEYS: [string, string][] = [['name', 'Company name'], ['legalName', 'Legal name'], ['email', 'Email'], ['phone', 'Phone'], ['website', 'Website'], ['gstin', 'GSTIN'], ['address', 'Address'], ['city', 'City']];
  return (
    <Card title="Company settings" className="max-w-3xl">
      <Load state={o}>{f && <><div className="grid sm:grid-cols-2 gap-4">{KEYS.map(([k, l]) => <Field key={k} label={l}><input className="input" value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}</div>
        <button className="btn-primary mt-5" disabled={!!busy} onClick={() => run('s', async () => { await api.put('/admin/org', { profile: f }); o.reload(); }, 'Company settings saved')}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></>}</Load>
    </Card>
  );
}

type Tab = 'account' | 'packages' | 'limits' | 'tasks' | 'milestones' | 'email' | 'company';
export default function SettingsPage() {
  const { user } = useAuth();
  const tpls = useApi<unknown>(user?.role === 'SYSADMIN' ? null : '/task-templates');
  const agr = useApi<unknown>(user?.role === 'SYSADMIN' ? null : '/agreement-templates');
  const templates = asRows<TaskTpl>(tpls.data);
  const [tab, setTab] = useState<Tab>('account');
  const admin = user?.role === 'ADMIN';
  const showAccount = !admin || tab === 'account';
  const showTasks = user?.role !== 'SYSADMIN' && (!admin || tab === 'tasks' || tab === 'account');
  return (
    <>
      <PageHeader title="Settings" subtitle={admin ? 'Your account and how the business runs.' : 'Your account and the reusable templates behind your workflows.'} />
      {admin && <div className="mb-5 overflow-x-auto"><Segmented value={tab} onChange={setTab} options={[{ v: 'account', l: 'Account' }, { v: 'packages', l: 'Wedding packages' }, { v: 'limits', l: 'Approval limits' }, { v: 'tasks', l: 'Task templates' }, { v: 'milestones', l: 'Payment milestones' }, { v: 'email', l: 'Email templates' }, { v: 'company', l: 'Company' }]} /></div>}
      {admin && tab === 'packages' && <Card title="Wedding packages" className="max-w-2xl"><MasterList type="PACKAGE" noun="Package" /></Card>}
      {admin && tab === 'limits' && <ApprovalLimits />}
      {admin && tab === 'milestones' && <Milestones />}
      {admin && tab === 'email' && <EmailTemplates />}
      {admin && tab === 'company' && <Company />}
      <div className="grid xl:grid-cols-2 gap-5">
        {showAccount && <Card title="Profile"><div className="flex items-center gap-4"><Avatar name={user?.name} size={56} /><div><p className="font-medium text-lg">{user?.name}</p><p className="text-sm text-ink-soft">{user?.email}</p><p className="text-sm mt-1">{user && (ROLE_LABEL[user.role] ?? humanize(user.role))}</p></div></div></Card>}
        {showAccount && <Password />}
        {showTasks && (!admin || tab === 'tasks') && <Card title="Planning checklist templates" className="xl:col-span-2">
          {templates.length === 0 ? <EmptyState title="No templates" /> : templates.map((t) => (
            <details key={t.id} className="border border-line rounded-xl mb-3 group" >
              <summary className="cursor-pointer list-none flex items-center justify-between px-4 py-3"><span className="font-medium">{t.name}</span><span className="flex items-center gap-2 text-xs text-ink-soft">{t.isDefault && <StatusBadge status="ACTIVE" />}{t.items.length} tasks</span></summary>
              <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Task</th><th className="th">Category</th><th className="th">Due (days from wedding)</th><th className="th">Priority</th></tr></thead><tbody>{t.items.map((i) => <tr key={i.id}><td className="td">{i.name}</td><td className="td">{humanize(i.category)}</td><td className="td tabular-nums">{i.offsetDays > 0 ? `+${i.offsetDays}` : i.offsetDays}</td><td className="td"><StatusBadge status={i.priority} /></td></tr>)}</tbody></table></div>
            </details>
          ))}
        </Card>}
        {showTasks && (!admin || tab === 'tasks') && <Card title="Agreement templates" className="xl:col-span-2">
          {asRows<AgrTpl>(agr.data).length === 0 ? <EmptyState title="No agreement templates" /> : <ul className="divide-y divide-line text-sm">{asRows<AgrTpl>(agr.data).map((a) => <li key={a.id} className="flex justify-between py-2.5"><span>{a.name}</span><span className="text-ink-soft">{humanize(a.packageType)}</span></li>)}</ul>}
        </Card>}
      </div>
    </>
  );
}
