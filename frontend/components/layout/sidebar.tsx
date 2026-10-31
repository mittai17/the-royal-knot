'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, LogOut } from 'lucide-react';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { LotusMark } from './logo';
import { Avatar } from '@/components/ui/primitives';
import { useAuth, ROLE_LABEL } from '@/lib/auth';

interface Props { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onCloseMobile: () => void; counts: { enquiries?: number; weddings?: number } }

export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile, counts }: Props) {
  const path = usePathname();
  const { user, logout, can } = useAuth();
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

        <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-0.5">
          {NAV.filter((n) => !n.roles || can(...n.roles)).map(({ href, label, icon: Icon, countKey }) => {
            const active = path === href || path.startsWith(href + '/');
            const count = countKey ? counts[countKey] : undefined;
            return (
              <Link
                key={href} href={href} onClick={onCloseMobile} title={narrow ? label : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 h-10 rounded-lg px-3 text-[13.5px] transition-colors',
                  active ? 'bg-gold-soft text-burgundy-deep font-medium' : 'text-ink/80 hover:bg-surface-2',
                  narrow && 'justify-center px-0',
                )}
              >
                {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-gold" />}
                <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-burgundy' : 'text-ink-soft')} strokeWidth={1.8} />
                {!narrow && <span className="truncate flex-1">{label}</span>}
                {!narrow && count !== undefined && <span className="text-[11px] font-medium bg-surface-2 text-ink-soft rounded-full px-2 py-0.5 tabular-nums">{count}</span>}
              </Link>
            );
          })}
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
