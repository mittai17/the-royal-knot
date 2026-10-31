'use client';
import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { Card, Field, PageHeader } from '@/components/ui/primitives';
import { Async } from '@/components/portal/shared';
import { Rating } from '@/components/vendors/rating';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { humanize, inr } from '@/lib/utils';

interface Profile {
  id: string; name: string; businessName?: string | null; category: string; contactName: string; phone: string; email?: string | null; address?: string | null; serviceAreas: string[];
  basePrice?: string | null; priceUnit?: string | null; available: boolean; rating: string; gstin?: string | null; bankDetails?: string | null;
  services: { id: string; name: string; unit: string; price: string }[]; availability: { blockedDates: string[]; notes: string };
}

function Editor({ p, reload }: { p: Profile; reload: () => void }) {
  const [f, setF] = useState({ businessName: '', contactName: '', phone: '', email: '', address: '', serviceAreas: '', basePrice: '', priceUnit: '', gstin: '', bankDetails: '', available: true });
  const [busy, setBusy] = useState('');
  const [svc, setSvc] = useState({ name: '', unit: 'unit', price: '' });
  const [blocked, setBlocked] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  useEffect(() => {
    setF({ businessName: p.businessName ?? '', contactName: p.contactName, phone: p.phone, email: p.email ?? '', address: p.address ?? '', serviceAreas: p.serviceAreas.join(', '), basePrice: p.basePrice ?? '', priceUnit: p.priceUnit ?? '', gstin: p.gstin ?? '', bankDetails: p.bankDetails ?? '', available: p.available });
    setBlocked(p.availability.blockedDates); setNotes(p.availability.notes);
  }, [p]);
  const set = (k: string, v: string | boolean) => setF({ ...f, [k]: v });
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => { setBusy(key); try { await fn(); notify.ok(ok); reload(); } catch (e) { notify.err(e); } finally { setBusy(''); } };

  const saveProfile = () => run('profile', () => api.patch('/portal/vendor/profile', {
    businessName: f.businessName, contactName: f.contactName, phone: f.phone, email: f.email || undefined, address: f.address, available: f.available, priceUnit: f.priceUnit, gstin: f.gstin, bankDetails: f.bankDetails,
    serviceAreas: f.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean), ...(f.basePrice !== '' ? { basePrice: Number(f.basePrice) } : {}),
  }), 'Profile saved');
  const saveAvail = () => run('avail', () => api.put('/portal/vendor/profile/availability', { blockedDates: blocked, notes }), 'Availability saved');
  const addService = () => run('svc', async () => { await api.post('/portal/vendor/profile/services', { name: svc.name.trim(), unit: svc.unit.trim(), price: Number(svc.price) }); setSvc({ name: '', unit: 'unit', price: '' }); }, 'Service added');

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="Company profile" className="lg:col-span-2" action={<span className="inline-flex items-center gap-3 text-xs text-ink-soft">{humanize(p.category)}<Rating value={p.rating} /></span>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Business name"><input className="input" value={f.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
          <Field label="Contact person"><input className="input" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Address" className="md:col-span-2"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Service areas (comma separated)" className="md:col-span-2"><input className="input" value={f.serviceAreas} onChange={(e) => set('serviceAreas', e.target.value)} /></Field>
          <Field label="Starting price (₹)"><input className="input" type="number" min={0} value={f.basePrice} onChange={(e) => set('basePrice', e.target.value)} /></Field>
          <Field label="Price unit"><input className="input" placeholder="plate, day, event…" value={f.priceUnit} onChange={(e) => set('priceUnit', e.target.value)} /></Field>
          <Field label="GSTIN"><input className="input" value={f.gstin} onChange={(e) => set('gstin', e.target.value)} /></Field>
          <Field label="Bank details (for settlements)"><input className="input" value={f.bankDetails} onChange={(e) => set('bankDetails', e.target.value)} /></Field>
          <label className="md:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#401827]" checked={f.available} onChange={(e) => set('available', e.target.checked)} />Currently accepting new bookings</label>
        </div>
        <button className="btn-primary mt-5" disabled={busy === 'profile' || !f.contactName.trim() || !f.phone.trim()} onClick={saveProfile}>{busy === 'profile' && <Loader2 className="h-4 w-4 animate-spin" />}Save profile</button>
        <p className="text-xs text-ink-soft mt-2">Category and rating are managed by The Royal Knot.</p>
      </Card>

      <Card title="Availability">
        <div className="flex gap-2"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date to block" /><button className="btn-secondary" disabled={!date || blocked.includes(date)} onClick={() => { setBlocked([...blocked, date].sort()); setDate(''); }}>Block</button></div>
        <ul className="flex flex-wrap gap-2 mt-3">{blocked.length === 0 ? <li className="text-sm text-ink-soft">No blocked dates.</li> : blocked.map((b) => <li key={b} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs">{b}<button aria-label={`Unblock ${b}`} onClick={() => setBlocked(blocked.filter((x) => x !== b))}><X className="h-3 w-3" /></button></li>)}</ul>
        <Field label="Notes" className="mt-4"><textarea className="input min-h-[70px]" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <button className="btn-primary mt-3" disabled={busy === 'avail'} onClick={saveAvail}>{busy === 'avail' && <Loader2 className="h-4 w-4 animate-spin" />}Save availability</button>
      </Card>

      <Card title="Services & price list" className="lg:col-span-3" pad={false}>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] dt"><thead><tr><th className="th">Service</th><th className="th">Unit</th><th className="th">Price</th><th className="th" /></tr></thead>
          <tbody>
            {p.services.map((s) => <tr key={s.id}><td className="td font-medium">{s.name}</td><td className="td">{s.unit}</td><td className="td num">{inr(s.price)}</td><td className="td text-right"><button className="btn-ghost btn-sm !px-2" aria-label={`Remove ${s.name}`} onClick={() => confirm(`Remove ${s.name}?`) && run('del' + s.id, () => api.del(`/portal/vendor/profile/services/${s.id}`), 'Service removed')}><Trash2 className="h-4 w-4" /></button></td></tr>)}
            {p.services.length === 0 && <tr><td className="td text-ink-soft" colSpan={4}>No services listed yet.</td></tr>}
            <tr><td className="td"><input className="input" placeholder="New service name" value={svc.name} onChange={(e) => setSvc({ ...svc, name: e.target.value })} /></td><td className="td"><input className="input" value={svc.unit} onChange={(e) => setSvc({ ...svc, unit: e.target.value })} /></td><td className="td"><input className="input" type="number" min={0} placeholder="₹" value={svc.price} onChange={(e) => setSvc({ ...svc, price: e.target.value })} /></td><td className="td text-right"><button className="btn-secondary btn-sm" disabled={busy === 'svc' || !svc.name.trim() || svc.price === ''} onClick={addService}><Plus className="h-4 w-4" />Add</button></td></tr>
          </tbody></table></div>
      </Card>
    </div>
  );
}

export default function Page() {
  const q = useApi<Profile>('/portal/vendor/profile');
  return (
    <div>
      <PageHeader title="My Profile & Services" subtitle="What clients and planners see about your business." />
      <Async q={q}>{(p) => <Editor p={p} reload={q.reload} />}</Async>
    </div>
  );
}
