'use client';
import { useState } from 'react';
import { CheckCheck, Megaphone, Pin } from 'lucide-react';
import { Card, EmptyState, ErrorState, Pagination, Skeleton } from '@/components/ui/primitives';
import { useList } from '@/hooks/use-list';
import { useUserEvents } from '@/hooks/use-user-live';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { ago, cn, fmtDate } from '@/lib/utils';

export interface AnnouncementItem {
  id: string; title: string; body: string; pinned: boolean; audience: string; weddingId: string | null; wedding: { id: string; name: string } | null;
  publishedAt: string; expiresAt: string | null; authorName?: string | null; unread?: boolean;
  recipients?: number; readCount?: number; expired?: boolean;
}

/** Read-only announcement feed for any role. `base` is the portal prefix (or /announcements for the staff feed path `/announcements/feed`). */
export function AnnouncementsFeed({ base, listPath }: { base: string; listPath?: string }) {
  const list = useList<AnnouncementItem>(listPath ?? base, {}, 10);
  const [open, setOpen] = useState<string | null>(null);
  useUserEvents(['announcement.new'], () => list.reload());
  const unread = list.rows.filter((r) => r.unread).length;

  const toggle = async (a: AnnouncementItem) => {
    setOpen(open === a.id ? null : a.id);
    if (a.unread) { try { await api.post(`${base}/${a.id}/read`); list.reload(); } catch (e) { notify.err(e); } }
  };
  const readAll = async () => { try { await api.post(`${base}/read-all`); list.reload(); } catch (e) { notify.err(e); } };

  return (
    <Card pad={false}>
      <div className="flex items-center justify-between gap-3 p-4 border-b border-line">
        <p className="text-sm text-ink-soft">{unread > 0 ? `${unread} unread on this page` : 'You are all caught up'}</p>
        <button className="btn-secondary btn-sm" onClick={readAll} disabled={unread === 0}><CheckCheck className="h-4 w-4" />Mark all read</button>
      </div>
      {list.loading ? <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.rows.length === 0 ? <EmptyState title="No announcements yet" hint="Updates from the planning team will show up here." action={<Megaphone className="h-5 w-5 text-ink-soft" />} />
        : <ul>{list.rows.map((a) => (
          <li key={a.id} className="border-b border-line/70 last:border-0">
            <button className="w-full text-left px-5 py-4 hover:bg-surface-2/50 flex gap-3" onClick={() => toggle(a)} aria-expanded={open === a.id}>
              <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full shrink-0', a.unread ? 'bg-burgundy' : 'bg-transparent border border-line')} aria-label={a.unread ? 'Unread' : 'Read'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap"><p className={cn('text-sm', a.unread ? 'font-semibold' : 'font-medium')}>{a.title}</p>{a.pinned && <Pin className="h-3.5 w-3.5 text-gold" aria-label="Pinned" />}{a.wedding && <span className="text-xs rounded-full bg-gold-soft text-[#8A6B2E] px-2 py-0.5">{a.wedding.name}</span>}</div>
                <p className={cn('text-sm text-ink-soft mt-1 whitespace-pre-wrap', open !== a.id && 'line-clamp-2')}>{a.body}</p>
                <p className="text-xs text-ink-soft mt-1.5">{a.authorName ? `${a.authorName} · ` : ''}{ago(a.publishedAt)}{a.expiresAt ? ` · until ${fmtDate(a.expiresAt)}` : ''}</p>
              </div>
            </button>
          </li>
        ))}</ul>}
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
    </Card>
  );
}
