'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, MapPin, Menu, Plus, Search, Heart, MessagesSquare, Store, FileSpreadsheet, Wallet, Check } from 'lucide-react';
import { useWedding } from '@/lib/wedding-context';
import { useApi, asRows } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { ago, cn } from '@/lib/utils';
import { useAuth, ROLE_LABEL } from '@/lib/auth';
import { Avatar } from '@/components/ui/primitives';
import { G } from '@/lib/permissions';
import { config, DEMO_PASSWORD, DEMO_USERS } from '@/lib/config';

function useOutside(cb: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && cb();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [cb]);
  return ref;
}

function Menu_({ trigger, children, align = 'right', width = 'w-72' }: { trigger: (open: boolean) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: 'left' | 'right'; width?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && <div className={cn('absolute top-full mt-2 z-50 card shadow-pop p-1.5', width, align === 'right' ? 'right-0' : 'left-0')}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

interface Notification { id: string; title: string; body?: string | null; read?: boolean; readAt?: string | null; createdAt: string; link?: string | null }
interface SearchHit { type: string; id: string; title: string; subtitle?: string; href: string }
interface SearchResult {
  weddings: { id: string; name: string; location: string }[]; vendors: { id: string; name: string; category: string }[];
  enquiries: { id: string; stage: string; couple: { brideName: string; groomName: string } }[];
  guests: { id: string; name: string; wedding: { name: string } }[]; tasks: { id: string; name: string; status: string }[];
}

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = (await api.get<SearchResult>('/search', { q })).data;
        setHits([
          ...r.weddings.map((w) => ({ type: 'Wedding', id: w.id, title: w.name, subtitle: w.location, href: `/weddings/${w.id}` })),
          ...r.vendors.map((v) => ({ type: 'Vendor', id: v.id, title: v.name, subtitle: v.category, href: '/vendors' })),
          ...r.enquiries.map((e) => ({ type: 'Enquiry', id: e.id, title: `${e.couple.brideName} & ${e.couple.groomName}`, subtitle: e.stage, href: '/enquiries' })),
          ...r.guests.map((g) => ({ type: 'Guest', id: g.id, title: g.name, subtitle: g.wedding.name, href: '/guests' })),
          ...r.tasks.map((t) => ({ type: 'Task', id: t.id, title: t.name, subtitle: t.status, href: '/tasks' })),
        ]);
        setOpen(true);
      } catch { setHits([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative flex-1 max-w-[460px]" ref={ref}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
      <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} placeholder="Search weddings, vendors, tasks, guests…" aria-label="Global search"
        className="w-full h-11 rounded-xl border border-line bg-white pl-10 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-burgundy" />
      <kbd className="hidden md:block absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-soft bg-surface-2 rounded px-1.5 py-0.5">⌘ K</kbd>
      {open && q.trim().length >= 2 && (
        <div className="absolute top-full mt-2 w-full card shadow-pop p-1.5 z-50 max-h-[360px] overflow-y-auto">
          {hits.length === 0 ? <p className="text-sm text-ink-soft p-3">No matches for “{q}”.</p> : hits.map((h) => (
            <button key={h.type + h.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 flex items-center justify-between gap-3" onClick={() => { setOpen(false); setQ(''); router.push(h.href); }}>
              <span className="min-w-0"><span className="block text-sm truncate">{h.title}</span>{h.subtitle && <span className="block text-xs text-ink-soft truncate">{h.subtitle}</span>}</span>
              <span className="text-[10px] uppercase tracking-wider text-ink-soft">{h.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const QUICK = [
  { l: 'New Wedding', i: Heart, h: '/weddings?new=1', r: G.CRM },
  { l: 'New Enquiry', i: MessagesSquare, h: '/enquiries?new=1', r: G.CRM },
  { l: 'New Vendor', i: Store, h: '/vendors?new=1', r: G.CRM },
  { l: 'Request Quotations', i: FileSpreadsheet, h: '/quotations?new=1', r: G.CRM },
  { l: 'Record Payment', i: Wallet, h: '/payments?new=1', r: G.FINANCE_WRITE },
] as const;

function ProfileMenu({ close }: { close: () => void }) {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const switchRole = async (email: string) => {
    setBusy(email); setError(null);
    try { await api.post('/auth/keycloak/login', { email, password: DEMO_PASSWORD }); window.location.href = '/dashboard'; }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to switch role'); setBusy(null); }
  };
  return (
    <div>
      <div className="px-3 py-2.5"><p className="text-sm font-medium truncate">{user?.name}</p><p className="text-xs text-ink-soft truncate">{user?.email}</p>{user && <p className="text-xs text-burgundy mt-0.5">{ROLE_LABEL[user.role]}</p>}</div>
      {config.demoMode && (
        <div className="border-t border-line py-1.5" data-testid="role-switcher">
          <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-soft">Switch demo role</p>
          {DEMO_USERS.map((u) => (
            <button key={u.email} disabled={!!busy || user?.email === u.email} onClick={() => switchRole(u.email)} className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-surface-2 flex items-center justify-between text-sm disabled:opacity-60">
              <span>{u.label}</span>{user?.email === u.email ? <Check className="h-3.5 w-3.5 text-success" /> : busy === u.email ? <span className="text-xs text-ink-soft">…</span> : <span className="text-xs text-ink-soft">{u.name}</span>}
            </button>
          ))}
          {error && <p role="alert" className="px-3 py-1 text-xs text-danger">{error}</p>}
        </div>
      )}
      <div className="border-t border-line pt-1.5"><button className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 flex items-center gap-2 text-sm" onClick={() => { close(); void logout(); }}><LogOut className="h-4 w-4 text-burgundy" />Sign out</button></div>
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const { weddings, selected, select } = useWedding();
  const { user, can } = useAuth();
  const quick = QUICK.filter((x) => can(...x.r));
  const notes = useApi<unknown>('/notifications', { pageSize: 8 });
  const list = asRows<Notification>(notes.data);
  const unread = list.filter((n) => !n.readAt).length;

  const markAll = async () => { try { await api.post('/notifications/read-all'); notes.reload(); } catch { /* surfaced by empty state */ } };

  return (
    <header className="sticky top-0 z-20 bg-canvas/95 backdrop-blur-0 border-b border-line/60">
      <div className="flex items-center gap-3 h-[68px] px-4 lg:px-8">
        <button className="lg:hidden btn-ghost !px-2" onClick={onMenu} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <GlobalSearch />
        <div className="flex-1" />

        <div className="hidden xl:flex items-center gap-2 h-11 px-4 rounded-xl border border-line bg-white text-sm" title="Workspace">
          <MapPin className="h-4 w-4 text-burgundy" /> Jaipur · Udaipur
        </div>

        <Menu_ width="w-80" trigger={(o) => (
          <button className="flex items-center gap-2 h-11 px-3 md:px-4 rounded-xl border border-line bg-white text-sm max-w-[240px]" aria-expanded={o} aria-label={`Select wedding, current: ${selected?.name ?? 'all weddings'}`}>
            <Heart className="h-4 w-4 text-burgundy shrink-0" /><span className="truncate hidden md:inline">{selected?.name ?? 'All weddings'}</span><ChevronDown className="h-4 w-4 text-ink-soft shrink-0 hidden md:block" />
          </button>
        )}>
          {(close) => (
            <div className="max-h-80 overflow-y-auto">
              {weddings.length === 0 && <p className="text-sm text-ink-soft p-3">No weddings yet.</p>}
              {weddings.map((w) => (
                <button key={w.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 flex items-center justify-between gap-2" onClick={() => { select(w.id); close(); }}>
                  <span className="min-w-0"><span className="block text-sm truncate">{w.name}</span><span className="block text-xs text-ink-soft">{w.location}</span></span>
                  {w.id === selected?.id && <Check className="h-4 w-4 text-burgundy" />}
                </button>
              ))}
            </div>
          )}
        </Menu_>

        <Menu_ width="w-[360px]" trigger={() => (
          <button className="relative h-11 w-11 rounded-xl border border-line bg-white grid place-items-center" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-semibold grid place-items-center">{unread}</span>}
          </button>
        )}>
          {(close) => (
            <div>
              <div className="flex items-center justify-between px-3 py-2"><span className="font-medium text-sm">Notifications</span>{unread > 0 && <button className="text-xs text-burgundy" onClick={markAll}>Mark all read</button>}</div>
              <div className="max-h-[360px] overflow-y-auto">
                {list.length === 0 ? <p className="text-sm text-ink-soft px-3 py-6 text-center">You’re all caught up.</p> : list.map((n) => (
                  <button key={n.id} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-surface-2 flex gap-2" onClick={() => { close(); if (n.link) router.push(n.link); }}>
                    <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', n.readAt ? 'bg-transparent' : 'bg-burgundy')} />
                    <span className="min-w-0"><span className="block text-sm">{n.title}</span>{n.body && <span className="block text-xs text-ink-soft truncate">{n.body}</span>}<span className="block text-[11px] text-ink-soft mt-0.5">{ago(n.createdAt)}</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Menu_>

        {quick.length > 0 && (        <Menu_ trigger={() => <button className="btn-primary h-11 px-5 rounded-xl"><Plus className="h-4 w-4" /><span className="hidden sm:inline">New Wedding</span></button>} width="w-56">
            {(close) => (
              <div>
                {quick.map(({ l, i: I, h }) => (
                  <button key={l} className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 flex items-center gap-2 text-sm" onClick={() => { close(); router.push(h); }}><I className="h-4 w-4 text-burgundy" />{l}</button>
                ))}
              </div>
            )}
          </Menu_>)}

        <Menu_ trigger={() => <button className="flex items-center gap-2.5 pl-1 rounded-full" aria-label="Account menu" title={user ? ROLE_LABEL[user.role] : ''}><Avatar name={user?.name} size={38} /></button>} width="w-64">
          {(close) => <ProfileMenu close={close} />}
        </Menu_>
      </div>
    </header>
  );
}
