'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { Card, Field, Modal, PageHeader, Pagination, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Segmented, Select, SearchInput } from '@/components/shared/form-bits';
import { AnnouncementsFeed, type AnnouncementItem } from '@/components/announcements/feed';
import { Can, RoleGate } from '@/components/shared/can';
import { useApi, asRows } from '@/hooks/use-api';
import { useList } from '@/hooks/use-list';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDateTime } from '@/lib/utils';
import type { Vendor, Wedding } from '@/types';

const AUDIENCES = [{ v: 'ALL', l: 'Everyone' }, { v: 'CLIENTS', l: 'Clients' }, { v: 'VENDORS', l: 'Vendors' }, { v: 'TEAM', l: 'Team' }];

function ComposeModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const weddings = asRows<Wedding>(useApi<unknown>(open ? '/weddings' : null, { pageSize: 100 }).data);
  const vendors = asRows<Vendor>(useApi<unknown>(open ? '/vendors' : null, { pageSize: 200 }).data);
  const [f, setF] = useState({ title: '', body: '', audience: 'ALL', weddingId: '', vendorId: '', pinned: false, expiresAt: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/announcements', { title: f.title.trim(), body: f.body.trim(), audience: f.audience, weddingId: f.weddingId || undefined, vendorId: f.audience === 'VENDORS' && f.vendorId ? f.vendorId : undefined, pinned: f.pinned, expiresAt: f.expiresAt || undefined });
      notify.ok('Announcement published'); setF({ title: '', body: '', audience: 'ALL', weddingId: '', vendorId: '', pinned: false, expiresAt: '' }); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New announcement" width="max-w-xl" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || f.title.trim().length < 2 || !f.body.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Publish</button></>}>
      <div className="space-y-4">
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={160} /></Field>
        <Field label="Message"><textarea className="input min-h-[120px] py-2" value={f.body} onChange={(e) => set('body', e.target.value)} maxLength={5000} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Audience"><Select value={f.audience} onChange={(v) => set('audience', v)} options={AUDIENCES} /></Field>
          <Field label="Wedding (optional)"><Select value={f.weddingId} onChange={(v) => set('weddingId', v)} options={weddings.map((w) => ({ v: w.id, l: w.name }))} placeholder="All weddings" /></Field>
          {f.audience === 'VENDORS' && <Field label="Single vendor (optional)"><Select value={f.vendorId} onChange={(v) => set('vendorId', v)} options={vendors.map((v) => ({ v: v.id, l: v.name }))} placeholder="All vendors" /></Field>}
          <Field label="Expires (optional)"><input className="input" type="date" value={f.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#401827]" checked={f.pinned} onChange={(e) => set('pinned', e.target.checked)} />Pin to the top</label>
        <p className="text-xs text-ink-soft">Recipients are notified instantly. With a wedding selected, clients and vendors outside that wedding do not see it.</p>
      </div>
    </Modal>
  );
}

function Manage() {
  const [audience, setAudience] = useState('');
  const [composing, setComposing] = useState(false);
  const list = useList<AnnouncementItem>('/announcements', { audience: audience || undefined }, 12);
  const togglePin = async (a: AnnouncementItem) => { try { await api.patch(`/announcements/${a.id}`, { pinned: !a.pinned }); list.reload(); } catch (e) { notify.err(e); } };
  const remove = async (a: AnnouncementItem) => { if (!confirm(`Delete "${a.title}"? Recipients will no longer see it.`)) return; try { await api.del(`/announcements/${a.id}`); notify.ok('Announcement deleted'); list.reload(); } catch (e) { notify.err(e); } };

  const cols: ColumnDef<AnnouncementItem, unknown>[] = [
    { id: 'title', header: 'Announcement', enableSorting: false, cell: ({ row: { original: a } }) => <div className="max-w-md"><p className="font-medium flex items-center gap-1.5">{a.pinned && <Pin className="h-3.5 w-3.5 text-gold" />}{a.title}</p><p className="text-xs text-ink-soft line-clamp-1">{a.body}</p></div> },
    { id: 'audience', header: 'Audience', enableSorting: false, cell: ({ row: { original: a } }) => <StatusBadge status={a.audience} tone="gold" /> },
    { id: 'wedding', header: 'Wedding', enableSorting: false, cell: ({ row: { original: a } }) => a.wedding?.name ?? 'All' },
    { id: 'read', header: 'Read by', enableSorting: false, cell: ({ row: { original: a } }) => <span className="num text-sm">{a.readCount ?? 0}<span className="text-ink-soft font-normal"> / {a.recipients ?? 0}</span></span> },
    { id: 'published', header: 'Published', enableSorting: false, cell: ({ row: { original: a } }) => <div className="whitespace-nowrap">{fmtDateTime(a.publishedAt)}<p className="text-xs text-ink-soft">{a.authorName ?? ''}{a.expired ? ' · expired' : ''}</p></div> },
    { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: a } }) => <Can roles={['PLANNER']}><span className="flex gap-1 justify-end"><button className="btn-ghost btn-sm !px-2" aria-label={a.pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(a)}>{a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button><button className="btn-ghost btn-sm !px-2" aria-label={`Delete ${a.title}`} onClick={() => remove(a)}><Trash2 className="h-4 w-4" /></button></span></Can> },
  ];
  return (
    <>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search announcements…" />
          <Select className="w-44" value={audience} onChange={(v) => { setAudience(v); list.setPage(1); }} options={AUDIENCES} placeholder="All audiences" />
          <Can roles={['PLANNER']}><button className="btn-primary ml-auto" onClick={() => setComposing(true)}><Plus className="h-4 w-4" />New announcement</button></Can>
        </div>
        <DataTable columns={cols} data={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} emptyTitle="No announcements" emptyHint="Publish one to notify clients, vendors or the team." />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      </Card>
      <ComposeModal open={composing} onClose={() => setComposing(false)} onSaved={list.reload} />
    </>
  );
}

export default function AnnouncementsPage() {
  const [view, setView] = useState<'manage' | 'feed'>('manage');
  return (
    <RoleGate roles={['PLANNER', 'EVENT_MANAGER']}>
      <PageHeader title="Announcements" subtitle="Publish updates to clients, vendors and the team." actions={<Segmented value={view} onChange={setView} options={[{ v: 'manage', l: 'Published' }, { v: 'feed', l: 'My feed' }]} />} />
      {view === 'manage' ? <Manage /> : <AnnouncementsFeed base="/announcements" listPath="/announcements/feed" />}
    </RoleGate>
  );
}
