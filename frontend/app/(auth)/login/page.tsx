'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { LotusMark } from '@/components/layout/logo';
import { Field } from '@/components/ui/primitives';

const schema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password is required') });
type Form = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/dashboard';
  const [error, setError] = useState<string | null>(null);
  // If the access cookie expired but the refresh cookie is still valid, resume the session silently.
  useEffect(() => {
    fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((r) => { if (r.ok) window.location.href = next.startsWith('/') ? next : '/dashboard'; })
      .catch(() => undefined);
  }, [next]);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: Form) => {
    setError(null);
    try { await api.post('/auth/login', v); window.location.href = next.startsWith('/') ? next : '/dashboard'; router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in'); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-[400px] space-y-4" noValidate>
      <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="username" autoFocus {...register('email')} /></Field>
      <Field label="Password" error={errors.password?.message}><input className="input" type="password" autoComplete="current-password" {...register('password')} /></Field>
      {error && <p role="alert" className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">{error}</p>}
      <button className="btn-primary w-full h-11" disabled={isSubmitting}>{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}Sign in</button>
    </form>
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
