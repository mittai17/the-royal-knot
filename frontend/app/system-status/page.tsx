'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleSlash, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { LotusMark } from '@/components/layout/logo';
import { Card, ErrorState } from '@/components/ui/primitives';

type ServiceState = 'up' | 'down' | 'disabled';
interface ServiceStatus { name: string; status: ServiceState; detail?: string }
interface SystemStatus { services: ServiceStatus[]; time: string }

const LOOK: Record<ServiceState, { label: string; icon: typeof CheckCircle2; tone: string; dot: string }> = {
  up: { label: 'Operational', icon: CheckCircle2, tone: 'text-success', dot: 'bg-success' },
  down: { label: 'Down', icon: XCircle, tone: 'text-danger', dot: 'bg-danger' },
  disabled: { label: 'Disabled', icon: CircleSlash, tone: 'text-ink-soft', dot: 'bg-line' },
};

export default function SystemStatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setStatus((await api.get<SystemStatus>('/system/status')).data); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to reach the API'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const rawServices = status?.services;
  const services: ServiceStatus[] = Array.isArray(rawServices)
    ? rawServices
    : rawServices && typeof rawServices === 'object'
      ? Object.entries(rawServices).map(([name, s]: [string, any]) => ({
          name,
          status: s?.status ?? 'down',
          detail: s?.detail ?? (s?.latencyMs != null ? `${s.latencyMs}ms` : undefined),
        }))
      : [];
  const down = services.filter((s) => s.status === 'down').length;
  const summary = error ? 'API unreachable' : !status ? 'Checking services…' : down ? `${down} service${down > 1 ? 's' : ''} down` : 'All systems operational';

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5"><LotusMark className="h-8 w-8 text-burgundy" /><span className="font-serif text-xl text-burgundy-deep">The Royal Knot</span></Link>
          <button className="btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh</button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="font-serif text-[28px] leading-8 text-burgundy-deep">System status</h1>
          <p className="mt-1 text-sm text-ink-soft flex items-center gap-2" role="status">
            <span className={`h-2 w-2 rounded-full ${error || down ? 'bg-danger' : status ? 'bg-success' : 'bg-warning'}`} />{summary}
            {status && <span>· checked {new Date(status.time).toLocaleTimeString()}</span>}
          </p>
        </div>
        {error && !status ? <Card><ErrorState message={error} onRetry={() => void load()} /></Card> : (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="status-grid">
            {!status && Array.from({ length: 6 }).map((_, i) => <div key={i} className="card p-4"><div className="skeleton h-4 w-28" /><div className="skeleton h-3 w-40 mt-3" /></div>)}
            {services.map((s) => {
              const look = LOOK[s.status]; const Icon = look.icon;
              return (
                <div key={s.name} className="card p-4 flex items-start gap-3" data-service={s.name} data-status={s.status}>
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${look.tone}`} />
                  <div className="min-w-0"><p className="font-medium capitalize">{s.name}</p><p className={`text-sm ${look.tone}`}>{look.label}</p>{s.detail && <p className="text-xs text-ink-soft mt-1 break-words">{s.detail}</p>}</div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
