'use client';
import { useCallback, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Bus, Car, Loader2, Pencil, Play, Plus, Route, Square, Trash2, UserRound, XCircle } from 'lucide-react';
import { Card, EmptyState, Field, Modal, StatCard, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Segmented, Select, SearchInput } from '@/components/shared/form-bits';
import { Can } from '@/components/shared/can';
import { asRows, useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { G } from '@/lib/permissions';
import { notify } from '@/lib/toast';
import { useWedding } from '@/lib/wedding-context';
import { fmtDateTime, fmtTime } from '@/lib/utils';
import { LiveWatch } from './live-watch';
import { Async, hhmm, toIso, ymd } from './shared';
import type { Driver, GuestTransportRow, LooseGuest, TransportStats, Trip, Vehicle } from './types';

type Tab = 'trips' | 'guests' | 'vehicles' | 'drivers';
const GT_STATUSES = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'DROPPED', 'CANCELLED'] as const;

function TripForm({ weddingId, trip, vehicles, drivers, onClose, onSaved }: { weddingId: string; trip: Trip | null; vehicles: Vehicle[]; drivers: Driver[]; onClose: () => void; onSaved: () => void }) {
  const { selected } = useWedding();
  const [f, setF] = useState({ title: trip?.title ?? '', origin: trip?.origin ?? '', destination: trip?.destination ?? selected?.venue ?? '', date: ymd(trip?.scheduledAt) || ymd(selected?.startDate), time: hhmm(trip?.scheduledAt) || '09:00', vehicleId: trip?.vehicleId ?? '', driverId: trip?.driverId ?? '', notes: trip?.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { title: f.title, origin: f.origin, destination: f.destination, scheduledAt: toIso(f.date, f.time), vehicleId: f.vehicleId || (trip ? null : undefined), driverId: f.driverId || (trip ? null : undefined), notes: f.notes || undefined };
      if (trip) await api.patch(`/transport/trips/${trip.id}`, body); else await api.post('/transport/trips', { ...body, weddingId });
      notify.ok(trip ? 'Trip updated' : 'Trip scheduled'); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={trip ? 'Edit trip' : 'Schedule trip'} width="max-w-xl" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.title.trim() || !f.origin.trim() || !f.destination.trim() || !f.date} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Title" className="col-span-2"><input className="input" placeholder="Airport pickup – morning batch" value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="From"><input className="input" value={f.origin} onChange={(e) => set('origin', e.target.value)} /></Field>
        <Field label="To"><input className="input" value={f.destination} onChange={(e) => set('destination', e.target.value)} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Departure time"><input className="input" type="time" value={f.time} onChange={(e) => set('time', e.target.value)} /></Field>
        <Field label="Vehicle"><Select value={f.vehicleId} onChange={(v) => set('vehicleId', v)} options={vehicles.filter((v) => v.active).map((v) => ({ v: v.id, l: `${v.plate} · ${v.type} (${v.capacity})` }))} placeholder="Unassigned" /></Field>
        <Field label="Driver"><Select value={f.driverId} onChange={(v) => set('driverId', v)} options={drivers.filter((d) => d.active).map((d) => ({ v: d.id, l: d.name }))} placeholder="Unassigned" /></Field>
        <Field label="Notes" className="col-span-2"><input className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function GuestTransportForm({ weddingId, trips, onClose, onSaved }: { weddingId: string; trips: Trip[]; onClose: () => void; onSaved: () => void }) {
  const guests = useApi<unknown>(`/weddings/${weddingId}/guests`, { pageSize: 500 });
  const rows = asRows<LooseGuest>(guests.data);
  const [f, setF] = useState({ guestId: '', kind: 'PICKUP', flight: '', date: '', time: '', passengers: '1', tripId: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { await api.post('/transport/guest-transport', { guestId: f.guestId, kind: f.kind, flightOrTrain: f.flight || undefined, arrivalAt: f.date ? toIso(f.date, f.time || '00:00') : undefined, passengers: Number(f.passengers) || 1, tripId: f.tripId || undefined, notes: f.notes || undefined }); notify.ok('Transport added'); onSaved(); onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Add pickup / drop" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.guestId} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Guest" className="col-span-2"><Select value={f.guestId} onChange={(v) => { const g = rows.find((x) => x.id === v); setF((p) => ({ ...p, guestId: v, passengers: String(1 + (g?.plusOnes ?? 0)) })); }} options={rows.map((g) => ({ v: g.id, l: `${g.name}${g.groupName ? ` · ${g.groupName}` : ''}` }))} placeholder={guests.loading ? 'Loading guests…' : 'Select guest'} /></Field>
        <Field label="Type"><Select value={f.kind} onChange={(v) => set('kind', v)} options={[{ v: 'PICKUP', l: 'Pickup' }, { v: 'DROP', l: 'Drop' }]} /></Field>
        <Field label="Passengers"><input className="input" type="number" min={1} value={f.passengers} onChange={(e) => set('passengers', e.target.value)} /></Field>
        <Field label="Flight / train"><input className="input" placeholder="AI 611" value={f.flight} onChange={(e) => set('flight', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field><Field label="Time"><input className="input" type="time" value={f.time} onChange={(e) => set('time', e.target.value)} /></Field></div>
        <Field label="Assign to trip" className="col-span-2"><Select value={f.tripId} onChange={(v) => set('tripId', v)} options={trips.filter((t) => t.status === 'SCHEDULED' || t.status === 'IN_PROGRESS').map((t) => ({ v: t.id, l: `${fmtDateTime(t.scheduledAt)} · ${t.title}${t.vehicle ? ` (${t.seatsUsed}/${t.vehicle.capacity})` : ''}` }))} placeholder="Assign later" /></Field>
        <Field label="Notes" className="col-span-2"><input className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function VehicleForm({ v, onClose, onSaved }: { v: Vehicle | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ plate: v?.plate ?? '', type: v?.type ?? 'Sedan', capacity: String(v?.capacity ?? 4), vendorName: v?.vendorName ?? '', active: v?.active ?? true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const body = { plate: f.plate, type: f.type, capacity: Number(f.capacity) || 4, vendorName: f.vendorName || undefined, active: f.active }; if (v) await api.patch(`/transport/vehicles/${v.id}`, body); else await api.post('/transport/vehicles', body); notify.ok('Vehicle saved'); onSaved(); onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={v ? 'Edit vehicle' : 'Add vehicle'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.plate.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Plate number"><input className="input" value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} /></Field>
        <Field label="Type"><input className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /></Field>
        <Field label="Seats"><input className="input" type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
        <Field label="Supplier"><input className="input" value={f.vendorName} onChange={(e) => setF({ ...f, vendorName: e.target.value })} /></Field>
        <label className="col-span-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Available for trips</label>
      </div>
    </Modal>
  );
}

function DriverForm({ d, onClose, onSaved }: { d: Driver | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: d?.name ?? '', phone: d?.phone ?? '', licenseNo: d?.licenseNo ?? '', active: d?.active ?? true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const body = { name: f.name, phone: f.phone, licenseNo: f.licenseNo || undefined, active: f.active }; if (d) await api.patch(`/transport/drivers/${d.id}`, body); else await api.post('/transport/drivers', body); notify.ok('Driver saved'); onSaved(); onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={d ? 'Edit driver' : 'Add driver'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.name.trim() || !f.phone.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Licence no." className="col-span-2"><input className="input" value={f.licenseNo} onChange={(e) => setF({ ...f, licenseNo: e.target.value })} /></Field>
        <label className="col-span-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Available for trips</label>
      </div>
    </Modal>
  );
}

export function TransportPanel() {
  const { selectedId, selected } = useWedding();
  const [tab, setTab] = useState<Tab>('trips');
  const stats = useApi<TransportStats>('/transport/stats', { weddingId: selectedId ?? undefined });
  const trips = useApi<Trip[]>(selectedId ? '/transport/trips' : null, { weddingId: selectedId ?? undefined });
  const gts = useApi<GuestTransportRow[]>(selectedId ? '/transport/guest-transport' : null, { weddingId: selectedId ?? undefined });
  const vehicles = useApi<Vehicle[]>('/transport/vehicles');
  const drivers = useApi<Driver[]>('/transport/drivers');
  const [edit, setEdit] = useState<{ kind: 'trip' | 'gt' | 'vehicle' | 'driver'; item: Trip | Vehicle | Driver | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState('');
  const [gtStatus, setGtStatus] = useState('');
  const [search, setSearch] = useState('');
  const refresh = useCallback(() => { void stats.reload(); void trips.reload(); void gts.reload(); void vehicles.reload(); void drivers.reload(); }, [stats, trips, gts, vehicles, drivers]);

  const tripAct = async (t: Trip, status: string, ok: string) => { setBusy(t.id); try { await api.post(`/transport/trips/${t.id}/status`, { status }); notify.ok(ok); refresh(); } catch (e) { notify.err(e); } finally { setBusy(null); } };
  const del = async (path: string, label: string) => { if (!window.confirm(`Delete ${label}?`)) return; try { await api.del(path); notify.ok('Deleted'); refresh(); } catch (e) { notify.err(e); } };
  const patchGt = async (g: GuestTransportRow, body: Record<string, unknown>) => { setBusy(g.id); try { await api.patch(`/transport/guest-transport/${g.id}`, body); refresh(); } catch (e) { notify.err(e); } finally { setBusy(null); } };

  const tripCols: ColumnDef<Trip, unknown>[] = [
    { id: 'trip', header: 'Trip', cell: ({ row: { original: t } }) => <div className="min-w-0"><p className="font-medium truncate">{t.title}</p><p className="text-xs text-ink-soft truncate">{t.origin} → {t.destination}</p></div> },
    { id: 'when', header: 'Departs', cell: ({ row: { original: t } }) => <span className="whitespace-nowrap">{fmtDateTime(t.scheduledAt)}</span> },
    { id: 'vehicle', header: 'Vehicle', cell: ({ row: { original: t } }) => t.vehicle ? <div><p>{t.vehicle.plate}</p><p className="text-xs text-ink-soft">{t.seatsUsed}/{t.vehicle.capacity} seats</p></div> : <span className="text-ink-soft">Unassigned</span> },
    { id: 'driver', header: 'Driver', cell: ({ row: { original: t } }) => t.driver ? <div><p>{t.driver.name}</p><a className="text-xs text-burgundy hover:underline" href={`tel:${t.driver.phone.replace(/\s/g, '')}`}>{t.driver.phone}</a></div> : <span className="text-ink-soft">Unassigned</span> },
    { id: 'status', header: 'Status', cell: ({ row: { original: t } }) => <StatusBadge status={t.status} /> },
    { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: t } }) => (
      <Can roles={G.EVENT_OPS}><div className="flex justify-end gap-1">
        {t.status === 'SCHEDULED' && <button disabled={busy === t.id} className="btn-secondary btn-sm" onClick={() => tripAct(t, 'IN_PROGRESS', 'Trip started')}><Play className="h-3 w-3" />Start</button>}
        {t.status === 'IN_PROGRESS' && <button disabled={busy === t.id} className="btn-secondary btn-sm" onClick={() => tripAct(t, 'COMPLETED', 'Trip completed')}><Square className="h-3 w-3" />Complete</button>}
        {(t.status === 'SCHEDULED' || t.status === 'IN_PROGRESS') && <button disabled={busy === t.id} className="btn-ghost btn-sm !px-2" aria-label="Cancel trip" title="Cancel trip" onClick={() => tripAct(t, 'CANCELLED', 'Trip cancelled')}><XCircle className="h-4 w-4" /></button>}
        {t.status === 'CANCELLED' && <button disabled={busy === t.id} className="btn-ghost btn-sm" onClick={() => tripAct(t, 'SCHEDULED', 'Trip re-scheduled')}>Reschedule</button>}
        {t.status !== 'COMPLETED' && <button className="btn-ghost btn-sm !px-2" aria-label="Edit trip" onClick={() => setEdit({ kind: 'trip', item: t })}><Pencil className="h-4 w-4" /></button>}
        {t.status !== 'IN_PROGRESS' && <button className="btn-ghost btn-sm !px-2 text-danger" aria-label="Delete trip" onClick={() => del(`/transport/trips/${t.id}`, `trip "${t.title}"`)}><Trash2 className="h-4 w-4" /></button>}
      </div></Can>
    ) },
  ];
  const openTrips = (trips.data ?? []).filter((t) => t.status === 'SCHEDULED' || t.status === 'IN_PROGRESS');
  const gtRows = (gts.data ?? []).filter((g) => (!kind || g.kind === kind) && (!gtStatus || g.status === gtStatus) && (!search || `${g.guest.name} ${g.flightOrTrain ?? ''}`.toLowerCase().includes(search.toLowerCase())));
  const gtCols: ColumnDef<GuestTransportRow, unknown>[] = [
    { id: 'guest', header: 'Guest', cell: ({ row: { original: g } }) => <div className="min-w-0"><p className="font-medium truncate">{g.guest.name}</p><p className="text-xs text-ink-soft">{g.passengers} pax{g.guest.phone ? ` · ${g.guest.phone}` : ''}</p></div> },
    { id: 'kind', header: 'Type', cell: ({ row: { original: g } }) => <span className="text-sm">{g.kind === 'DROP' ? 'Drop' : 'Pickup'}</span> },
    { id: 'when', header: 'Arrival / departure', cell: ({ row: { original: g } }) => <div><p className="whitespace-nowrap">{g.arrivalAt ? fmtDateTime(g.arrivalAt) : '—'}</p><p className="text-xs text-ink-soft">{g.flightOrTrain ?? ''}</p></div> },
    { id: 'trip', header: 'Trip', cell: ({ row: { original: g } }) => (
      <Can roles={G.EVENT_OPS}><Select className="!h-8 !text-xs !w-56" value={g.tripId ?? ''} onChange={(v) => patchGt(g, { tripId: v || null })} options={[...openTrips.map((t) => ({ v: t.id, l: `${fmtTime(t.scheduledAt)} · ${t.title}` })), ...(g.trip && !openTrips.some((t) => t.id === g.tripId) ? [{ v: g.trip.id, l: g.trip.title }] : [])]} placeholder="Unassigned" /></Can>
    ) },
    { id: 'status', header: 'Status', cell: ({ row: { original: g } }) => <StatusBadge status={g.status} /> },
    { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: g } }) => (
      <Can roles={G.EVENT_OPS}><div className="flex justify-end gap-1">
        {g.status === 'ASSIGNED' && g.kind === 'PICKUP' && <button disabled={busy === g.id} className="btn-secondary btn-sm" onClick={() => patchGt(g, { status: 'PICKED_UP' })}>Picked up</button>}
        {(g.status === 'ASSIGNED' || g.status === 'PICKED_UP') && g.kind === 'DROP' && <button disabled={busy === g.id} className="btn-secondary btn-sm" onClick={() => patchGt(g, { status: 'DROPPED' })}>Dropped</button>}
        {g.status === 'PICKED_UP' && g.kind === 'PICKUP' && <button disabled={busy === g.id} className="btn-secondary btn-sm" onClick={() => patchGt(g, { status: 'DROPPED' })}>Dropped</button>}
        {g.status !== 'CANCELLED' && g.status !== 'DROPPED' && <button disabled={busy === g.id} className="btn-ghost btn-sm !px-2" aria-label="Cancel" title="Cancel" onClick={() => patchGt(g, { status: 'CANCELLED', tripId: null })}><XCircle className="h-4 w-4" /></button>}
        <button className="btn-ghost btn-sm !px-2 text-danger" aria-label="Delete" onClick={() => del(`/transport/guest-transport/${g.id}`, `transport for ${g.guest.name}`)}><Trash2 className="h-4 w-4" /></button>
      </div></Can>
    ) },
  ];
  const s = stats.data;
  const needWedding = (tab === 'trips' || tab === 'guests') && !selectedId;
  return (
    <div className="space-y-5">
      {selectedId && <LiveWatch weddingId={selectedId} events={['transport.updated']} onChange={refresh} />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Vehicles" value={s?.vehicles ?? '—'} icon={<Car className="h-5 w-5" />} hint={s ? `${s.drivers} drivers` : undefined} />
        <StatCard label="Trips scheduled" value={s?.trips.scheduled ?? '—'} icon={<Route className="h-5 w-5" />} hint={s ? `${s.trips.inProgress} on the road` : undefined} />
        <StatCard label="Trips completed" value={s?.trips.completed ?? '—'} icon={<Bus className="h-5 w-5" />} />
        <StatCard label="Guests awaiting a trip" value={s?.guests.unassigned ?? '—'} icon={<UserRound className="h-5 w-5" />} hint={s ? `${s.guests.pickedUp} picked up` : undefined} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ v: 'trips', l: 'Trips' }, { v: 'guests', l: 'Guest pickup / drop' }, { v: 'vehicles', l: 'Vehicles' }, { v: 'drivers', l: 'Drivers' }]} />
        <Can roles={G.EVENT_OPS}>
          {tab === 'trips' && <button className="btn-primary" disabled={!selectedId} onClick={() => setEdit({ kind: 'trip', item: null })}><Plus className="h-4 w-4" />Schedule trip</button>}
          {tab === 'guests' && <button className="btn-primary" disabled={!selectedId} onClick={() => setEdit({ kind: 'gt', item: null })}><Plus className="h-4 w-4" />Add pickup / drop</button>}
          {tab === 'vehicles' && <button className="btn-primary" onClick={() => setEdit({ kind: 'vehicle', item: null })}><Plus className="h-4 w-4" />Add vehicle</button>}
          {tab === 'drivers' && <button className="btn-primary" onClick={() => setEdit({ kind: 'driver', item: null })}><Plus className="h-4 w-4" />Add driver</button>}
        </Can>
      </div>

      {needWedding ? <Card><EmptyState title="No wedding selected" hint="Pick a wedding in the top bar to manage its trips and guest transport." /></Card> : (
        <>
          {tab === 'trips' && <Card pad={false}><DataTable columns={tripCols} data={trips.data ?? []} loading={trips.loading && !trips.data} error={trips.error && !trips.data ? trips.error : null} onRetry={trips.reload} emptyTitle="No trips scheduled" emptyHint={`Schedule airport, hotel and venue transfers${selected ? ` for ${selected.name}` : ''}.`} /></Card>}
          {tab === 'guests' && (
            <Card pad={false}>
              <div className="flex flex-wrap items-center gap-2 p-4">
                <SearchInput value={search} onChange={setSearch} placeholder="Search guest or flight…" />
                <Select className="!w-32" value={kind} onChange={setKind} options={[{ v: 'PICKUP', l: 'Pickups' }, { v: 'DROP', l: 'Drops' }]} placeholder="All types" />
                <Select className="!w-36" value={gtStatus} onChange={setGtStatus} options={GT_STATUSES} placeholder="All statuses" />
              </div>
              <DataTable columns={gtCols} data={gtRows} loading={gts.loading && !gts.data} error={gts.error && !gts.data ? gts.error : null} onRetry={gts.reload} emptyTitle="No pickups or drops" emptyHint="Add guests who need airport or station transfers, then assign them to a trip." />
            </Card>
          )}
          {tab === 'vehicles' && (
            <Async loading={vehicles.loading} error={vehicles.error} onRetry={vehicles.reload} hasData={!!vehicles.data}>
              <Card pad={false}><DataTable columns={[
                { id: 'plate', header: 'Vehicle', cell: ({ row: { original: v } }) => <div><p className="font-medium">{v.plate}</p><p className="text-xs text-ink-soft">{v.type}{v.vendorName ? ` · ${v.vendorName}` : ''}</p></div> },
                { id: 'cap', header: 'Seats', cell: ({ row: { original: v } }) => v.capacity },
                { id: 'next', header: 'Next trip', cell: ({ row: { original: v } }) => v.nextTrip ? <span className="text-sm">{fmtDateTime(v.nextTrip.scheduledAt)}<span className="block text-xs text-ink-soft">{v.nextTrip.title}</span></span> : <span className="text-ink-soft">None</span> },
                { id: 'status', header: 'Status', cell: ({ row: { original: v } }) => <StatusBadge status={!v.active ? 'CANCELLED' : v.onTrip ? 'IN_PROGRESS' : 'ACTIVE'} tone={!v.active ? 'neutral' : undefined} /> },
                { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: v } }) => <Can roles={G.EVENT_OPS}><div className="flex justify-end gap-1"><button className="btn-ghost btn-sm !px-2" aria-label={`Edit ${v.plate}`} onClick={() => setEdit({ kind: 'vehicle', item: v })}><Pencil className="h-4 w-4" /></button><button className="btn-ghost btn-sm !px-2 text-danger" aria-label={`Delete ${v.plate}`} onClick={() => del(`/transport/vehicles/${v.id}`, `vehicle ${v.plate}`)}><Trash2 className="h-4 w-4" /></button></div></Can> },
              ] as ColumnDef<Vehicle, unknown>[]} data={vehicles.data ?? []} emptyTitle="No vehicles" emptyHint="Add the cars and buses used for guest transfers." /></Card>
            </Async>
          )}
          {tab === 'drivers' && (
            <Async loading={drivers.loading} error={drivers.error} onRetry={drivers.reload} hasData={!!drivers.data}>
              <Card pad={false}><DataTable columns={[
                { id: 'name', header: 'Driver', cell: ({ row: { original: d } }) => <div><p className="font-medium">{d.name}</p><p className="text-xs text-ink-soft">{d.licenseNo ?? 'No licence on file'}</p></div> },
                { id: 'phone', header: 'Phone', cell: ({ row: { original: d } }) => <a className="text-burgundy hover:underline" href={`tel:${d.phone.replace(/\s/g, '')}`}>{d.phone}</a> },
                { id: 'trips', header: 'Upcoming trips', cell: ({ row: { original: d } }) => d.upcomingTrips },
                { id: 'status', header: 'Status', cell: ({ row: { original: d } }) => <StatusBadge status={!d.active ? 'CANCELLED' : d.onTrip ? 'IN_PROGRESS' : 'ACTIVE'} tone={!d.active ? 'neutral' : undefined} /> },
                { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: d } }) => <Can roles={G.EVENT_OPS}><div className="flex justify-end gap-1"><button className="btn-ghost btn-sm !px-2" aria-label={`Edit ${d.name}`} onClick={() => setEdit({ kind: 'driver', item: d })}><Pencil className="h-4 w-4" /></button><button className="btn-ghost btn-sm !px-2 text-danger" aria-label={`Delete ${d.name}`} onClick={() => del(`/transport/drivers/${d.id}`, `driver ${d.name}`)}><Trash2 className="h-4 w-4" /></button></div></Can> },
              ] as ColumnDef<Driver, unknown>[]} data={drivers.data ?? []} emptyTitle="No drivers" emptyHint="Add drivers to assign them to trips." /></Card>
            </Async>
          )}
        </>
      )}

      {edit?.kind === 'trip' && selectedId && <TripForm weddingId={selectedId} trip={edit.item as Trip | null} vehicles={vehicles.data ?? []} drivers={drivers.data ?? []} onClose={() => setEdit(null)} onSaved={refresh} />}
      {edit?.kind === 'gt' && selectedId && <GuestTransportForm weddingId={selectedId} trips={trips.data ?? []} onClose={() => setEdit(null)} onSaved={refresh} />}
      {edit?.kind === 'vehicle' && <VehicleForm v={edit.item as Vehicle | null} onClose={() => setEdit(null)} onSaved={refresh} />}
      {edit?.kind === 'driver' && <DriverForm d={edit.item as Driver | null} onClose={() => setEdit(null)} onSaved={refresh} />}
    </div>
  );
}
