'use client';
import { useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Card, Field, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { Load, Toggle, useBusy } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { ago } from '@/lib/utils';

interface FieldV { key: string; label: string; type: string; options?: string[]; hint?: string; secret: boolean; isSet: boolean; value: string | number | boolean | null }
interface Integ { provider: string; label: string; description: string; enabled: boolean; source: string; lastTestedAt: string | null; lastTestOk: boolean | null; fields: FieldV[] }
interface TestRes { ok: boolean; message: string; probe: string; latencyMs: number; details: Record<string, unknown> }

function IntegrationCard({ it, onSaved }: { it: Integ; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string | number | boolean>>({});
  const [enabled, setEnabled] = useState(it.enabled);
  const [res, setRes] = useState<TestRes | null>(null);
  const { busy, run } = useBusy();
  const dirty = Object.keys(vals).length > 0 || enabled !== it.enabled;
  const val = (f: FieldV) => (f.key in vals ? vals[f.key] : f.secret ? '' : f.value ?? '');
  const save = () => run('save', async () => { await api.put(`/admin/integrations/${it.provider}`, { enabled, config: vals }); setVals({}); setRes(null); onSaved(); }, 'Integration saved');
  const test = () => run('test', async () => { const r = await api.post<TestRes>(`/admin/integrations/${it.provider}/test`); setRes(r.data); onSaved(); });
  return (
    <Card title={it.label} action={<div className="flex items-center gap-2 text-xs text-ink-soft">{enabled ? 'Enabled' : 'Disabled'}<Toggle checked={enabled} label={`${it.label} enabled`} onChange={setEnabled} /></div>}>
      <p className="text-sm text-ink-soft -mt-1 mb-4">{it.description} <span className="text-xs">Source: {it.source}.</span></p>
      <div className="grid sm:grid-cols-2 gap-4">
        {it.fields.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.type === 'select' ? <Select value={String(val(f))} onChange={(v) => setVals({ ...vals, [f.key]: v })} placeholder="Select…" options={f.options ?? []} />
              : f.type === 'boolean' ? <Toggle checked={!!val(f)} label={f.label} onChange={(v) => setVals({ ...vals, [f.key]: v })} />
              : <input className="input" type={f.secret ? 'password' : f.type === 'number' ? 'number' : 'text'} autoComplete="off" placeholder={f.secret ? (f.isSet ? '•••••••• (saved, leave blank to keep)' : 'Not set') : f.hint} value={String(val(f))} onChange={(e) => setVals({ ...vals, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} />}
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button className="btn-primary btn-sm" disabled={!dirty || !!busy} onClick={save}>{busy === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</button>
        <button className="btn-secondary btn-sm" disabled={!!busy || dirty} title={dirty ? 'Save first to test the saved settings' : undefined} onClick={test}>{busy === 'test' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Test connection</button>
        {it.lastTestedAt && !res && <span className="text-xs text-ink-soft flex items-center gap-1.5">Last test {ago(it.lastTestedAt)} <StatusBadge status={it.lastTestOk ? 'Passed' : 'Failed'} tone={it.lastTestOk ? 'success' : 'danger'} /></span>}
      </div>
      {res && <div className={`mt-4 rounded-lg px-4 py-3 text-sm flex gap-3 ${res.ok ? 'bg-success-soft' : 'bg-danger-soft'}`} role="status">
        {res.ok ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" /> : <XCircle className="h-5 w-5 text-danger shrink-0" />}
        <div><p className="font-medium">{res.ok ? 'Connection OK' : 'Connection failed'} <span className="font-normal text-ink-soft">· {res.latencyMs} ms{res.probe === 'validation-only' ? ' · credentials check only' : ''}</span></p><p className="text-ink-soft break-words">{res.message}</p></div>
      </div>}
    </Card>
  );
}

export default function IntegrationsPage() {
  const l = useApi<Integ[]>('/admin/integrations');
  return (
    <>
      <PageHeader title="Integrations" subtitle="Connection settings for identity, email, payments and maps. Secrets are encrypted at rest and never shown again." />
      <Load state={l}><div className="grid xl:grid-cols-2 gap-5">{l.data?.map((i) => <IntegrationCard key={i.provider + i.lastTestedAt + i.enabled} it={i} onSaved={l.reload} />)}</div></Load>
    </>
  );
}
