'use client';
import { useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Upload, UserCheck, UserX, Loader2 } from 'lucide-react';
import { Card, Field, Modal, Pagination, StatCard, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Select, SearchInput } from '@/components/shared/form-bits';
import { useApi } from '@/hooks/use-api';
import { useList } from '@/hooks/use-list';
import { useLive } from '@/hooks/use-live';
import { api } from '@/lib/api';
import { csvToGuests, type GuestCsvRow } from '@/lib/csv';
import { notify } from '@/lib/toast';
import { INVITATIONS, RSVPS } from '@/lib/enums';
import type { Guest } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';


function GuestForm({ weddingId, open, onClose, onSaved }: { weddingId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', groupName: '', category: '', rsvp: 'PENDING', invitationStatus: 'NOT_SENT', plusOnes: '0', dietary: '', accommodationNeeded: false });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF({ ...f, [k]: v });
  const save = async () => {
    setBusy(true);
    try { await api.post(`/weddings/${weddingId}/guests`, { ...f, plusOnes: Number(f.plusOnes) || 0, phone: f.phone || undefined, email: f.email || undefined, groupName: f.groupName || undefined, category: f.category || undefined, dietary: f.dietary || undefined }); notify.ok('Guest registered'); onSaved(); onClose(); }
    catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Register guest" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.name} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save guest</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" className="col-span-2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Family / group"><input className="input" value={f.groupName} onChange={(e) => set('groupName', e.target.value)} /></Field>
        <Field label="Category"><input className="input" placeholder="Family, Friend, VIP…" value={f.category} onChange={(e) => set('category', e.target.value)} /></Field>
        <Field label="RSVP"><Select value={f.rsvp} onChange={(v) => set('rsvp', v)} options={RSVPS} /></Field>
        <Field label="Invitation"><Select value={f.invitationStatus} onChange={(v) => set('invitationStatus', v)} options={INVITATIONS} /></Field>
        <Field label="Accompanying guests"><input className="input" type="number" min={0} value={f.plusOnes} onChange={(e) => set('plusOnes', e.target.value)} /></Field>
        <Field label="Dietary preference"><input className="input" value={f.dietary} onChange={(e) => set('dietary', e.target.value)} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#401827]" checked={f.accommodationNeeded} onChange={(e) => set('accommodationNeeded', e.target.checked)} />Needs accommodation</label>
      </div>
    </Modal>
  );
}

function ImportModal({ weddingId, open, onClose, onSaved }: { weddingId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<GuestCsvRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const onFile = async (file?: File) => { if (!file) return; const t = await file.text(); const r = csvToGuests(t); setText(t); setRows(r.rows); setErrors(r.errors); };
  const upload = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ imported: number; skipped: number; errors: { row: number; error: string }[] }>(`/weddings/${weddingId}/guests/import`, { csv: text });
      notify.ok(`${r.data.imported} guests imported${r.data.skipped ? `, ${r.data.skipped} skipped` : ''}`);
      if (r.data.errors.length) setErrors(r.data.errors.map((e) => `Row ${e.row}: ${e.error}`)); else { setRows([]); setText(''); onClose(); }
      onSaved();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Import guests from CSV" width="max-w-2xl" footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !rows.length} onClick={upload}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Import {rows.length || ''} guests</button></>}>
      <p className="text-sm text-ink-soft mb-3">Columns: <code className="bg-surface-2 px-1 rounded">name</code> (required), phone, email, group, category, plusOnes, dietary, accommodation, rsvp, invitation. Existing name + phone pairs are skipped.</p>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <button className="w-full border-2 border-dashed border-line rounded-xl py-8 text-sm text-ink-soft hover:bg-surface-2/50" onClick={() => ref.current?.click()}><Upload className="h-5 w-5 mx-auto mb-2" />Choose a CSV file</button>
      {errors.length > 0 && <ul className="mt-3 text-xs text-danger bg-danger-soft rounded-lg p-3 space-y-0.5 max-h-28 overflow-y-auto">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {rows.length > 0 && <div className="mt-3 border border-line rounded-xl overflow-hidden"><table className="w-full text-xs"><thead><tr className="bg-surface-2/60 text-left"><th className="px-3 py-2">Name</th><th>Group</th><th>RSVP</th><th>+</th></tr></thead><tbody>{rows.slice(0, 6).map((r, i) => <tr key={i} className="border-t border-line"><td className="px-3 py-1.5">{r.name}</td><td>{r.groupName ?? '—'}</td><td>{r.rsvp ?? 'PENDING'}</td><td>{r.plusOnes ?? 0}</td></tr>)}</tbody></table><p className="text-xs text-ink-soft px-3 py-2 border-t border-line">{rows.length} valid rows ready{rows.length > 6 ? ' (first 6 shown)' : ''}</p></div>}
    </Modal>
  );
}

interface Stats { weddingExpected: number; invitedHeadcount: number; guests: number; confirmed: number; declined: number; maybe: number; pending: number; checkedIn: number; actualRecorded: number | null; accommodationNeeded: number; groups: { group: string; count: number }[] }

export function GuestsPanel({ weddingId }: { weddingId: string; expected?: number }) {
  const [rsvp, setRsvp] = useState('');
  const [group, setGroup] = useState('');
  const [state, setState] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const list = useList<Guest>(`/weddings/${weddingId}/guests`, { rsvp: rsvp || undefined, groupName: group || undefined, checkedIn: state === '' ? undefined : state === 'in' }, 25);
  const stats = useApi<Stats>(`/weddings/${weddingId}/guests/stats`);
  useLive(weddingId, (e) => { if (e === 'guests.updated') { void list.reload(); void stats.reload(); } });
  const reload = () => { list.reload(); stats.reload(); };
  const st = stats.data;

  const checkIn = async (g: Guest, undo: boolean) => {
    try { await api.post(`/guests/${g.id}/checkin`, undo ? { undo: true } : {}); reload(); } catch (e) { notify.err(e); }
  };
  const setRsvpFor = async (g: Guest, v: string) => { try { await api.patch(`/guests/${g.id}`, { rsvp: v }); reload(); } catch (e) { notify.err(e); } };

  const cols: ColumnDef<Guest, unknown>[] = [
    { id: 'name', header: 'Guest', enableSorting: false, cell: ({ row: { original: g } }) => <div><p className="font-medium">{g.name}</p><p className="text-xs text-ink-soft">{g.phone ?? g.email ?? ''}</p></div> },
    { id: 'group', header: 'Group', enableSorting: false, cell: ({ row: { original: g } }) => <div>{g.groupName ?? '—'}<p className="text-xs text-ink-soft">{g.category}</p></div> },
    { id: 'inv', header: 'Invitation', enableSorting: false, cell: ({ row: { original: g } }) => <StatusBadge status={g.invitationStatus} tone={g.invitationStatus === 'NOT_SENT' ? 'neutral' : 'info'} /> },
    { id: 'rsvp', header: 'RSVP', enableSorting: false, cell: ({ row: { original: g } }) => <select aria-label={`RSVP for ${g.name}`} className="text-xs rounded-md border border-line bg-white h-7 px-1.5" value={g.rsvp} onChange={(e) => setRsvpFor(g, e.target.value)}>{RSVPS.map((o) => <option key={o} value={o}>{o.charAt(0) + o.slice(1).toLowerCase()}</option>)}</select> },
    { id: 'plusOnes', header: '+Guests', enableSorting: false, cell: ({ row: { original: g } }) => <span className="tabular-nums">{g.plusOnes}</span> },
    { id: 'dietary', header: 'Dietary', enableSorting: false, cell: ({ row: { original: g } }) => <span>{g.dietary ?? '—'}{g.accommodationNeeded && <span className="ml-1 text-[11px] text-info">· stay</span>}</span> },
    { id: 'in', header: 'Check-in', enableSorting: false, cell: ({ row: { original: g } }) => g.checkedIn ? <button className="btn-ghost btn-sm text-success" onClick={() => checkIn(g, true)} title="Undo check-in"><UserCheck className="h-4 w-4" />Checked in ({g.checkedInCount})</button> : <button className="btn-secondary btn-sm" onClick={() => checkIn(g, false)}><UserX className="h-4 w-4 text-ink-soft" />Check in</button> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Expected" value={st?.weddingExpected ?? '—'} hint="contract headcount" />
        <StatCard label="Invited (heads)" value={st?.invitedHeadcount ?? '—'} hint={`${st?.guests ?? 0} invitations`} />
        <StatCard label="Confirmed" value={st?.confirmed ?? '—'} hint={`${st?.declined ?? 0} declined · ${(st?.pending ?? 0) + (st?.maybe ?? 0)} pending`} />
        <StatCard label="Actual attendance" value={st?.actualRecorded ?? st?.checkedIn ?? '—'} hint={`${st?.checkedIn ?? 0} checked in`} />
        <StatCard label="Check-in progress" value={`${st && st.confirmed ? Math.round((st.checkedIn / st.confirmed) * 100) : 0}%`} hint="of confirmed" />
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search guests…" />
          <Select className="w-36" value={rsvp} onChange={(v) => { setRsvp(v); list.setPage(1); }} options={RSVPS} placeholder="Any RSVP" />
          <Select className="w-44" value={group} onChange={(v) => { setGroup(v); list.setPage(1); }} options={(st?.groups ?? []).filter((g) => g.group !== 'Ungrouped').map((g) => ({ v: g.group, l: `${g.group} (${g.count})` }))} placeholder="All groups" />
          <Select className="w-40" value={state} onChange={(v) => { setState(v); list.setPage(1); }} options={[{ v: 'in', l: 'Checked in' }, { v: 'out', l: 'Not checked in' }]} placeholder="Any check-in" />
          <div className="ml-auto flex gap-2"><Can roles={G.PLANNING}><button className="btn-secondary" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />Import CSV</button></Can><button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add guest</button></div>
        </div>
        <DataTable columns={cols} data={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} emptyTitle="No guests found" emptyHint="Register guests one by one or import a CSV." />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      </Card>
      <GuestForm weddingId={weddingId} open={adding} onClose={() => setAdding(false)} onSaved={reload} />
      <ImportModal weddingId={weddingId} open={importing} onClose={() => setImporting(false)} onSaved={reload} />
    </div>
  );
}
