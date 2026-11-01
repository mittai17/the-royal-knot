'use client';
import { useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, Mail, Plus, Trash2, Upload } from 'lucide-react';
import { Card, Field, Modal, PageHeader, Pagination, StatCard, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { SearchInput, Select } from '@/components/shared/form-bits';
import { useApi } from '@/hooks/use-api';
import { useList } from '@/hooks/use-list';
import { api } from '@/lib/api';
import { csvToGuests, type GuestCsvRow } from '@/lib/csv';
import { RSVPS } from '@/lib/enums';
import { notify } from '@/lib/toast';
import type { Guest } from '@/types';

const BASE = '/portal/client';
interface Stats { weddingExpected: number; invitedHeadcount: number; guests: number; confirmed: number; declined: number; pending: number; groups: { group: string; count: number }[] }

function GuestForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const blank = { name: '', phone: '', email: '', groupName: '', category: '', plusOnes: '0', dietary: '', accommodationNeeded: false };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF({ ...f, [k]: v });
  const save = async () => {
    setBusy(true);
    try {
      await api.post(`${BASE}/guests`, { name: f.name, plusOnes: Number(f.plusOnes) || 0, accommodationNeeded: f.accommodationNeeded, phone: f.phone || undefined, email: f.email || undefined, groupName: f.groupName || undefined, category: f.category || undefined, dietary: f.dietary || undefined });
      notify.ok('Guest added'); setF(blank); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add guest" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.name.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add guest</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" className="col-span-2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email (needed to send an invitation)"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Family / group"><input className="input" value={f.groupName} onChange={(e) => set('groupName', e.target.value)} /></Field>
        <Field label="Side / category"><input className="input" placeholder="Bride side, Friends…" value={f.category} onChange={(e) => set('category', e.target.value)} /></Field>
        <Field label="Accompanying guests"><input className="input" type="number" min={0} value={f.plusOnes} onChange={(e) => set('plusOnes', e.target.value)} /></Field>
        <Field label="Dietary preference"><input className="input" value={f.dietary} onChange={(e) => set('dietary', e.target.value)} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#401827]" checked={f.accommodationNeeded} onChange={(e) => set('accommodationNeeded', e.target.checked)} />Needs accommodation</label>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<GuestCsvRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const onFile = async (file?: File) => { if (!file) return; const t = await file.text(); const r = csvToGuests(t); setText(t); setRows(r.rows); setErrors(r.errors); };
  const upload = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ imported: number; skipped: number; errors: { row: number; error: string }[] }>(`${BASE}/guests/import`, { csv: text });
      notify.ok(`${r.data.imported} guests imported${r.data.skipped ? `, ${r.data.skipped} skipped` : ''}`);
      if (r.data.errors.length) setErrors(r.data.errors.map((e) => `Row ${e.row}: ${e.error}`)); else { setRows([]); setText(''); onClose(); }
      onSaved();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Import guests from CSV" width="max-w-2xl" footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !rows.length} onClick={upload}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Import {rows.length || ''} guests</button></>}>
      <p className="text-sm text-ink-soft mb-3">Columns: <code className="bg-surface-2 px-1 rounded">name</code> (required), phone, email, group, category, plusOnes, dietary, accommodation. Existing name + phone pairs are skipped.</p>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <button className="w-full border-2 border-dashed border-line rounded-xl py-8 text-sm text-ink-soft hover:bg-surface-2/50" onClick={() => ref.current?.click()}><Upload className="h-5 w-5 mx-auto mb-2" />Choose a CSV file</button>
      {errors.length > 0 && <ul className="mt-3 text-xs text-danger bg-danger-soft rounded-lg p-3 space-y-0.5 max-h-28 overflow-y-auto">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {rows.length > 0 && <p className="text-xs text-ink-soft mt-3">{rows.length} valid rows ready (first: {rows[0].name}).</p>}
    </Modal>
  );
}

export default function Page() {
  const [rsvp, setRsvp] = useState('');
  const [inv, setInv] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const list = useList<Guest>(`${BASE}/guests`, { rsvp: rsvp || undefined, invitationStatus: inv || undefined }, 25);
  const stats = useApi<Stats>(`${BASE}/guests/stats`);
  const reload = () => { void list.reload(); void stats.reload(); };
  const st = stats.data;

  const setRsvpFor = async (g: Guest, v: string) => { try { await api.patch(`${BASE}/guests/${g.id}`, { rsvp: v }); reload(); } catch (e) { notify.err(e); } };
  const remove = async (g: Guest) => { if (!confirm(`Remove ${g.name} from your guest list?`)) return; try { await api.del(`${BASE}/guests/${g.id}`); notify.ok('Guest removed'); reload(); } catch (e) { notify.err(e); } };
  const invite = async (body: { guestIds?: string[]; allPending?: boolean }) => {
    setInviting(true);
    try {
      const r = await api.post<{ queued: number; skipped: { name: string; reason: string }[] }>(`${BASE}/guests/invite`, body);
      notify.ok(`${r.data.queued} invitation${r.data.queued === 1 ? '' : 's'} queued${r.data.skipped.length ? ` · ${r.data.skipped.length} skipped (${r.data.skipped[0].reason.toLowerCase()})` : ''}`);
      reload();
    } catch (e) { notify.err(e); } finally { setInviting(false); }
  };

  const cols: ColumnDef<Guest, unknown>[] = [
    { id: 'name', header: 'Guest', enableSorting: false, cell: ({ row: { original: g } }) => <div><p className="font-medium">{g.name}</p><p className="text-xs text-ink-soft">{g.email ?? g.phone ?? 'No contact details'}</p></div> },
    { id: 'group', header: 'Group', enableSorting: false, cell: ({ row: { original: g } }) => <div>{g.groupName ?? '—'}<p className="text-xs text-ink-soft">{g.category}</p></div> },
    { id: 'inv', header: 'Invitation', enableSorting: false, cell: ({ row: { original: g } }) => <StatusBadge status={g.invitationStatus} tone={g.invitationStatus === 'NOT_SENT' ? 'neutral' : 'info'} /> },
    { id: 'rsvp', header: 'RSVP', enableSorting: false, cell: ({ row: { original: g } }) => <select aria-label={`RSVP for ${g.name}`} className="text-xs rounded-md border border-line bg-white h-7 px-1.5" value={g.rsvp} onChange={(e) => setRsvpFor(g, e.target.value)}>{RSVPS.map((o) => <option key={o} value={o}>{o.charAt(0) + o.slice(1).toLowerCase()}</option>)}</select> },
    { id: 'plus', header: '+Guests', enableSorting: false, cell: ({ row: { original: g } }) => <span className="tabular-nums">{g.plusOnes}</span> },
    { id: 'diet', header: 'Dietary', enableSorting: false, cell: ({ row: { original: g } }) => <span>{g.dietary ?? '—'}{g.accommodationNeeded && <span className="ml-1 text-[11px] text-info">· stay</span>}</span> },
    { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: g } }) => (
      <div className="flex gap-1 justify-end">
        <button className="btn-secondary btn-sm" disabled={inviting || !g.email} title={g.email ? 'Email an invitation' : 'Add an email address to send an invitation'} onClick={() => invite({ guestIds: [g.id] })}><Mail className="h-3.5 w-3.5" />{g.invitationStatus === 'NOT_SENT' ? 'Invite' : 'Resend'}</button>
        <button className="btn-ghost btn-sm !px-2" aria-label={`Remove ${g.name}`} onClick={() => remove(g)}><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Guests & RSVPs" subtitle="Build your guest list, send invitations and track responses." actions={<><button className="btn-secondary" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />Import CSV</button><button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add guest</button></>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Invited (heads)" value={st?.invitedHeadcount ?? '—'} hint={`${st?.guests ?? 0} invitations · target ${st?.weddingExpected ?? '—'}`} />
        <StatCard label="Confirmed" value={st?.confirmed ?? '—'} hint="RSVP yes, incl. accompanying" />
        <StatCard label="Declined" value={st?.declined ?? '—'} />
        <StatCard label="Awaiting reply" value={st ? st.pending : '—'} />
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search guests…" />
          <Select className="w-36" value={rsvp} onChange={(v) => { setRsvp(v); list.setPage(1); }} options={RSVPS} placeholder="Any RSVP" />
          <Select className="w-40" value={inv} onChange={(v) => { setInv(v); list.setPage(1); }} options={['NOT_SENT', 'SENT', 'DELIVERED']} placeholder="Any invitation" />
          <button className="btn-secondary ml-auto" disabled={inviting} onClick={() => invite({ allPending: true })}>{inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Invite everyone not yet invited</button>
        </div>
        <DataTable columns={cols} data={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} emptyTitle="No guests yet" emptyHint="Add guests one by one or import a CSV file." />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      </Card>
      <GuestForm open={adding} onClose={() => setAdding(false)} onSaved={reload} />
      <ImportModal open={importing} onClose={() => setImporting(false)} onSaved={reload} />
    </div>
  );
}
