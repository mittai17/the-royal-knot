'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { useApi } from '@/hooks/use-api';
import { useWedding } from '@/lib/wedding-context';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { AREA_PREFIX, HOME, SHARED_PREFIXES } from '@/lib/permissions';

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { weddings } = useWedding();
  const { loading, user } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const staff = !!user && !AREA_PREFIX[user.role];
  const pipe = useApi<{ stages: { stage: string; count: number }[] }>(staff ? '/enquiries/pipeline/summary' : null);

  // CLIENT / VENDOR / SYSADMIN live under their own prefix (plus /notifications). They have no generic /settings: SYSADMIN uses /admin/*,
  // CLIENT / VENDOR their portal settings. Everyone else may not enter those prefixes.
  const stray = !!user && (AREA_PREFIX[user.role]
    ? !(path.startsWith(AREA_PREFIX[user.role]!) || (SHARED_PREFIXES[user.role] ?? []).some((p) => path.startsWith(p)))
    : path.startsWith('/client-portal') || path.startsWith('/vendor-portal') || path.startsWith('/admin'));
  const redirecting = stray && !(user?.role === 'FOUNDER' && path.startsWith('/admin'));
  useEffect(() => { if (redirecting && user) router.replace(HOME[user.role]); }, [redirecting, user, router]);

  useEffect(() => { try { setCollapsed(localStorage.getItem('rk.collapsed') === '1'); } catch { /* ignore */ } }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('rk.collapsed', c ? '0' : '1'); } catch { /* ignore */ } return !c; });

  if (loading || !user || redirecting) {
    return <div className="min-h-screen grid place-items-center text-sm text-ink-soft">Loading workspace…</div>;
  }
  const enqTotal = pipe.data?.stages.filter((s) => s.stage !== 'CONVERTED' && s.stage !== 'LOST').reduce((a, s) => a + s.count, 0);

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobile} onCloseMobile={() => setMobile(false)} counts={{ enquiries: enqTotal, weddings: weddings.length || undefined }} />
      <div className={cn('transition-all duration-200', collapsed ? 'lg:pl-[72px]' : 'lg:pl-[248px]')}>
        <Topbar onMenu={() => setMobile(true)} />
        <main className="px-4 lg:px-8 py-6 max-w-[1600px]">{children}</main>
      </div>
    </div>
  );
}
