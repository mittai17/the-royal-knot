'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Segmented, Select } from '@/components/shared/form-bits';
import { useApi } from '@/hooks/use-api';
import { useUserEvents } from '@/hooks/use-user-live';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { ago, cn, humanize } from '@/lib/utils';

interface Row { id: string; type: string; title: string; body?: string | null; link?: string | null; readAt: string | null; createdAt: string }
interface Payload { items: Row[]; unreadCount: number }

export default function NotificationsPage() {
  const [view, setView] = useState<'all' | 'unread'>('all');
  const [type, setType] = useState('');
  const r = useApi<Payload>('/notifications', { take: 200 });
  useUserEvents(['notification'], () => r.reload());
  const items = r.data?.items ?? [];
  const types = useMemo(() => [...new Set(items.map((i) => i.type))].sort(), [items]);
  const shown = items.filter((i) => (view === 'all' || !i.readAt) && (!type || i.type === type));

  const markRead = async (n: Row) => { if (n.readAt) return; try { await api.post(`/notifications/${n.id}/read`); r.reload(); } catch (e) { notify.err(e); } };
  const readAll = async () => { try { await api.post('/notifications/read-all'); r.reload(); } catch (e) { notify.err(e); } };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Approvals, messages, payments and reminders in one place." actions={<button className="btn-secondary" onClick={readAll} disabled={!r.data?.unreadCount}><CheckCheck className="h-4 w-4" />Mark all read{r.data?.unreadCount ? ` (${r.data.unreadCount})` : ''}</button>} />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <Segmented value={view} onChange={setView} options={[{ v: 'all', l: 'All' }, { v: 'unread', l: 'Unread' }]} />
          <Select className="w-48" value={type} onChange={setType} options={types.map((t) => ({ v: t, l: humanize(t.replace(/[.-]/g, '_')) }))} placeholder="All types" />
        </div>
        {r.loading ? <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : r.error ? <ErrorState message={r.error} onRetry={r.reload} />
          : shown.length === 0 ? <EmptyState title={view === 'unread' ? 'No unread notifications' : 'No notifications'} hint="You will see approvals, messages and reminders here." action={<Bell className="h-5 w-5 text-ink-soft" />} />
          : <ul>{shown.map((n) => {
            const inner = (
              <div className="flex gap-3 items-start">
                <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full shrink-0', n.readAt ? 'border border-line' : 'bg-burgundy')} aria-label={n.readAt ? 'Read' : 'Unread'} />
                <div className="min-w-0 flex-1"><p className={cn('text-sm', !n.readAt && 'font-semibold')}>{n.title}</p>{n.body && <p className="text-sm text-ink-soft mt-0.5">{n.body}</p>}<p className="text-xs text-ink-soft mt-1">{humanize(n.type.replace(/[.-]/g, '_'))} · {ago(n.createdAt)}</p></div>
              </div>
            );
            return (
              <li key={n.id} className="border-b border-line/70 last:border-0">
                {n.link ? <Link href={n.link} onClick={() => markRead(n)} className="block px-5 py-3.5 hover:bg-surface-2/50">{inner}</Link>
                  : <button className="block w-full text-left px-5 py-3.5 hover:bg-surface-2/50" onClick={() => markRead(n)}>{inner}</button>}
              </li>
            );
          })}</ul>}
      </Card>
    </>
  );
}
