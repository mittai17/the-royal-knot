'use client';
import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { SearchInput } from '@/components/shared/form-bits';
import { ChatWindow } from './chat-window';
import { NewThreadModal } from './new-thread';
import { useApi, asRows } from '@/hooks/use-api';
import { useChatLive, type MessageEvent } from '@/hooks/use-chat-live';
import { ago, cn } from '@/lib/utils';

export interface ThreadRow {
  id: string; channel: string; subject: string; weddingId: string | null; wedding: { id: string; name: string } | null; vendorId: string | null; vendorName: string | null;
  lastMessageAt: string; unread: number; lastMessage: { body: string; senderName: string; createdAt: string } | null;
}

/**
 * Conversation list + window. `prefix` is `/messaging` (staff) or the portal prefix; `channel` narrows the staff list.
 * Opens one socket for `message.new` and refreshes the list/unread counts when anything arrives.
 */
export function Inbox({ prefix, channel, canCreate, onEvent, onActivity, emptyHint, height = 'h-[calc(100dvh-230px)] min-h-[460px]' }: {
  prefix: string; channel?: string; canCreate?: boolean; onEvent?: (e: MessageEvent) => void; onActivity?: () => void; emptyHint?: string; height?: string;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<MessageEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const r = useApi<unknown>(`${prefix}/threads`, { channel, search: search || undefined });
  const rows = asRows<ThreadRow>(r.data);
  const isPortal = prefix.startsWith('/portal');

  const reload = r.reload;
  useChatLive((e) => { setLive(e); onEvent?.(e); void reload(); }, () => { void reload(); });
  const activity = useCallback(() => { void reload(); onActivity?.(); }, [reload, onActivity]);

  // portals have one conversation per wedding / vendor: open it straight away
  useEffect(() => { if (!selected && rows.length && (isPortal || window.matchMedia('(min-width: 768px)').matches)) setSelected(rows[0].id); }, [rows, selected, isPortal]);
  useEffect(() => { if (selected && rows.length && !rows.some((x) => x.id === selected)) setSelected(null); }, [rows, selected]);

  const current = rows.find((x) => x.id === selected);
  const single = isPortal && rows.length <= 1;

  return (
    <>
      <Card pad={false} className="overflow-hidden">
        <div className={cn('grid', single ? 'grid-cols-1' : 'md:grid-cols-[320px_1fr]', height)}>
          {!single && (
            <aside className={cn('border-r border-line flex flex-col min-h-0', selected ? 'hidden md:flex' : 'flex')}>
              <div className="p-3 flex items-center gap-2 border-b border-line">
                <SearchInput value={search} onChange={setSearch} placeholder="Search conversations…" />
                {canCreate && <button className="btn-primary btn-sm shrink-0" onClick={() => setCreating(true)} aria-label="New conversation"><Plus className="h-4 w-4" />New</button>}
              </div>
              <div className="flex-1 overflow-y-auto">
                {r.loading ? <div className="p-3 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
                  : r.error ? <ErrorState message={r.error} onRetry={r.reload} />
                  : rows.length === 0 ? <EmptyState title="No conversations" hint={emptyHint ?? 'Start one with the New button.'} />
                  : <ul>{rows.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => setSelected(t.id)} className={cn('w-full text-left px-4 py-3 border-b border-line/70 hover:bg-surface-2/60 transition-colors', selected === t.id && 'bg-gold-soft/60')}>
                        <div className="flex items-start justify-between gap-2"><p className={cn('text-sm truncate', t.unread ? 'font-semibold' : 'font-medium')}>{t.subject}</p><span className="text-[11px] text-ink-soft shrink-0">{ago(t.lastMessageAt).replace(' ago', '')}</span></div>
                        <p className="text-xs text-ink-soft truncate">{t.wedding?.name ?? t.vendorName ?? 'General'}</p>
                        <div className="flex items-center justify-between gap-2 mt-0.5"><p className="text-xs text-ink-soft truncate">{t.lastMessage ? `${t.lastMessage.senderName.split(' ')[0]}: ${t.lastMessage.body || 'Attachment'}` : 'No messages yet'}</p>{t.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-burgundy text-white text-[11px] grid place-items-center shrink-0" aria-label={`${t.unread} unread`}>{t.unread}</span>}</div>
                      </button>
                    </li>
                  ))}</ul>}
              </div>
            </aside>
          )}
          <section className={cn('min-h-0 min-w-0', !single && !selected && 'hidden md:block')}>
            {current ? <ChatWindow key={current.id} base={`${prefix}/threads/${current.id}`} threadId={current.id} title={current.subject} subtitle={current.wedding?.name ?? current.vendorName ?? undefined} live={live} onActivity={activity} onBack={single ? undefined : () => setSelected(null)} />
              : r.loading && single ? <div className="p-6"><Skeleton className="h-64" /></div>
              : single && r.error ? <ErrorState message={r.error} onRetry={r.reload} />
              : <div className="h-full grid place-items-center"><EmptyState title={single ? 'No conversation yet' : 'Select a conversation'} hint={single ? 'Your planner will appear here once your account is linked.' : 'Pick one from the list to read and reply.'} action={<MessageCircle className="h-5 w-5 text-ink-soft" />} /></div>}
          </section>
        </div>
      </Card>
      {canCreate && <NewThreadModal open={creating} channel={channel ?? 'TEAM'} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSelected(id); void reload(); onActivity?.(); }} />}
    </>
  );
}
