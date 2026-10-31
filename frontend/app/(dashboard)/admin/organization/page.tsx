'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { Card, Field, PageHeader } from '@/components/ui/primitives';
import { Load, useBusy } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { api, apiUrl } from '@/lib/api';
import { notify } from '@/lib/toast';

interface Org {
  profile: Record<string, string>; business: Record<string, string | number>;
  locations: { id: string; name: string; type: string; address: string; city: string; phone: string }[]; logo: { url: string } | null;
}
const PROFILE: [string, string][] = [['name', 'Company name'], ['legalName', 'Legal name'], ['tagline', 'Tagline'], ['email', 'Email'], ['phone', 'Phone'], ['website', 'Website'], ['gstin', 'GSTIN'], ['pan', 'PAN'], ['address', 'Address'], ['city', 'City'], ['state', 'State'], ['pincode', 'PIN code']];
const BUSINESS: [string, string, 'text' | 'number'][] = [['workingDays', 'Working days', 'text'], ['workingHours', 'Working hours', 'text'], ['invoicePrefix', 'Invoice prefix', 'text'], ['supportEmail', 'Support email', 'text'], ['gstRatePercent', 'Default GST rate (%)', 'number'], ['defaultAdvancePercent', 'Default advance (%)', 'number'], ['paymentTermsDays', 'Payment terms (days)', 'number'], ['quotationValidityDays', 'Quotation validity (days)', 'number']];

export default function OrganizationPage() {
  const o = useApi<Org>('/admin/org');
  const [f, setF] = useState<Org | null>(null);
  const { busy, run } = useBusy();
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (o.data) setF(structuredClone(o.data)); }, [o.data]);
  const save = (part: 'profile' | 'locations' | 'business') => run(part, async () => { await api.put('/admin/org', { [part]: f![part] }); o.reload(); }, 'Saved');
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file0 = e.target.files?.[0]; e.target.value = '';
    if (!file0) return;
    if (file0.size > 2 * 1024 * 1024) return notify.err(new Error('Logo must be under 2 MB'));
    const fd = new FormData(); fd.append('file', file0);
    await run('logo', () => api.upload('/admin/org/logo', fd).then(() => o.reload()), 'Logo updated');
  };
  return (
    <>
      <PageHeader title="Organization Setup" subtitle="Company profile, locations, business defaults and logo." />
      <Load state={o}>{f && <div className="grid xl:grid-cols-2 gap-5">
        <Card title="Logo">
          <div className="flex items-center gap-5">
            <div className="h-24 w-24 rounded-xl border border-line bg-surface-2 grid place-items-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {o.data?.logo ? <img src={apiUrl(o.data.logo.url)} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-ink-soft">No logo</span>}
            </div>
            <div className="space-y-2">
              <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={upload} />
              <button className="btn-secondary btn-sm" disabled={busy === 'logo'} onClick={() => file.current?.click()}>{busy === 'logo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Upload logo</button>
              {o.data?.logo && <button className="btn-ghost btn-sm block" onClick={() => run('logo-del', () => api.del('/admin/org/logo').then(() => o.reload()), 'Logo removed')}>Remove</button>}
              <p className="text-xs text-ink-soft">PNG, JPEG or WebP, up to 2 MB.</p>
            </div>
          </div>
        </Card>
        <Card title="Business settings" action={<button className="btn-primary btn-sm" disabled={!!busy} onClick={() => save('business')}>{busy === 'business' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</button>}>
          <div className="grid sm:grid-cols-2 gap-4">{BUSINESS.map(([k, l, t]) => <Field key={k} label={l}><input className="input" type={t} value={f.business[k] ?? ''} onChange={(e) => setF({ ...f, business: { ...f.business, [k]: t === 'number' ? Number(e.target.value) : e.target.value } })} /></Field>)}</div>
        </Card>
        <Card title="Company profile" className="xl:col-span-2" action={<button className="btn-primary btn-sm" disabled={!!busy} onClick={() => save('profile')}>{busy === 'profile' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</button>}>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{PROFILE.map(([k, l]) => <Field key={k} label={l}><input className="input" value={f.profile[k] ?? ''} onChange={(e) => setF({ ...f, profile: { ...f.profile, [k]: e.target.value } })} /></Field>)}</div>
        </Card>
        <Card title="Locations" className="xl:col-span-2" action={<div className="flex gap-2"><button className="btn-secondary btn-sm" onClick={() => setF({ ...f, locations: [...f.locations, { id: '', name: '', type: 'Office', address: '', city: '', phone: '' }] })}><Plus className="h-3.5 w-3.5" />Add</button><button className="btn-primary btn-sm" disabled={!!busy} onClick={() => save('locations')}>{busy === 'locations' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</button></div>}>
          {f.locations.length === 0 ? <p className="text-sm text-ink-soft">No locations yet.</p> : <div className="space-y-3">{f.locations.map((l, i) => (
            <div key={i} className="grid sm:grid-cols-[1fr_120px_1fr_140px_140px_auto] gap-3 items-end">
              {(['name', 'type', 'address', 'city', 'phone'] as const).map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><input className="input" value={l[k]} onChange={(e) => setF({ ...f, locations: f.locations.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x) })} /></Field>)}
              <button className="btn-ghost btn-sm !px-2 mb-1" aria-label="Remove location" onClick={() => setF({ ...f, locations: f.locations.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
            </div>))}</div>}
        </Card>
      </div>}</Load>
    </>
  );
}
