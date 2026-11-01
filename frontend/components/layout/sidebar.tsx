'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, LogOut } from 'lucide-react';
import { activeHref, navFor, type NavGroup, type NavItem } from '@/lib/nav';
import type { Role } from '@/types';
import { cn } from '@/lib/utils';
import { LotusMark } from './logo';
import { Avatar } from '@/components/ui/primitives';
import { useAuth, ROLE_LABEL } from '@/lib/auth';

interface Props { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onCloseMobile: () => void; counts: { enquiries?: number; weddings?: number } }

type Counts = Props['counts'];

/** Open/closed state of the sidebar groups, remembered per signed-in user. Groups containing the current page are always open. */
function useOpenGroups(userId: string | undefined) {
  const key = `rk.nav.open.${userId ?? 'anon'}`;
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setSaved(JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, boolean>); } catch { setSaved({}); } }, [key]);
  const set = useCallback((id: string, open: boolean) => setSaved((cur) => {
    const next = { ...cur, [id]: open };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }), [key]);
  return [saved, set] as const;
}

function ItemLink({ item, active, narrow, counts, onNavigate, nested }: { item: NavItem; active: boolean; narrow: boolean; counts: Counts; onNavigate: () => void; nested?: boolean }) {
  const Icon = item.icon;
  const count = item.countKey ? counts[item.countKey] : undefined;
  return (
    <Link
      href={item.href} onClick={onNavigate} title={narrow ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 transition-colors',
        nested ? 'h-8 text-[12.5px] ml-6' : 'h-9 text-[13.5px]',
        active ? 'bg-gold-soft text-burgundy-deep font-medium' : 'text-ink/80 hover:bg-surface-2',
        narrow && 'justify-center px-0 h-10',
      )}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-gold" />}
      {!nested && <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-burgundy' : 'text-ink-soft')} strokeWidth={1.8} />}
      {!narrow && <span className="truncate flex-1">{item.label}</span>}
      {!narrow && item.tag && <span className="text-[10px] uppercase tracking-wide text-ink-soft border border-line rounded px-1.5 py-px">{item.tag}</span>}
      {!narrow && count !== undefined && <span className="text-[11px] font-medium bg-surface-2 text-ink-soft rounded-full px-2 py-0.5 tabular-nums">{count}</span>}
    </Link>
  );
}

function NavGroups({ role, userId, narrow, counts, onNavigate }: { role: Role | undefined; userId: string | undefined; narrow: boolean; counts: Counts; onNavigate: () => void }) {
  const path = usePathname();
  const search = useSearchParams();
  const groups = useMemo(() => navFor(role), [role]);
  const active = activeHref(role, path, search);
  const [saved, setOpen] = useOpenGroups(userId);
  const hasActive = (grp: NavGroup) => grp.items.some((i) => i.href === active || i.children?.some((c) => c.href === active));

  return (
    <>
      {groups.map((grp, gi) => {
        const containsActive = hasActive(grp);
        const open = saved[grp.id] ?? containsActive;
        const expanded = open || containsActive;
        return (
          <div key={grp.id} className={cn(narrow ? (gi > 0 ? 'border-t border-line/70 mt-1 pt-1' : '') : 'mb-1')} role="group" aria-label={grp.label}>
            {!narrow && (
              <button
                type="button" onClick={() => setOpen(grp.id, !expanded)} aria-expanded={expanded} aria-controls={`nav-grp-${grp.id}`} data-testid={`nav-group-${grp.id}`}
                className="w-full flex items-center justify-between px-3 h-8 text-[11px] font-semibold uppercase tracking-wider text-ink-soft hover:text-ink"
              >
                <span className="truncate">{grp.label}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !expanded && '-rotate-90')} />
              </button>
            )}
            {(narrow || expanded) && (
              <div id={`nav-grp-${grp.id}`} className="space-y-0.5">
                {grp.items.map((item) => (
                  <div key={item.href} className="space-y-0.5">
                    <ItemLink item={item} active={item.href === active} narrow={narrow} counts={counts} onNavigate={onNavigate} />
                    {!narrow && item.children?.map((c) => <ItemLink key={c.href} item={c} nested active={c.href === active} narrow={false} counts={counts} onNavigate={onNavigate} />)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile, counts }: Props) {
  const { user, logout } = useAuth();
  const narrow = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-burgundy-deep/40 lg:hidden" onClick={onCloseMobile} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-[#FBF9F5] border-r border-line transition-all duration-200',
          narrow ? 'w-[72px]' : 'w-[248px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label="Primary"
      >
        <div className={cn('flex items-center gap-3 px-5 h-[84px] shrink-0', narrow && 'justify-center px-0')}>
          <LotusMark className={narrow ? 'h-8 w-8' : 'h-10 w-10'} />
          {!narrow && (
            <div className="leading-tight">
              <p className="font-serif text-[21px] text-burgundy-deep">The Royal Knot</p>
              <p className="text-[8.5px] tracking-[0.2em] text-ink-soft whitespace-nowrap">WEDDING MANAGEMENT</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-1" aria-label="Main navigation">
          <Suspense fallback={null}>
            <NavGroups role={user?.role} userId={user?.id} narrow={narrow} counts={counts} onNavigate={onCloseMobile} />
          </Suspense>
        </nav>

        <div className="border-t border-line p-3">
          <div className={cn('flex items-center gap-3 rounded-lg p-2', narrow && 'justify-center p-0')}>
            <Avatar name={user?.name} size={36} />
            {!narrow && (
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-[11px] text-ink-soft truncate">{user ? ROLE_LABEL[user.role] ?? user.role : ''}</p>
              </div>
            )}
            {!narrow && <button onClick={logout} className="btn-ghost btn-sm !px-2" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>}
          </div>
          <button onClick={onToggle} className={cn('hidden lg:flex btn-ghost btn-sm w-full mt-1 justify-start gap-2', narrow && 'justify-center')} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Collapse</>}
          </button>
        </div>
      </aside>
    </>
  );
}
