'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { api, apiUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/toast';
import { cn, fmtDateTime, humanize } from '@/lib/utils';
import type { ChatAttachment, ChatMessage, MessageEvent } from '@/hooks/use-chat-live';

const sizeOf = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const MAX_MB = 15;

function Bubble({ m, mine, base }: { m: ChatMessage; mine: boolean; base: string }) {
  return (
    <div className={cn('flex gap-2.5 max-w-[88%]', mine ? 'ml-auto flex-row-reverse' : '')}>
      <Avatar name={m.sender.name} size={30} />
      <div className={cn('min-w-0', mine ? 'items-end text-right' : '')}>
        <p className="text-[11px] text-ink-soft mb-1">{mine ? 'You' : m.sender.name} <span className="opacity-70">· {humanize(m.sender.role)} · {fmtDateTime(m.createdAt)}</span></p>
        <div className={cn('rounded-2xl px-3.5 py-2 text-sm text-left whitespace-pre-wrap break-words', mine ? 'bg-burgundy text-white rounded-tr-sm' : 'bg-surface-2 rounded-tl-sm')}>
          {m.body}
          {m.attachments.length > 0 && (
            <div className={cn('flex flex-col gap-1.5', m.body && 'mt-2')}>
              {m.attachments.map((a) => (
                <a key={a.id} href={apiUrl(`${base}/attachments/${a.id}`)} target="_blank" rel="noreferrer" className={cn('flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs', mine ? 'bg-white/15 hover:bg-white/25' : 'bg-white hover:bg-white/70')}>
                  <FileText className="h-4 w-4 shrink-0" /><span className="truncate">{a.name}</span><span className="opacity-70 shrink-0">{sizeOf(a.size)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** One conversation. `base` is `<prefix>/threads/<id>`; the same sub-routes exist for staff and both portals. */
export function ChatWindow({ base, threadId, title, subtitle, live, onActivity, onBack }: {
  base: string; threadId: string; title: string; subtitle?: string; live: MessageEvent | null; onActivity?: () => void; onBack?: () => void;
}) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // onActivity reloads the thread list, which re-creates the parent's callback; keep it in a ref so it never retriggers load().
  const activityRef = useRef(onActivity); activityRef.current = onActivity;
  const markRead = useCallback(() => { api.post(`${base}/read`).then(() => activityRef.current?.()).catch(() => undefined); }, [base]);

  const load = useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) { setLoading(true); setError(null); }
    try {
      const r = await api.get<ChatMessage[]>(`${base}/messages`, { take: 100 });
      if (id !== seq.current) return;
      setMsgs(r.data); setLoading(false); markRead();
    } catch (e) { if (id === seq.current) { setError(e instanceof Error ? e.message : 'Could not load messages'); setLoading(false); } }
  }, [base, markRead]);

  useEffect(() => { setMsgs([]); setFiles([]); setText(''); void load(); }, [load]);

  // live push: persisted server-side first, so it is safe to append and dedupe by id
  useEffect(() => {
    if (!live || live.threadId !== threadId) return;
    setMsgs((p) => (p.some((m) => m.id === live.message.id) ? p : [...p, live.message]));
    if (live.message.senderId !== user?.id) markRead();
  }, [live, threadId, user?.id, markRead]);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, loading]);

  const upload = async (f?: File) => {
    if (!f) return;
    if (f.size > MAX_MB * 1048576) { notify.err(new Error(`File exceeds ${MAX_MB} MB limit`)); return; }
    setUploading(true);
    try { const fd = new FormData(); fd.append('file', f); const r = await api.upload<ChatAttachment>(`${base}/attachments`, fd); setFiles((p) => [...p, r.data]); } catch (e) { notify.err(e); } finally { setUploading(false); if (pick.current) pick.current.value = ''; }
  };

  const send = async () => {
    if (busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    try {
      const r = await api.post<ChatMessage>(`${base}/messages`, { body: text.trim(), attachmentDocumentIds: files.map((f) => f.id) });
      setMsgs((p) => (p.some((m) => m.id === r.data.id) ? p : [...p, r.data]));
      setText(''); setFiles([]); onActivity?.();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="px-4 py-3 border-b border-line flex items-center gap-3">
        {onBack && <button className="btn-ghost btn-sm !px-2 md:hidden" onClick={onBack} aria-label="Back to conversations">←</button>}
        <div className="min-w-0"><p className="font-medium truncate">{title}</p>{subtitle && <p className="text-xs text-ink-soft truncate">{subtitle}</p>}</div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4" aria-live="polite">
        {loading ? <div className="space-y-4"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-12 w-1/2 ml-auto" /><Skeleton className="h-12 w-2/3" /></div>
          : error ? <ErrorState message={error} onRetry={() => load()} />
          : msgs.length === 0 ? <EmptyState title="No messages yet" hint="Say hello to start the conversation." />
          : msgs.map((m) => <Bubble key={m.id} m={m} mine={m.senderId === user?.id} base={base} />)}
        <div ref={end} />
      </div>
      <footer className="border-t border-line p-3">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {files.map((f) => <span key={f.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs"><FileText className="h-3.5 w-3.5" />{f.name}<button aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}><X className="h-3.5 w-3.5" /></button></span>)}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={pick} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(e) => upload(e.target.files?.[0])} />
          <button className="btn-ghost !px-2.5" onClick={() => pick.current?.click()} disabled={uploading || files.length >= 5} aria-label="Attach a file">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}</button>
          <textarea className="input !h-auto min-h-[40px] max-h-32 py-2 resize-none" rows={1} value={text} placeholder="Write a message…" aria-label="Message" maxLength={4000}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <button className="btn-primary" onClick={send} disabled={busy || (!text.trim() && !files.length)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}<span className="hidden sm:inline">Send</span></button>
        </div>
      </footer>
    </div>
  );
}
