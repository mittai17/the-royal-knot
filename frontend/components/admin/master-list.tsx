'use client';
import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { EmptyState, StatusBadge } from '@/components/ui/primitives';
import { Confirm, Load, Toggle, useBusy } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

interface Item { id: string; type: string; code: string; label: string; active: boolean; sortOrder: number }

/** Reusable CRUD list for one MasterDataItem type (also used by Founder Settings for wedding packages). */
export function MasterList({ type, noun }: { type: string; noun: string }) {
  const list = useApi<Item[]>('/admin/master-data', { type });
  const [label, setLabel] = useState('');
  const [edit, setEdit] = useState<{ id: string; label: string } | null>(null);
  const [del, setDel] = useState<Item | null>(null);
  const { busy, run } = useBusy();
  const add = () => run('add', async () => { await api.post('/admin/master-data', { type, label }); setLabel(''); list.reload(); }, `${noun} added`);
  return (
    <>
      <div className="flex gap-2 mb-4 max-w-md"><input className="input" placeholder={`New ${noun.toLowerCase()}…`} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && label.trim() && add()} /><button className="btn-primary" disabled={!label.trim() || !!busy} onClick={add}><Plus className="h-4 w-4" />Add</button></div>
      <Load state={list}>
        {!list.data?.length ? <EmptyState title={`No ${noun.toLowerCase()} yet`} hint="Add the first one above." /> : (
          <ul className="divide-y divide-line border border-line rounded-xl">{list.data.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
              {edit?.id === i.id ? <>
                <input className="input h-8 flex-1" autoFocus value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
                <button className="btn-ghost btn-sm !px-2" aria-label="Save" disabled={!edit.label.trim()} onClick={() => run('edit', async () => { await api.patch(`/admin/master-data/${i.id}`, { label: edit.label }); setEdit(null); list.reload(); }, 'Updated')}><Check className="h-4 w-4" /></button>
                <button className="btn-ghost btn-sm !px-2" aria-label="Cancel" onClick={() => setEdit(null)}><X className="h-4 w-4" /></button>
              </> : <>
                <span className={`flex-1 ${i.active ? '' : 'text-ink-soft line-through'}`}>{i.label}</span>
                <span className="text-xs text-ink-soft hidden sm:block">{i.code}</span>
                {!i.active && <StatusBadge status="Inactive" tone="neutral" />}
                <Toggle checked={i.active} label={`${i.label} active`} onChange={(v) => run('t', async () => { await api.patch(`/admin/master-data/${i.id}`, { active: v }); list.reload(); })} />
                <button className="btn-ghost btn-sm !px-2" aria-label={`Rename ${i.label}`} onClick={() => setEdit({ id: i.id, label: i.label })}><Pencil className="h-4 w-4" /></button>
                <button className="btn-ghost btn-sm !px-2" aria-label={`Delete ${i.label}`} onClick={() => setDel(i)}><Trash2 className="h-4 w-4" /></button>
              </>}
            </li>))}</ul>)}
      </Load>
      <Confirm open={!!del} danger title={`Delete ${noun.toLowerCase()}`} confirmLabel="Delete" busy={busy === 'del'} message={<>Delete “{del?.label}”? Consider switching it off instead to keep history.</>} onClose={() => setDel(null)} onConfirm={() => run('del', async () => { await api.del(`/admin/master-data/${del!.id}`); setDel(null); list.reload(); }, 'Deleted')} />
    </>
  );
}

