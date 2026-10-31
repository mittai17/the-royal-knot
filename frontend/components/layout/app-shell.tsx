'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { useApi } from '@/hooks/use-api';
import { useWedding } from '@/lib/wedding-context';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { weddings } = useWedding();
  const { loading, user } = useAuth();
  const pipe = useApi<{ stages: { stage: string; count: number }[] }>('/enquiries/pipeline/summary');

  useEffect(() => { try { setCollapsed(localStorage.getItem('rk.collapsed') === '1'); } catch { /* ignore */ } }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('rk.collapsed', c ? '0' : '1'); } catch { /* ignore */ } return !c; });

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-sm text-ink-soft">Loading workspace…</div>;
  }
  const enqTotal = pipe.data?.stages.filter((s) => s.stage !== 'CONFIRMED' && s.stage !== 'LOST').reduce((a, s) => a + s.count, 0);

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
