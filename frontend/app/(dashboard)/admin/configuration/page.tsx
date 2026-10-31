'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, Field, PageHeader } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { Load, Toggle, useBusy } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

interface Cfg { currency: string; timezone: string; financialYearStartMonth: number; dateFormat: string; features: Record<string, boolean> }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((l, i) => ({ v: String(i + 1), l }));
const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];
const FEATURES: [string, string, string][] = [
  ['guestManagement', 'Guest management', 'Guest lists, RSVPs and check-in.'], ['payments', 'Payments', 'Client payment milestones and online collection.'],
  ['vendorPortal', 'Vendor portal', 'Lets vendors sign in to see bookings, RFQs and invoices.'], ['mobileAccess', 'Mobile access', 'Mobile-optimised experience for on-site teams.'],
];

export default function ConfigurationPage() {
  const c = useApi<Cfg>('/admin/config');
  const [f, setF] = useState<Cfg | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (c.data) setF(structuredClone(c.data)); }, [c.data]);
  const dirty = !!f && JSON.stringify(f) !== JSON.stringify(c.data);
  const save = () => run('save', async () => { await api.put('/admin/config', { currency: f!.currency, timezone: f!.timezone, financialYearStartMonth: f!.financialYearStartMonth, features: f!.features }); c.reload(); }, 'Configuration saved');
  return (
    <>
      <PageHeader title="System Configuration" subtitle="Regional defaults and feature switches for the whole platform." actions={<button className="btn-primary" disabled={!dirty || !!busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save changes</button>} />
      <Load state={c}>{f && <div className="grid xl:grid-cols-2 gap-5">
        <Card title="Regional">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Currency (ISO code)"><input className="input uppercase" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label="Timezone"><Select value={f.timezone} onChange={(v) => setF({ ...f, timezone: v })} options={ZONES.includes(f.timezone) ? ZONES : [f.timezone, ...ZONES]} /></Field>
            <Field label="Financial year starts in"><Select value={String(f.financialYearStartMonth)} onChange={(v) => setF({ ...f, financialYearStartMonth: Number(v) })} options={MONTHS} /></Field>
          </div>
        </Card>
        <Card title="Feature toggles">
          <ul className="divide-y divide-line">{FEATURES.map(([k, l, h]) => <li key={k} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium text-sm">{l}</p><p className="text-xs text-ink-soft">{h}</p></div><Toggle label={l} checked={!!f.features[k]} onChange={(v) => setF({ ...f, features: { ...f.features, [k]: v } })} /></li>)}</ul>
          <p className="text-xs text-ink-soft mt-3">Toggles are published at <code>/config/public</code> for the apps to read; turning one off hides the matching screens.</p>
        </Card>
      </div>}</Load>
    </>
  );
}
