'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Loader2, Users } from 'lucide-react';
import { api, apiUrl } from '@/lib/api';
import { config, DEMO_PASSWORD, DEMO_USERS } from '@/lib/config';
import { LotusMark } from '@/components/layout/logo';
import { Field } from '@/components/ui/primitives';

interface KeycloakConfig { enabled: boolean; realm?: string; clientId?: string; issuer?: string }
type Mode = 'local' | 'keycloak';

const schema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password is required') });
type Form = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/dashboard';
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('local');
  const [kc, setKc] = useState<KeycloakConfig | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const dest = next.startsWith('/') ? next : '/dashboard';

  // If the access cookie expired but the refresh cookie is still valid, resume the session silently.
  useEffect(() => {
    fetch(apiUrl('/auth/refresh'), { method: 'POST', credentials: 'include' })
      .then((r) => { if (r.ok) window.location.href = dest; })
      .catch(() => undefined);
  }, [dest]);

  // Keycloak is optional: the toggle only appears when the backend reports it as enabled.
  useEffect(() => {
    api.get<KeycloakConfig>('/auth/keycloak/config').then((r) => setKc(r.data)).catch(() => setKc({ enabled: false }));
  }, []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });
  const endpoint = mode === 'keycloak' ? '/auth/keycloak/login' : '/auth/login';

  const signIn = async (path: string, body: Form) => {
    setError(null);
    try { await api.post(path, body); window.location.href = dest; router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in'); }
  };
  const onSubmit = (v: Form) => signIn(endpoint, v);
  const switchTo = async (email: string) => { setSwitching(email); await signIn('/auth/keycloak/login', { email, password: DEMO_PASSWORD }); setSwitching(null); };

  return (
    <div className="w-full max-w-[400px] space-y-5">
      {kc?.enabled && (
        <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-2">
          {([['local', 'Email & password'], ['keycloak', 'Keycloak']] as const).map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }}
              className={`h-9 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-white text-burgundy-deep shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
              {m === 'keycloak' && <KeyRound className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />}{label}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="username" autoFocus {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><input className="input" type="password" autoComplete="current-password" {...register('password')} /></Field>
        {error && <p role="alert" className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">{error}</p>}
        <button className="btn-primary w-full h-11" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'keycloak' ? 'Sign in with Keycloak' : 'Sign in'}
        </button>
        {mode === 'keycloak' && kc?.issuer && <p className="text-xs text-ink-soft text-center">Realm <span className="font-medium">{kc.realm}</span> · {kc.issuer}</p>}
      </form>

      {config.demoMode && kc?.enabled && (
        <div className="pt-5 border-t border-line" data-testid="demo-switcher">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-soft mb-3"><Users className="h-3.5 w-3.5" />Demo role switcher</p>
          <div className="grid gap-2">
            {DEMO_USERS.map((u) => (
              <button key={u.email} type="button" disabled={!!switching} onClick={() => switchTo(u.email)} data-role={u.role}
                className="flex items-center justify-between rounded-xl border border-line bg-white px-3.5 py-2.5 text-left hover:border-burgundy/40 hover:bg-surface-2 transition-colors disabled:opacity-60">
                <span><span className="block text-sm font-medium">{u.name}</span><span className="block text-xs text-ink-soft">{u.email}</span></span>
                <span className="flex items-center gap-2 text-xs text-burgundy">{switching === u.email ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{u.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between bg-burgundy-deep text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #C6A46A 0, transparent 40%), radial-gradient(circle at 80% 90%, #C6A46A 0, transparent 35%)' }} />
        <div className="relative flex items-center gap-3"><LotusMark className="h-10 w-10" /><span className="font-serif text-2xl">The Royal Knot</span></div>
        <div className="relative max-w-md">
          <p className="font-serif text-4xl leading-tight">Every love story deserves a perfect celebration.</p>
          <p className="mt-4 text-white/60 text-sm">One workspace for enquiries, vendors, event day and every rupee in between — Jaipur · Udaipur.</p>
        </div>
        <p className="relative text-xs text-white/40">Self-hosted · Private network</p>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          <h1 className="font-serif text-3xl text-burgundy-deep">Welcome back</h1>
          <p className="text-sm text-ink-soft mt-1 mb-8">Sign in to your workspace.</p>
          <Suspense><LoginForm /></Suspense>
        </div>
      </div>
    </div>
  );
}
