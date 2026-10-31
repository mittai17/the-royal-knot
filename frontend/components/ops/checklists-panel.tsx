'use client';
import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardCheck, Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import { Card, EmptyState, Field, Modal, ProgressBar, StatCard } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { Can } from '@/components/shared/can';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { G } from '@/lib/permissions';
import { notify } from '@/lib/toast';
import { cn, fmtDate } from '@/lib/utils';
import { LiveWatch } from './live-watch';
import { Async } from './shared';
import type { Checklist, EventFunction } from './types';

function CreateChecklist({ weddingId, onClose, onSaved }: { weddingId: string; onClose: () => void; onSaved: () => void }) {
  const fns = useApi<EventFunction[]>('/events/functions', { weddingId });
  const [f, setF] = useState({ name: '', fn: '', clientVisible: false, items: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const name = f.fn ? `[${f.fn}] ${f.name}` : f.name;
      const items = f.items.split('\n').map((t) => t.trim()).filter(Boolean).map((title) => ({ title }));
      await api.post('/checklists', { name, weddingId, clientVisible: f.clientVisible, items });
      notify.ok('Checklist created'); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="New checklist" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.name.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Create</button></>}>
      <div className="space-y-4">
        <Field label="Name"><input className="input" placeholder="Setup checklist" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Function (optional)"><Select value={f.fn} onChange={(v) => setF({ ...f, fn: v })} options={(fns.data ?? []).map((x) => ({ v: x.name, l: x.name }))} placeholder="Whole wedding" /></Field>
        <Field label="Items (one per line)"><textarea className="input min-h-[120px]" value={f.items} onChange={(e) => setF({ ...f, items: e.target.value })} /></Field>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.clientVisible} onChange={(e) => setF({ ...f, clientVisible: e.target.checked })} />Visible to the couple in their portal</label>
      </div>
    </Modal>
  );
}

function Item({ it, onChanged, canWrite }: { it: Checklist['items'][number]; onChanged: () => void; canWrite: boolean }) {
  const [busy, setBusy] = useState(false);
  const tick = async () => { setBusy(true); try { await api.patch(`/checklists/items/${it.id}`, { done: !it.done }); onChanged(); } catch (e) { notify.err(e); } finally { setBusy(false); } };
  const del = async () => { try { await api.del(`/checklists/items/${it.id}`); onChanged(); } catch (e) { notify.err(e); } };
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <input type="checkbox" className="h-4 w-4" checked={it.done} disabled={!canWrite || busy} onChange={tick} aria-label={it.title} />
      <span className={cn('text-sm flex-1 min-w-0', it.done && 'line-through text-ink-soft')}>{it.title}</span>
      {it.dueDate && <span className="text-xs text-ink-soft whitespace-nowrap">{fmtDate(it.dueDate, 'dd MMM')}</span>}
      {canWrite && <button className="btn-ghost btn-sm !px-1.5 text-danger" aria-label={`Remove ${it.title}`} onClick={del}><Trash2 className="h-3.5 w-3.5" /></button>}
    </li>
  );
}

function ChecklistCard({ c, onChanged }: { c: Checklist; onChanged: () => void }) {
  const { can } = useAuth();
  const canWrite = can(...G.EVENT_OPS);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const add = async () => { if (!title.trim()) return; try { await api.post(`/checklists/${c.id}/items`, { title }); setTitle(''); onChanged(); } catch (e) { notify.err(e); } };
  const toggleVisible = async () => { try { await api.patch(`/checklists/${c.id}`, { clientVisible: !c.clientVisible }); onChanged(); } catch (e) { notify.err(e); } };
  const del = async () => { if (!window.confirm(`Delete "${c.name}"?`)) return; try { await api.del(`/checklists/${c.id}`); notify.ok('Checklist deleted'); onChanged(); } catch (e) { notify.err(e); } };
  return (
    <li className="card min-w-0">
      <div className="flex items-center gap-3 p-4">
        <button className="flex items-center gap-2 flex-1 min-w-0 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="min-w-0"><span className="block font-medium truncate">{c.name}</span><span className="block text-xs text-ink-soft">{c.progress.done}/{c.progress.total} done{c.clientVisible ? ' · shared with couple' : ''}</span></span>
        </button>
        <div className="w-28 hidden sm:block"><ProgressBar value={c.progress.pct} /></div><span className="num text-sm w-10 text-right">{c.progress.pct}%</span>
      </div>
      {open && (
        <div className="border-t border-line px-4 py-3">
          {c.items.length === 0 ? <p className="text-sm text-ink-soft py-1">No items yet.</p> : <ul className="divide-y divide-line/60">{c.items.map((it) => <Item key={it.id} it={it} onChanged={onChanged} canWrite={canWrite} />)}</ul>}
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <input className="input flex-1 min-w-[10rem]" placeholder="Add an item…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button className="btn-secondary btn-sm" onClick={add} disabled={!title.trim()}><Plus className="h-3 w-3" />Add</button>
              <button className="btn-ghost btn-sm" onClick={toggleVisible}><Eye className="h-3 w-3" />{c.clientVisible ? 'Hide from couple' : 'Share with couple'}</button>
              <button className="btn-ghost btn-sm text-danger" onClick={del}>Delete list</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function ChecklistsPanel({ weddingId }: { weddingId: string }) {
  const { data, loading, error, reload } = useApi<Checklist[]>('/checklists', { weddingId });
  const [creating, setCreating] = useState(false);
  const refresh = useCallback(() => { void reload(); }, [reload]);
  const all = (data ?? []).flatMap((c) => c.items);
  const done = all.filter((i) => i.done).length;
  return (
    <div className="space-y-5">
      <LiveWatch weddingId={weddingId} events={['checklist.updated']} onChange={refresh} />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Checklists" value={data?.length ?? '—'} icon={<ClipboardCheck className="h-5 w-5" />} />
        <StatCard label="Items done" value={data ? `${done}/${all.length}` : '—'} />
        <StatCard label="Overall progress" value={data ? `${all.length ? Math.round((done / all.length) * 100) : 0}%` : '—'} />
      </div>
      <div className="flex justify-end"><Can roles={G.EVENT_OPS}><button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New checklist</button></Can></div>
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {(data ?? []).length === 0 ? <Card><EmptyState title="No checklists yet" hint="Create a checklist for the wedding or for a single function, e.g. Mehendi setup." /></Card> : <ul className="space-y-3">{data!.map((c) => <ChecklistCard key={c.id} c={c} onChanged={refresh} />)}</ul>}
      </Async>
      {creating && <CreateChecklist weddingId={weddingId} onClose={() => setCreating(false)} onSaved={refresh} />}
    </div>
  );
}
