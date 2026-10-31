'use client';
import { useMemo, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/primitives';
import { Confirm, Load, useBusy } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { humanize } from '@/lib/utils';

type Cell = { read: boolean; write: boolean; approve: boolean };
interface RoleRow { role: string; label: string; description: string; userCount: number; activeUserCount: number; grantCount: number; editable: boolean }
interface Matrix { modules: string[]; actions: ('read' | 'write' | 'approve')[]; matrix: Record<string, Record<string, Cell>> }

export default function RolesPage() {
  const roles = useApi<RoleRow[]>('/admin/roles');
  const mx = useApi<Matrix>('/admin/roles/matrix');
  const [sel, setSel] = useState('PLANNER');
  const [edits, setEdits] = useState<Record<string, boolean>>({}); // "module:action" -> allowed
  const [reset, setReset] = useState(false);
  const { busy, run } = useBusy();
  const role = roles.data?.find((r) => r.role === sel);
  const cur = mx.data?.matrix[sel];
  const eff = (m: string, a: 'read' | 'write' | 'approve') => (`${m}:${a}` in edits ? edits[`${m}:${a}`] : cur?.[m]?.[a] ?? false);
  const dirty = Object.keys(edits).length;
  const toggle = (m: string, a: 'read' | 'write' | 'approve') => {
    const v = !eff(m, a); const base = cur?.[m]?.[a] ?? false;
    setEdits((e) => { const n = { ...e }; if (v === base) delete n[`${m}:${a}`]; else n[`${m}:${a}`] = v; return n; });
  };
  const groups = useMemo(() => mx.data?.modules ?? [], [mx.data]);
  const save = () => run('save', async () => {
    await api.put(`/admin/roles/${sel}/permissions`, { changes: Object.entries(edits).map(([k, allowed]) => { const [module, action] = k.split(':'); return { module, action, allowed }; }) });
    setEdits({}); mx.reload(); roles.reload();
  }, 'Permissions saved');
  const doReset = () => run('reset', async () => { await api.post(`/admin/roles/${sel}/reset`); setEdits({}); mx.reload(); roles.reload(); setReset(false); }, 'Reset to defaults');
  const pick = (r: string) => { if (dirty && !confirm('Discard unsaved permission changes?')) return; setEdits({}); setSel(r); };

  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="Module access per role. Changes apply to checks backed by the permission table within about 30 seconds." />
      <div className="grid xl:grid-cols-[320px_1fr] gap-5 items-start">
        <Card title="Roles" pad={false}>
          <Load state={roles}>
            <ul className="divide-y divide-line">{roles.data?.map((r) => (
              <li key={r.role}><button onClick={() => pick(r.role)} className={`w-full text-left px-5 py-3 hover:bg-surface-2 ${sel === r.role ? 'bg-gold-soft' : ''}`}>
                <div className="flex justify-between gap-2"><span className="font-medium">{r.label}</span><span className="text-xs text-ink-soft whitespace-nowrap">{r.activeUserCount} user{r.activeUserCount === 1 ? '' : 's'}</span></div>
                <p className="text-xs text-ink-soft mt-0.5 line-clamp-2">{r.description}</p>
              </button></li>
            ))}</ul>
          </Load>
        </Card>
        <Card title={role ? `${role.label}: module permissions` : 'Module permissions'} pad={false}
          action={role?.editable && <div className="flex gap-2"><button className="btn-secondary btn-sm" onClick={() => setReset(true)}><RotateCcw className="h-3.5 w-3.5" />Reset to defaults</button><button className="btn-primary btn-sm" disabled={!dirty || !!busy} onClick={save}>{busy === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save{dirty ? ` (${dirty})` : ''}</button></div>}>
          <Load state={mx} rows={8}>
            {role && !role.editable && <p className="px-5 pb-3 text-sm text-ink-soft">This role always has full access and cannot be edited.</p>}
            {role?.role === 'SYSADMIN' && <p className="px-5 pb-3 text-sm text-ink-soft">Financial and wedding modules cannot be granted to the System Administrator, and user/role management cannot be revoked.</p>}
            <div className="overflow-x-auto"><table className="w-full" style={{ minWidth: 520 }}>
              <thead><tr><th className="th">Module</th>{mx.data?.actions.map((a) => <th key={a} className="th text-center">{humanize(a)}</th>)}</tr></thead>
              <tbody>{groups.map((m) => <tr key={m}><td className="td">{humanize(m)}</td>{mx.data?.actions.map((a) => (
                <td key={a} className="td text-center"><input type="checkbox" className="h-4 w-4 accent-[#401827]" aria-label={`${m} ${a}`} disabled={!role?.editable} checked={eff(m, a)} onChange={() => toggle(m, a)} />{`${m}:${a}` in edits && <span className="ml-1 text-gold">•</span>}</td>
              ))}</tr>)}</tbody>
            </table></div>
          </Load>
        </Card>
      </div>
      <Confirm open={reset} title="Reset permissions" busy={busy === 'reset'} message={<>Restore the built-in defaults for {role?.label}? Custom changes for this role are discarded.</>} confirmLabel="Reset" onConfirm={doReset} onClose={() => setReset(false)} />
    </>
  );
}
