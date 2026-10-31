'use client';
import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Segmented } from '@/components/shared/form-bits';
import { Confirm, Load, Toggle, useBusy } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';

import { TemplateEditor, type Tpl } from '@/components/admin/template-editor';

interface Trigger { label: string; enabled: boolean; daysBefore?: number }

export default function EmailPage() {
  const [tab, setTab] = useState<'templates' | 'triggers'>('templates');
  const list = useApi<Tpl[]>('/admin/email/templates');
  const trig = useApi<Record<string, Trigger>>('/admin/email/triggers');
  const [edit, setEdit] = useState<{ open: boolean; tpl?: Tpl }>({ open: false });
  const [del, setDel] = useState<Tpl | null>(null);
  const { busy, run } = useBusy();
  const setTrigger = (k: string, patch: Partial<Trigger>) => run('trig', async () => { await api.put('/admin/email/triggers', { [k]: patch }); trig.reload(); });
  return (
    <>
      <PageHeader title="Email & Notifications" subtitle="Message templates and when they are sent." actions={tab === 'templates' && <button className="btn-primary" onClick={() => setEdit({ open: true })}><Plus className="h-4 w-4" />New template</button>} />
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ v: 'templates', l: 'Templates' }, { v: 'triggers', l: 'Trigger settings' }]} /></div>
      {tab === 'templates' ? <Card pad={false}><Load state={list}>
        {!list.data?.length ? <EmptyState title="No templates" hint="Create the first one." /> : <ul className="divide-y divide-line">{list.data.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-5 py-3">
            <button className="flex-1 min-w-0 text-left" onClick={() => setEdit({ open: true, tpl: t })}><p className="font-medium">{t.name}</p><p className="text-xs text-ink-soft truncate">{t.subject}</p></button>
            {!t.enabled && <StatusBadge status="Disabled" tone="neutral" />}
            <Toggle checked={t.enabled} label={`${t.name} enabled`} onChange={(v) => run('en', async () => { await api.patch(`/admin/email/templates/${t.id}`, { enabled: v }); list.reload(); })} />
            <button className="btn-ghost btn-sm !px-2" aria-label={`Delete ${t.name}`} onClick={() => setDel(t)}><Trash2 className="h-4 w-4" /></button>
          </li>))}</ul>}
      </Load></Card> : <Card><Load state={trig}><ul className="divide-y divide-line">{Object.entries(trig.data ?? {}).map(([k, t]) => (
        <li key={k} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{t.label}</p>{t.daysBefore !== undefined && <label className="text-xs text-ink-soft flex items-center gap-2 mt-1">Days before <input className="input !h-7 !w-16" type="number" min={0} max={90} defaultValue={t.daysBefore} onBlur={(e) => Number(e.target.value) !== t.daysBefore && setTrigger(k, { daysBefore: Number(e.target.value) })} /></label>}</div><Toggle checked={t.enabled} label={t.label} disabled={busy === 'trig'} onChange={(v) => setTrigger(k, { enabled: v })} /></li>))}</ul>
        <p className="text-xs text-ink-soft mt-3" onClick={() => notify.ok('Saved automatically')}>Changes save immediately.</p></Load></Card>}
      <TemplateEditor key={edit.tpl?.id ?? 'new'} tpl={edit.tpl} open={edit.open} onClose={() => setEdit({ open: false })} onSaved={list.reload} />
      <Confirm open={!!del} danger title="Delete template" confirmLabel="Delete" busy={busy === 'del'} message={<>Delete “{del?.name}”?</>} onClose={() => setDel(null)} onConfirm={() => run('del', async () => { await api.del(`/admin/email/templates/${del!.id}`); setDel(null); list.reload(); }, 'Deleted')} />
    </>
  );
}
