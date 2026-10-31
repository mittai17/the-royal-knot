'use client';
import { useState } from 'react';
import { BedDouble, Bus, ClipboardCheck, MapPin, Phone } from 'lucide-react';
import { Card, EmptyState, ProgressBar, StatCard, StatusBadge } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { cn, fmtDate, fmtDateTime } from '@/lib/utils';
import { Async } from './shared';
import type { Allocation, Checklist, GuestTransportRow, Trip } from './types';

interface AccData { summary: { allocations: number; rooms: number; guestsAssigned: number; checkedIn: number; guestsNeedingRooms: number }; hotels: { id: string; name: string; city: string | null; address: string | null; phone: string | null; rooms: number; guests: number }[]; allocations: Allocation[] }

export function ClientAccommodation() {
  const { data, loading, error, reload } = useApi<AccData>('/portal/client/accommodation');
  return (
    <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Guests with rooms" value={`${data.summary.guestsAssigned}/${data.summary.guestsNeedingRooms}`} icon={<BedDouble className="h-5 w-5" />} />
            <StatCard label="Rooms" value={data.summary.rooms} />
            <StatCard label="Hotels" value={data.hotels.length} />
            <StatCard label="Checked in" value={data.summary.checkedIn} />
          </div>
          {data.allocations.length === 0 ? <Card><EmptyState title="No rooms allocated yet" hint="Your planner will share hotel and room details here once they are confirmed." /></Card> : (
            <>
              <div className="grid md:grid-cols-2 gap-4">{data.hotels.map((h) => (
                <Card key={h.id} title={h.name}><p className="text-sm text-ink-soft flex items-start gap-1.5"><MapPin className="h-4 w-4 shrink-0 mt-0.5" />{[h.address, h.city].filter(Boolean).join(', ') || 'Address to be confirmed'}</p>{h.phone && <a href={`tel:${h.phone.replace(/\s/g, '')}`} className="text-sm text-burgundy hover:underline inline-flex items-center gap-1.5 mt-1.5"><Phone className="h-4 w-4" />{h.phone}</a>}<p className="text-xs text-ink-soft mt-2">{h.rooms} rooms · {h.guests} guests</p></Card>
              ))}</div>
              <Card title="Room assignments" pad={false}>
                <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse dt"><thead><tr><th className="th">Guest</th><th className="th">Hotel</th><th className="th">Room</th><th className="th">Check-in</th><th className="th">Check-out</th><th className="th">Status</th></tr></thead>
                  <tbody>{data.allocations.map((a) => <tr key={a.id}><td className="td"><p className="font-medium">{a.guest?.name ?? 'Room block'}</p><p className="text-xs text-ink-soft">{a.guest?.groupName ?? ''}</p></td><td className="td">{a.room.hotel.name}</td><td className="td">{a.room.number} · {a.room.type}</td><td className="td whitespace-nowrap">{fmtDate(a.checkIn)}</td><td className="td whitespace-nowrap">{fmtDate(a.checkOut)}</td><td className="td"><StatusBadge status={a.status} /></td></tr>)}</tbody></table></div>
              </Card>
            </>
          )}
        </div>
      )}
    </Async>
  );
}

interface TrData { summary: { trips: number; upcomingTrips: number; pickups: number; drops: number; pending: number }; trips: Omit<Trip, 'seatsUsed' | 'wedding' | 'weddingId'>[]; guests: GuestTransportRow[] }

export function ClientTransport() {
  const { data, loading, error, reload } = useApi<TrData>('/portal/client/transport');
  return (
    <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Upcoming trips" value={data.summary.upcomingTrips} icon={<Bus className="h-5 w-5" />} />
            <StatCard label="Pickups" value={data.summary.pickups} />
            <StatCard label="Drops" value={data.summary.drops} />
            <StatCard label="Awaiting a vehicle" value={data.summary.pending} />
          </div>
          <Card title="Guest pickups and drops" pad={false}>
            {data.guests.length === 0 ? <EmptyState title="No transfers yet" hint="Airport and station pickups for your guests will appear here." /> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse dt"><thead><tr><th className="th">Guest</th><th className="th">Type</th><th className="th">Arrival / departure</th><th className="th">Vehicle</th><th className="th">Driver</th><th className="th">Status</th></tr></thead>
                <tbody>{data.guests.map((g) => <tr key={g.id}><td className="td"><p className="font-medium">{g.guest.name}</p><p className="text-xs text-ink-soft">{g.passengers} pax</p></td><td className="td">{g.kind === 'DROP' ? 'Drop' : 'Pickup'}</td><td className="td"><p className="whitespace-nowrap">{g.arrivalAt ? fmtDateTime(g.arrivalAt) : '—'}</p><p className="text-xs text-ink-soft">{g.flightOrTrain ?? ''}</p></td><td className="td">{g.trip?.vehicle ? `${g.trip.vehicle.plate} · ${g.trip.vehicle.type}` : <span className="text-ink-soft">To be assigned</span>}</td><td className="td">{g.trip?.driver ? <><p>{g.trip.driver.name}</p><a className="text-xs text-burgundy hover:underline" href={`tel:${g.trip.driver.phone.replace(/\s/g, '')}`}>{g.trip.driver.phone}</a></> : '—'}</td><td className="td"><StatusBadge status={g.status} /></td></tr>)}</tbody></table></div>
            )}
          </Card>
          {data.trips.length > 0 && <Card title="Scheduled trips"><ul className="divide-y divide-line">{data.trips.map((t) => <li key={t.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1"><div className="min-w-[12rem] flex-1"><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-ink-soft">{t.origin} → {t.destination}</p></div><span className="text-sm whitespace-nowrap">{fmtDateTime(t.scheduledAt)}</span><StatusBadge status={t.status} /></li>)}</ul></Card>}
        </div>
      )}
    </Async>
  );
}

interface ClData { summary: { total: number; done: number; pct: number }; checklists: Checklist[] }

export function ClientChecklists() {
  const { data, loading, error, reload } = useApi<ClData>('/portal/client/checklists');
  const [busy, setBusy] = useState<string | null>(null);
  const tick = async (id: string, done: boolean) => {
    setBusy(id);
    try { await api.patch(`/portal/client/checklists/items/${id}`, { done }); await reload(); } catch (e) { notify.err(e); } finally { setBusy(null); }
  };
  return (
    <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <div className="space-y-5">
          <Card><div className="flex items-center gap-4"><ClipboardCheck className="h-6 w-6 text-burgundy shrink-0" /><div className="flex-1"><p className="text-sm font-medium">{data.summary.done} of {data.summary.total} items done</p><div className="mt-2"><ProgressBar value={data.summary.pct} /></div></div><span className="num text-2xl">{data.summary.pct}%</span></div></Card>
          {data.checklists.length === 0 ? <Card><EmptyState title="No checklists shared yet" hint="Your planner will share to-dos for you here." /></Card> : data.checklists.map((c) => (
            <Card key={c.id} title={c.name} action={<span className="text-xs text-ink-soft">{c.progress.done}/{c.progress.total}</span>}>
              <ul className="divide-y divide-line/60">{c.items.map((it) => (
                <li key={it.id}><label className="flex items-center gap-3 py-2 cursor-pointer"><input type="checkbox" className="h-4 w-4" checked={it.done} disabled={busy === it.id} onChange={(e) => tick(it.id, e.target.checked)} /><span className={cn('text-sm flex-1', it.done && 'line-through text-ink-soft')}>{it.title}</span>{it.dueDate && <span className="text-xs text-ink-soft">{fmtDate(it.dueDate, 'dd MMM')}</span>}</label></li>
              ))}</ul>
            </Card>
          ))}
        </div>
      )}
    </Async>
  );
}
