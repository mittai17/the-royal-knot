'use client';
import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { BedDouble, Building2, DoorOpen, Loader2, LogIn, LogOut, Plus, Trash2, UserX, Users } from 'lucide-react';
import { Card, EmptyState, Field, Modal, ProgressBar, StatCard, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Segmented, Select, SearchInput } from '@/components/shared/form-bits';
import { Can } from '@/components/shared/can';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { G } from '@/lib/permissions';
import { notify } from '@/lib/toast';
import { useWedding } from '@/lib/wedding-context';
import { cn, fmtDate, inr } from '@/lib/utils';
import { LiveWatch } from './live-watch';
import { Async, toIso, ymd } from './shared';
import type { AccommodationStats, Allocation, Hotel, LooseGuest, RoomRow } from './types';

type Tab = 'allocations' | 'hotels';

function HotelForm({ hotel, onClose, onSaved }: { hotel: Hotel | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: hotel?.name ?? '', city: hotel?.city ?? '', address: hotel?.address ?? '', phone: hotel?.phone ?? '', starRating: String(hotel?.starRating ?? '') });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name, city: f.city || undefined, address: f.address || undefined, phone: f.phone || undefined, starRating: f.starRating ? Number(f.starRating) : undefined };
      if (hotel) await api.patch(`/accommodation/hotels/${hotel.id}`, body); else await api.post('/accommodation/hotels', body);
      notify.ok(hotel ? 'Hotel updated' : 'Hotel added'); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={hotel ? 'Edit hotel' : 'Add hotel'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.name.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Hotel name" className="col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="City"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="Star rating"><input className="input" type="number" min={1} max={7} value={f.starRating} onChange={(e) => setF({ ...f, starRating: e.target.value })} /></Field>
        <Field label="Address" className="col-span-2"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Phone" className="col-span-2"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function AddRooms({ hotel, onClose, onSaved }: { hotel: Hotel; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ prefix: '', from: '101', to: '110', type: 'Deluxe', capacity: '2', rate: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ created: number; skipped: number }>(`/accommodation/hotels/${hotel.id}/rooms/bulk`, { prefix: f.prefix || undefined, from: Number(f.from), to: Number(f.to), type: f.type || undefined, capacity: Number(f.capacity) || 2, rate: f.rate ? Number(f.rate) : undefined });
      notify.ok(`${r.data.created} rooms added${r.data.skipped ? `, ${r.data.skipped} already existed` : ''}`); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  const count = Math.max(0, Number(f.to) - Number(f.from) + 1);
  return (
    <Modal open onClose={onClose} title={`Add rooms · ${hotel.name}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || count < 1 || count > 200} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add {count || ''} rooms</button></>}>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Prefix (optional)"><input className="input" placeholder="e.g. A" value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} /></Field>
        <Field label="From number"><input className="input" type="number" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To number"><input className="input" type="number" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Room type"><input className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /></Field>
        <Field label="Beds / capacity"><input className="input" type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
        <Field label="Rate per night"><input className="input" type="number" min={0} value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function AllocateForm({ weddingId, hotels, onClose, onSaved }: { weddingId: string; hotels: Hotel[]; onClose: () => void; onSaved: () => void }) {
  const { selected } = useWedding();
  const guests = useApi<LooseGuest[]>(`/accommodation/weddings/${weddingId}/unallocated-guests`);
  const [hotelId, setHotelId] = useState(hotels[0]?.id ?? '');
  const [checkIn, setCheckIn] = useState(ymd(selected?.startDate));
  const [checkOut, setCheckOut] = useState(ymd(selected?.endDate));
  const [roomId, setRoomId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [needOnly, setNeedOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const validDates = !!checkIn && !!checkOut && checkOut > checkIn;
  const rooms = useApi<RoomRow[]>(hotelId && validDates ? `/accommodation/hotels/${hotelId}/rooms` : null, { from: validDates ? toIso(checkIn, '12:00') : undefined, to: validDates ? toIso(checkOut, '11:00') : undefined });
  const room = rooms.data?.find((r) => r.id === roomId);
  const list = (guests.data ?? []).filter((g) => (!needOnly || g.accommodationNeeded) && (!q || `${g.name} ${g.groupName ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const groups = useMemo(() => { const m = new Map<string, LooseGuest[]>(); list.forEach((g) => { const k = g.groupName ?? 'No group'; m.set(k, [...(m.get(k) ?? []), g]); }); return [...m.entries()]; }, [list]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const over = room ? picked.length > room.free : false;
  const save = async () => {
    setBusy(true);
    try { await api.post('/accommodation/allocations', { weddingId, roomId, guestIds: picked, checkIn: toIso(checkIn, '12:00'), checkOut: toIso(checkOut, '11:00') }); notify.ok(`${picked.length} guest${picked.length === 1 ? '' : 's'} allocated`); onSaved(); onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Allocate room" width="max-w-3xl" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !roomId || !picked.length || over || !validDates} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Allocate {picked.length || ''}</button></>}>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3"><Field label="Check-in"><input className="input" type="date" value={checkIn} onChange={(e) => { setCheckIn(e.target.value); setRoomId(''); }} /></Field><Field label="Check-out" error={checkOut && checkOut <= checkIn ? 'After check-in' : undefined}><input className="input" type="date" value={checkOut} onChange={(e) => { setCheckOut(e.target.value); setRoomId(''); }} /></Field></div>
          <Field label="Hotel"><Select value={hotelId} onChange={(v) => { setHotelId(v); setRoomId(''); }} options={hotels.filter((h) => h.active).map((h) => ({ v: h.id, l: h.name }))} placeholder="Select hotel" /></Field>
          <div>
            <p className="label">Room</p>
            {!validDates ? <p className="text-sm text-ink-soft">Choose valid dates first.</p> : rooms.loading ? <p className="text-sm text-ink-soft">Loading rooms…</p> : !(rooms.data ?? []).length ? <p className="text-sm text-ink-soft">This hotel has no rooms yet.</p> : (
              <ul className="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto">{rooms.data!.filter((r) => r.active).map((r) => (
                <li key={r.id}><button type="button" disabled={r.free === 0} onClick={() => setRoomId(r.id)} className={cn('w-full rounded-lg border px-2 py-1.5 text-left text-xs transition-colors', roomId === r.id ? 'border-burgundy bg-[#F1E6EA]' : 'border-line hover:bg-surface-2/60', r.free === 0 && 'opacity-40 cursor-not-allowed')}><b>{r.number}</b><span className="block text-ink-soft">{r.free}/{r.capacity} free</span></button></li>
              ))}</ul>
            )}
            {over && <p className="text-xs text-danger mt-2">Room {room?.number} has only {room?.free} free bed(s).</p>}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2"><p className="label !mb-0">Guests ({picked.length} selected)</p><label className="text-xs inline-flex items-center gap-1.5"><input type="checkbox" checked={needOnly} onChange={(e) => setNeedOnly(e.target.checked)} />Needs accommodation</label></div>
          <SearchInput value={q} onChange={setQ} placeholder="Search guest or family…" />
          <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line">
            {guests.loading ? <p className="p-3 text-sm text-ink-soft">Loading guests…</p> : groups.length === 0 ? <p className="p-3 text-sm text-ink-soft">No unallocated guests match.</p> : groups.map(([g, rows]) => (
              <div key={g}>
                <div className="flex items-center justify-between bg-surface-2/60 px-3 py-1.5 text-xs font-medium"><span>{g} ({rows.length})</span><button type="button" className="text-burgundy hover:underline" onClick={() => setPicked((p) => [...new Set([...p, ...rows.map((r) => r.id)])])}>Select all</button></div>
                {rows.map((r) => <label key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-surface-2/40"><input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} /><span className="truncate">{r.name}</span>{r.plusOnes > 0 && <span className="text-xs text-ink-soft ml-auto">+{r.plusOnes}</span>}</label>)}
              </div>
            ))}
          </div>
          {picked.length > 0 && <button type="button" className="text-xs text-ink-soft hover:underline mt-1.5" onClick={() => setPicked([])}>Clear selection</button>}
        </div>
      </div>
    </Modal>
  );
}

function HotelsTab({ hotels, reload }: { hotels: Hotel[]; reload: () => void }) {
  const [edit, setEdit] = useState<Hotel | 'new' | null>(null);
  const [addRooms, setAddRooms] = useState<Hotel | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const rooms = useApi<RoomRow[]>(open ? `/accommodation/hotels/${open}/rooms` : null);
  const del = async (h: Hotel) => {
    if (!window.confirm(`Remove ${h.name}? Hotels with past allocations are deactivated instead.`)) return;
    try { const r = await api.del<{ deactivated: boolean }>(`/accommodation/hotels/${h.id}`); notify.ok(r.data.deactivated ? 'Hotel deactivated' : 'Hotel removed'); reload(); } catch (e) { notify.err(e); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Can roles={G.EVENT_OPS}><button className="btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Add hotel</button></Can></div>
      {hotels.length === 0 ? <Card><EmptyState title="No hotels yet" hint="Add the hotels where guests will stay, then add their rooms." /></Card> : (
        <ul className="grid lg:grid-cols-2 gap-4">{hotels.map((h) => (
          <li key={h.id} className={cn('card p-4 min-w-0', !h.active && 'opacity-60')}>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-gold-soft text-burgundy grid place-items-center shrink-0"><Building2 className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><p className="font-medium truncate">{h.name}{!h.active && <span className="text-xs text-ink-soft"> · inactive</span>}</p><p className="text-xs text-ink-soft truncate">{[h.city, h.starRating ? `${h.starRating}-star` : null, h.phone].filter(Boolean).join(' · ') || 'No details'}</p></div>
              <Can roles={G.EVENT_OPS}><div className="flex gap-1"><button className="btn-ghost btn-sm" onClick={() => setEdit(h)}>Edit</button><button className="btn-ghost btn-sm !px-2 text-danger" aria-label={`Remove ${h.name}`} onClick={() => del(h)}><Trash2 className="h-4 w-4" /></button></div></Can>
            </div>
            <div className="mt-3"><div className="flex justify-between text-xs text-ink-soft mb-1"><span>{h.roomCount} rooms · {h.capacity} beds</span><span>{h.occupied} occupied tonight ({h.occupancyPct}%)</span></div><ProgressBar value={h.occupancyPct} tone={h.occupancyPct > 90 ? 'danger' : h.occupancyPct > 70 ? 'warning' : 'success'} /></div>
            <div className="mt-3 flex gap-2"><button className="btn-secondary btn-sm" onClick={() => setOpen(open === h.id ? null : h.id)}>{open === h.id ? 'Hide rooms' : 'View rooms'}</button><Can roles={G.EVENT_OPS}><button className="btn-secondary btn-sm" onClick={() => setAddRooms(h)}><Plus className="h-3 w-3" />Add rooms</button></Can></div>
            {open === h.id && (rooms.loading ? <p className="text-sm text-ink-soft mt-3">Loading rooms…</p> : rooms.error ? <p className="text-sm text-danger mt-3">{rooms.error}</p> : (
              <ul className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-56 overflow-y-auto">{(rooms.data ?? []).map((r) => (
                <li key={r.id} title={`${r.type} · ${inr(r.rate)}/night${r.allocations.length ? ` · ${r.allocations.map((a) => a.guest?.name).filter(Boolean).join(', ')}` : ''}`} className={cn('rounded-lg border px-2 py-1.5 text-xs', r.occupants === 0 ? 'border-line' : r.free === 0 ? 'border-danger/40 bg-danger-soft/50' : 'border-warning/40 bg-warning-soft/50', !r.active && 'opacity-40')}><b>{r.number}</b><span className="block text-ink-soft">{r.occupants}/{r.capacity} · {r.type}</span></li>
              ))}</ul>
            ))}
          </li>
        ))}</ul>
      )}
      {edit && <HotelForm hotel={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={reload} />}
      {addRooms && <AddRooms hotel={addRooms} onClose={() => setAddRooms(null)} onSaved={() => { reload(); setOpen(addRooms.id); }} />}
    </div>
  );
}

export function AccommodationPanel() {
  const { selectedId, selected, loading: wLoading } = useWedding();
  const [tab, setTab] = useState<Tab>('allocations');
  const hotels = useApi<Hotel[]>('/accommodation/hotels');
  const stats = useApi<AccommodationStats>('/accommodation/stats', { weddingId: selectedId ?? undefined });
  const allocs = useApi<Allocation[]>(selectedId ? '/accommodation/allocations' : null, { weddingId: selectedId ?? undefined });
  const [status, setStatus] = useState('');
  const [hotelFilter, setHotelFilter] = useState('');
  const [search, setSearch] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(() => { void hotels.reload(); void stats.reload(); void allocs.reload(); }, [hotels, stats, allocs]);

  const act = async (a: Allocation, verb: 'checkin' | 'checkout' | 'cancel', ok: string) => {
    setBusy(a.id);
    try { await api.post(`/accommodation/allocations/${a.id}/${verb}`); notify.ok(ok); refresh(); } catch (e) { notify.err(e); } finally { setBusy(null); }
  };
  const remove = async (a: Allocation) => {
    if (!window.confirm(`Remove ${a.guest?.name ?? 'this block'} from room ${a.room.number}?`)) return;
    try { await api.del(`/accommodation/allocations/${a.id}`); notify.ok('Allocation removed'); refresh(); } catch (e) { notify.err(e); }
  };
  const rows = (allocs.data ?? []).filter((a) => (!status || a.status === status) && (!hotelFilter || a.room.hotel.id === hotelFilter) && (!search || `${a.guest?.name ?? ''} ${a.guest?.groupName ?? ''} ${a.room.number}`.toLowerCase().includes(search.toLowerCase())));
  const cols: ColumnDef<Allocation, unknown>[] = [
    { id: 'guest', header: 'Guest', cell: ({ row: { original: a } }) => <div className="min-w-0"><p className="font-medium truncate">{a.guest?.name ?? 'Room block'}</p><p className="text-xs text-ink-soft">{a.guest?.groupName ?? ''}</p></div> },
    { id: 'room', header: 'Hotel · Room', cell: ({ row: { original: a } }) => <div><p>{a.room.hotel.name}</p><p className="text-xs text-ink-soft">Room {a.room.number} · {a.room.type}</p></div> },
    { id: 'in', header: 'Check-in', cell: ({ row: { original: a } }) => <span className="whitespace-nowrap">{fmtDate(a.checkIn, 'dd MMM')}</span> },
    { id: 'out', header: 'Check-out', cell: ({ row: { original: a } }) => <span className="whitespace-nowrap">{fmtDate(a.checkOut, 'dd MMM')}</span> },
    { id: 'status', header: 'Status', cell: ({ row: { original: a } }) => <StatusBadge status={a.status} /> },
    { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: a } }) => (
      <Can roles={G.EVENT_OPS}><div className="flex justify-end gap-1">
        {a.status === 'RESERVED' && <button disabled={busy === a.id} className="btn-secondary btn-sm" onClick={() => act(a, 'checkin', `${a.guest?.name ?? 'Guest'} checked in`)}><LogIn className="h-3 w-3" />Check in</button>}
        {a.status === 'CHECKED_IN' && <button disabled={busy === a.id} className="btn-secondary btn-sm" onClick={() => act(a, 'checkout', `${a.guest?.name ?? 'Guest'} checked out`)}><LogOut className="h-3 w-3" />Check out</button>}
        {(a.status === 'RESERVED' || a.status === 'CHECKED_IN') && <button disabled={busy === a.id} className="btn-ghost btn-sm !px-2" aria-label="Cancel allocation" title="Cancel" onClick={() => act(a, 'cancel', 'Allocation cancelled')}><UserX className="h-4 w-4" /></button>}
        {a.status !== 'CHECKED_IN' && <button className="btn-ghost btn-sm !px-2 text-danger" aria-label="Remove allocation" title="Remove" onClick={() => remove(a)}><Trash2 className="h-4 w-4" /></button>}
      </div></Can>
    ) },
  ];
  const s = stats.data;
  return (
    <div className="space-y-5">
      {selectedId && <LiveWatch weddingId={selectedId} events={['accommodation.updated']} onChange={refresh} />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Rooms" value={s?.rooms ?? '—'} icon={<DoorOpen className="h-5 w-5" />} hint={s ? `${s.capacity} beds` : undefined} />
        <StatCard label="Occupancy tonight" value={s ? `${s.occupancyPct}%` : '—'} icon={<BedDouble className="h-5 w-5" />} hint={s ? `${s.occupiedTonight} guests in-house` : undefined} />
        <StatCard label="Guests with rooms" value={s ? `${s.guestsWithRooms}/${s.guestsNeedingRooms}` : '—'} icon={<Users className="h-5 w-5" />} hint={s && s.guestsWithoutRooms ? `${s.guestsWithoutRooms} still need one` : undefined} />
        <StatCard label="Checked in" value={s?.checkedIn ?? '—'} icon={<LogIn className="h-5 w-5" />} hint={s ? `${s.reserved} reserved` : undefined} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ v: 'allocations', l: 'Room allocations' }, { v: 'hotels', l: 'Hotels & rooms' }]} />
        {tab === 'allocations' && <Can roles={G.EVENT_OPS}><button className="btn-primary" disabled={!selectedId || !(hotels.data ?? []).some((h) => h.roomCount)} title={!(hotels.data ?? []).some((h) => h.roomCount) ? 'Add a hotel with rooms first' : undefined} onClick={() => setAllocating(true)}><Plus className="h-4 w-4" />Allocate room</button></Can>}
      </div>
      {tab === 'hotels' ? (
        <Async loading={hotels.loading} error={hotels.error} onRetry={hotels.reload} hasData={!!hotels.data}><HotelsTab hotels={hotels.data ?? []} reload={refresh} /></Async>
      ) : !selectedId && !wLoading ? <Card><EmptyState title="No wedding selected" hint="Pick a wedding in the top bar to manage its room allocations." /></Card> : (
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-2 p-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Search guest, family or room…" />
            <Select className="!w-40" value={status} onChange={setStatus} options={['RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED']} placeholder="All statuses" />
            <Select className="!w-48" value={hotelFilter} onChange={setHotelFilter} options={(hotels.data ?? []).map((h) => ({ v: h.id, l: h.name }))} placeholder="All hotels" />
            {selected && <span className="text-xs text-ink-soft ml-auto">{selected.name}</span>}
          </div>
          <DataTable columns={cols} data={rows} loading={allocs.loading && !allocs.data} error={allocs.error && !allocs.data ? allocs.error : null} onRetry={allocs.reload} emptyTitle="No rooms allocated" emptyHint="Allocate rooms to guests and families. Guests who need accommodation are listed first." />
        </Card>
      )}
      {allocating && selectedId && <AllocateForm weddingId={selectedId} hotels={hotels.data ?? []} onClose={() => setAllocating(false)} onSaved={refresh} />}
    </div>
  );
}
