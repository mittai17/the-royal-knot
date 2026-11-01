'use client';
import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Card, EmptyState, Field } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { MasterList } from '@/components/admin/master-list';
import { Load, Toggle, useBusy } from '@/components/admin/kit';
import { AgreementTemplates, TaskTemplates } from './account';

/** Business Settings tabs (Module 32). Each one is backed by /settings/* (SystemSetting), /admin/master-data lists or /task-templates. Founder only. */
export const BUSINESS_TABS = [
  { v: 'company', l: 'Company Profile' }, { v: 'packages', l: 'Wedding Packages' }, { v: 'services', l: 'Service Catalogue' }, { v: 'pricing', l: 'Pricing Defaults' },
  { v: 'milestones', l: 'Payment Milestones' }, { v: 'thresholds', l: 'Approval Thresholds' }, { v: 'task-templates', l: 'Task Templates' }, { v: 'wedding-templates', l: 'Wedding Templates' },
  { v: 'vendor-categories', l: 'Vendor Categories' }, { v: 'locations', l: 'Business Locations' }, { v: 'notifications', l: 'Notification Policies' },
] as const;
export type BusinessTab = (typeof BUSINESS_TABS)[number]['v'];

function SaveButton({ busy, disabled, onClick, children = 'Save' }: { busy: boolean; disabled?: boolean; onClick: () => void; children?: string }) {
  return <button className="btn-primary mt-5" disabled={busy || disabled} onClick={onClick}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{children}</button>;
}

function CompanyProfile() {
  const o = useApi<Record<string, string>>('/settings/company-profile');
  const [f, setF] = useState<Record<string, string> | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (o.data) setF({ ...o.data }); }, [o.data]);
  const KEYS: [string, string][] = [['name', 'Company name'], ['legalName', 'Legal name'], ['tagline', 'Tagline'], ['email', 'Email'], ['phone', 'Phone'], ['website', 'Website'], ['gstin', 'GSTIN'], ['pan', 'PAN'], ['address', 'Address'], ['city', 'City'], ['state', 'State'], ['pincode', 'Pincode']];
  return (
    <Card title="Company profile" className="max-w-3xl">
      <Load state={o}>{f && <><div className="grid sm:grid-cols-2 gap-4">{KEYS.map(([k, l]) => <Field key={k} label={l}><input className="input" value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}</div>
        <SaveButton busy={!!busy} onClick={() => run('s', async () => { await api.put('/settings/company-profile', f); o.reload(); }, 'Company profile saved')} /></>}</Load>
    </Card>
  );
}

function PricingDefaults() {
  const o = useApi<Record<string, string | number>>('/settings/pricing-defaults');
  const [f, setF] = useState<Record<string, string | number> | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (o.data) setF({ ...o.data }); }, [o.data]);
  const FIELDS: [string, string, 'number' | 'text'][] = [['gstRatePercent', 'GST rate (%)', 'number'], ['quotationValidityDays', 'Quotation validity (days)', 'number'], ['paymentTermsDays', 'Payment terms (days)', 'number'], ['invoicePrefix', 'Invoice number prefix', 'text'], ['workingDays', 'Working days', 'text'], ['workingHours', 'Working hours', 'text'], ['supportEmail', 'Support email', 'text']];
  return (
    <Card title="Pricing defaults" className="max-w-3xl">
      <p className="text-sm text-ink-soft mb-4">Defaults applied to new quotations, proposals and invoices. Individual contracts can override them.</p>
      <Load state={o}>{f && <><div className="grid sm:grid-cols-2 gap-4">{FIELDS.map(([k, l, t]) => <Field key={k} label={l}><input className="input" type={t} min={t === 'number' ? 0 : undefined} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: t === 'number' ? Number(e.target.value) : e.target.value })} /></Field>)}</div>
        <SaveButton busy={!!busy} onClick={() => run('s', async () => { await api.put('/settings/pricing-defaults', f); o.reload(); }, 'Pricing defaults saved')} /></>}</Load>
    </Card>
  );
}

function ApprovalThresholds() {
  const l = useApi<Record<string, number>>('/settings/approval-limits');
  const [f, setF] = useState<Record<string, number> | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (l.data) setF({ ...l.data }); }, [l.data]);
  const LABELS: [string, string][] = [['vendorPayment', 'Vendor payment'], ['extraExpense', 'Extra expense'], ['clientDiscount', 'Client discount'], ['vendorContract', 'Vendor contract']];
  return (
    <Card title="Approval thresholds (INR)" className="max-w-2xl">
      <p className="text-sm text-ink-soft mb-4">Amounts above these thresholds need Founder approval. The requester can never approve their own request.</p>
      <Load state={l}>{f && <><div className="grid sm:grid-cols-2 gap-4">{LABELS.map(([k, label]) => <Field key={k} label={label}><input className="input" type="number" min={0} value={f[k] ?? 0} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} /></Field>)}</div>
        <SaveButton busy={!!busy} disabled={JSON.stringify(f) === JSON.stringify(l.data)} onClick={() => run('s', async () => { await api.put('/settings/approval-limits', f); l.reload(); }, 'Approval thresholds saved')}>Save thresholds</SaveButton></>}</Load>
    </Card>
  );
}

interface Milestone { type: string; label: string; percent: number; dueRule?: string }
function PaymentMilestones() {
  const l = useApi<Milestone[]>('/settings/payment-milestones');
  const [f, setF] = useState<Milestone[] | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (l.data) setF(l.data.map((m) => ({ ...m }))); }, [l.data]);
  const total = (f ?? []).reduce((a, m) => a + (Number(m.percent) || 0), 0);
  const ok = Math.round(total * 100) === 10000;
  return (
    <Card title="Payment milestone template" className="max-w-2xl">
      <p className="text-sm text-ink-soft mb-4">The starting split for new contracts. Milestone shares are configured per contract and can be changed there; nothing here is fixed.</p>
      <Load state={l}>{f && <><div className="space-y-3">{f.map((m, i) => <div key={m.type} className="grid grid-cols-[1fr_1fr_110px] gap-3 items-end">
        <Field label="Milestone"><input className="input" value={m.label} onChange={(e) => setF(f.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></Field>
        <Field label="Due rule"><input className="input" value={m.dueRule ?? ''} onChange={(e) => setF(f.map((x, j) => j === i ? { ...x, dueRule: e.target.value } : x))} /></Field>
        <Field label="Share (%)"><input className="input" type="number" min={0} max={100} value={m.percent} onChange={(e) => setF(f.map((x, j) => j === i ? { ...x, percent: Number(e.target.value) } : x))} /></Field></div>)}</div>
        <p className={`text-sm mt-3 ${ok ? 'text-success' : 'text-danger'}`}>Total {total}{ok ? '' : ' (shares must add up to the full contract value)'}</p>
        <SaveButton busy={!!busy} disabled={!ok} onClick={() => run('s', async () => { await api.put('/settings/payment-milestones', { milestones: f }); l.reload(); }, 'Milestone template saved')}>Save template</SaveButton></>}</Load>
    </Card>
  );
}

interface Loc { id?: string; name: string; type: string; address: string; city: string; phone: string }
function BusinessLocations() {
  const l = useApi<Loc[]>('/settings/business-locations');
  const [rows, setRows] = useState<Loc[] | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (l.data) setRows(l.data.map((x) => ({ ...x }))); }, [l.data]);
  const set = (i: number, k: keyof Loc, v: string) => setRows((r) => (r ?? []).map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Card title="Business locations" className="max-w-4xl">
      <Load state={l}>{rows && <>
        {rows.length === 0 && <EmptyState title="No locations yet" hint="Add offices, warehouses or regional bases." />}
        <div className="space-y-3">{rows.map((r, i) => (
          <div key={r.id ?? i} className="grid sm:grid-cols-[1.2fr_1fr_1.6fr_1fr_1fr_auto] gap-2 items-end">
            <Field label="Name"><input className="input" value={r.name} onChange={(e) => set(i, 'name', e.target.value)} /></Field>
            <Field label="Type"><input className="input" value={r.type} onChange={(e) => set(i, 'type', e.target.value)} /></Field>
            <Field label="Address"><input className="input" value={r.address} onChange={(e) => set(i, 'address', e.target.value)} /></Field>
            <Field label="City"><input className="input" value={r.city} onChange={(e) => set(i, 'city', e.target.value)} /></Field>
            <Field label="Phone"><input className="input" value={r.phone} onChange={(e) => set(i, 'phone', e.target.value)} /></Field>
            <button className="btn-ghost !px-2" aria-label="Remove location" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
          </div>))}</div>
        <div className="flex gap-2 mt-4"><button className="btn-secondary" onClick={() => setRows([...rows, { name: '', type: 'Office', address: '', city: '', phone: '' }])}><Plus className="h-4 w-4" />Add location</button></div>
        <SaveButton busy={!!busy} disabled={rows.some((r) => !r.name.trim())} onClick={() => run('s', async () => { await api.put('/settings/business-locations', { locations: rows }); l.reload(); }, 'Locations saved')} /></>}</Load>
    </Card>
  );
}

interface WTpl { id?: string; name: string; packageType: string; description: string; functions: string[] }
function WeddingTemplates() {
  const l = useApi<WTpl[]>('/settings/wedding-templates');
  const [rows, setRows] = useState<WTpl[] | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (l.data) setRows(l.data.map((x) => ({ ...x, functions: [...(x.functions ?? [])] }))); }, [l.data]);
  const set = (i: number, patch: Partial<WTpl>) => setRows((r) => (r ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="grid xl:grid-cols-2 gap-5">
      <Card title="Wedding templates">
        <p className="text-sm text-ink-soft mb-4">Reusable starting points for a new wedding workspace: package type and the event functions it normally includes.</p>
        <Load state={l}>{rows && <>
          {rows.length === 0 && <EmptyState title="No wedding templates yet" />}
          <div className="space-y-4">{rows.map((r, i) => (
            <div key={r.id ?? i} className="border border-line rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-[1fr_170px_auto] gap-2 items-end">
                <Field label="Name"><input className="input" value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></Field>
                <Field label="Package"><select className="input" value={r.packageType} onChange={(e) => set(i, { packageType: e.target.value })}><option value="FULL_SERVICE">Full-Service</option><option value="PARTIAL">Partial / Day-of</option></select></Field>
                <button className="btn-ghost !px-2" aria-label="Remove template" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
              </div>
              <Field label="Description"><input className="input" value={r.description} onChange={(e) => set(i, { description: e.target.value })} /></Field>
              <Field label="Event functions (comma separated)"><input className="input" value={r.functions.join(', ')} onChange={(e) => set(i, { functions: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
            </div>))}</div>
          <button className="btn-secondary mt-4" onClick={() => setRows([...rows, { name: '', packageType: 'FULL_SERVICE', description: '', functions: [] }])}><Plus className="h-4 w-4" />Add template</button>
          <SaveButton busy={!!busy} disabled={rows.some((r) => !r.name.trim())} onClick={() => run('s', async () => { await api.put('/settings/wedding-templates', { templates: rows }); l.reload(); }, 'Wedding templates saved')} /></>}</Load>
      </Card>
      <AgreementTemplates />
    </div>
  );
}

interface Policy { key: string; label: string; enabled: boolean; inApp: boolean; email: boolean; reminderDays: number | null }
function NotificationPolicies() {
  const l = useApi<Policy[]>('/settings/notification-policies');
  const [rows, setRows] = useState<Policy[] | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { if (l.data) setRows(l.data.map((x) => ({ ...x }))); }, [l.data]);
  const set = (i: number, patch: Partial<Policy>) => setRows((r) => (r ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Card title="Notification policies" pad={false} className="max-w-4xl">
      <Load state={l}>{rows && <>
        <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Event</th><th className="th">Enabled</th><th className="th">In-app</th><th className="th">Email</th><th className="th">Reminder (days before / after)</th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={r.key}><td className="td">{r.label}</td>
            <td className="td"><Toggle checked={r.enabled} label={`${r.label} enabled`} onChange={(v) => set(i, { enabled: v })} /></td>
            <td className="td"><Toggle checked={r.inApp} label={`${r.label} in-app`} disabled={!r.enabled} onChange={(v) => set(i, { inApp: v })} /></td>
            <td className="td"><Toggle checked={r.email} label={`${r.label} email`} disabled={!r.enabled} onChange={(v) => set(i, { email: v })} /></td>
            <td className="td"><input className="input w-24" type="number" min={0} max={365} disabled={!r.enabled} value={r.reminderDays ?? ''} placeholder="n/a" onChange={(e) => set(i, { reminderDays: e.target.value === '' ? null : Number(e.target.value) })} /></td></tr>)}
        </tbody></table></div>
        <div className="px-5 pb-5"><SaveButton busy={!!busy} onClick={() => run('s', async () => { await api.put('/settings/notification-policies', { policies: rows }); l.reload(); }, 'Notification policies saved')} /></div></>}</Load>
    </Card>
  );
}

export function BusinessTabPanel({ tab }: { tab: BusinessTab }) {
  switch (tab) {
    case 'company': return <CompanyProfile />;
    case 'packages': return <Card title="Wedding packages" className="max-w-2xl"><MasterList type="PACKAGE" noun="Package" /></Card>;
    case 'services': return <Card title="Service catalogue" className="max-w-2xl"><MasterList type="SERVICE_CATEGORY" noun="Service" /></Card>;
    case 'pricing': return <PricingDefaults />;
    case 'milestones': return <PaymentMilestones />;
    case 'thresholds': return <ApprovalThresholds />;
    case 'task-templates': return <TaskTemplates canEditHint />;
    case 'wedding-templates': return <WeddingTemplates />;
    case 'vendor-categories': return <Card title="Vendor categories" className="max-w-2xl"><MasterList type="VENDOR_CATEGORY" noun="Category" /></Card>;
    case 'locations': return <BusinessLocations />;
    case 'notifications': return <NotificationPolicies />;
  }
}
