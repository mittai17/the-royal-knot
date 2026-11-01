'use client';
import { useCallback, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import { Inbox } from '@/components/chat/inbox';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { Role } from '@/types';

const TABS: { v: string; l: string; roles: Role[]; create: Role[]; hint: string }[] = [
  { v: 'CLIENT', l: 'Client messages', roles: ['FOUNDER', 'PLANNER', 'EVENT_MANAGER'], create: ['FOUNDER', 'PLANNER', 'EVENT_MANAGER'], hint: 'Conversations with couples appear here. Start one from a wedding with New.' },
  { v: 'VENDOR', l: 'Vendor messages', roles: ['FOUNDER', 'PLANNER', 'EVENT_MANAGER', 'OPERATIONS'], create: ['FOUNDER', 'PLANNER', 'EVENT_MANAGER'], hint: 'Conversations with vendors appear here.' },
  { v: 'TEAM', l: 'Team chat', roles: ['FOUNDER', 'PLANNER', 'EVENT_MANAGER', 'FINANCE', 'OPERATIONS'], create: ['FOUNDER', 'PLANNER', 'EVENT_MANAGER', 'FINANCE', 'OPERATIONS'], hint: 'Internal chat for the whole team.' },
  { v: 'PLANNER', l: 'Planner ↔ Finance', roles: ['FOUNDER', 'PLANNER', 'FINANCE'], create: ['FOUNDER', 'PLANNER', 'FINANCE'], hint: 'Questions between planners and finance.' },
];

export default function CommunicationsPage() {
  const { user } = useAuth();
  const role = user?.role as Role | undefined;
  const tabs = useMemo(() => TABS.filter((t) => role && t.roles.includes(role)), [role]);
  const [tab, setTab] = useState<string | null>(null);
  const unread = useApi<{ total: number; byChannel: Record<string, number> }>('/messaging/unread');
  const reloadUnread = unread.reload;
  const refresh = useCallback(() => { void reloadUnread(); }, [reloadUnread]);
  const active = tabs.find((t) => t.v === tab) ?? tabs[0];

  return (
    <>
      <PageHeader title="Communications" subtitle="Client, vendor and team conversations, delivered live." />
      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1 mb-4" role="tablist">
        {tabs.map((t) => {
          const n = unread.data?.byChannel?.[t.v] ?? 0;
          return (
            <button key={t.v} role="tab" aria-selected={active?.v === t.v} onClick={() => setTab(t.v)}
              className={cn('px-3 h-8 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-2', active?.v === t.v ? 'bg-white text-burgundy shadow-card' : 'text-ink-soft hover:text-ink')}>
              {t.l}{n > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-burgundy text-white text-[10px] grid place-items-center">{n}</span>}
            </button>
          );
        })}
      </div>
      {active && <Inbox key={active.v} prefix="/messaging" channel={active.v} canCreate={!!role && active.create.includes(role)} onEvent={refresh} onActivity={refresh} emptyHint={active.hint} />}
    </>
  );
}
