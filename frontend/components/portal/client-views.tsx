'use client';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { Card, EmptyState, StatusBadge } from '@/components/ui/primitives';
import { Rating } from '@/components/vendors/rating';
import { fmtDate, fmtTime, humanize, inr } from '@/lib/utils';

export interface ScheduleData {
  wedding: { name: string };
  days: { date: string; events: { id: string; name: string; kind: string; venue?: string | null; expectedGuests: number }[]; items: { id: string; title: string; scheduledAt: string; status: string; eventName: string | null; delayMinutes: number }[] }[];
}

export function ScheduleTimeline({ days }: { days: ScheduleData['days'] }) {
  if (!days.length) return <Card><EmptyState title="No schedule yet" hint="Your planner will publish the itinerary here." /></Card>;
  return (
    <div className="space-y-5">
      {days.map((day, i) => (
        <Card key={day.date} title={<span>Day {i + 1} <span className="text-ink-soft font-sans text-sm ml-2">{fmtDate(day.date + 'T12:00:00', 'EEEE, dd MMMM yyyy')}</span></span>}>
          {day.events.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-gold-soft/50 px-4 py-3 mb-3">
              <p className="font-medium text-burgundy-deep">{e.name}</p>
              {e.venue && <span className="text-xs text-ink-soft inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.venue}</span>}
              <span className="text-xs text-ink-soft ml-auto">{e.expectedGuests} guests expected</span>
            </div>
          ))}
          {day.items.length > 0 && (
            <ol className="relative border-l border-line ml-2 space-y-4 pl-5">
              {day.items.map((it) => (
                <li key={it.id} className="relative">
                  <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-burgundy" />
                  <div className="flex flex-wrap items-center gap-2"><span className="num text-sm inline-flex items-center gap-1"><Clock className="h-3 w-3 text-ink-soft" />{fmtTime(it.scheduledAt)}</span><span className="text-sm font-medium">{it.title}</span><StatusBadge status={it.status} />{it.delayMinutes > 0 && <span className="text-xs text-warning">{it.delayMinutes} min late</span>}</div>
                  {it.eventName && <p className="text-xs text-ink-soft mt-0.5">{it.eventName}</p>}
                </li>
              ))}
            </ol>
          )}
          {day.events.length === 0 && day.items.length === 0 && <p className="text-sm text-ink-soft">Nothing scheduled.</p>}
        </Card>
      ))}
    </div>
  );
}

export interface VendorRow {
  id: string; category: string; amount: string; notes?: string | null; menu?: string | null;
  vendor: { id: string; name: string; businessName?: string | null; contactName: string; phone: string; email?: string | null; rating: string };
  arrival?: { status: string; expectedAt: string } | null; services: { name: string; description?: string | null; quantity: string; unit: string }[];
}

export function VendorCards({ vendors }: { vendors: VendorRow[] }) {
  if (!vendors.length) return <Card><EmptyState title="No vendors booked yet" hint="Vendors appear here once your planner confirms them." /></Card>;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {vendors.map((v) => (
        <Card key={v.id} title={<span>{v.vendor.name}</span>} action={<span className="text-xs rounded-full bg-gold-soft px-2.5 py-0.5 text-[#8A6B2E]">{humanize(v.category)}</span>}>
          <div className="flex items-center justify-between text-sm"><span className="text-ink-soft">{v.vendor.businessName ?? v.vendor.contactName}</span><Rating value={v.vendor.rating} /></div>
          {v.menu && <p className="text-sm mt-3">{v.menu}</p>}
          {v.services.length > 0 && <ul className="mt-3 space-y-1 text-sm">{v.services.slice(0, 6).map((s) => <li key={s.name} className="flex justify-between gap-3"><span className="truncate">{s.name}</span><span className="text-ink-soft shrink-0">{Number(s.quantity)} {s.unit}</span></li>)}</ul>}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-line">
            <div className="text-xs text-ink-soft">Package value <span className="num text-sm text-ink">{inr(v.amount)}</span></div>
            {v.arrival && <StatusBadge status={v.arrival.status} />}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <a className="btn-secondary btn-sm" href={`tel:${v.vendor.phone.replace(/\s/g, '')}`}><Phone className="h-3.5 w-3.5" />{v.vendor.phone}</a>
            {v.vendor.email && <a className="btn-secondary btn-sm" href={`mailto:${v.vendor.email}`}><Mail className="h-3.5 w-3.5" />Email</a>}
          </div>
        </Card>
      ))}
    </div>
  );
}
