'use client';
import { useRef, useState } from 'react';
import { Loader2, Paperclip, Plus, Star, X } from 'lucide-react';
import { Card, EmptyState, Field, Modal, Pagination, StatusBadge, ErrorState, Skeleton } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { AttachmentLinks, CATEGORIES, STATUSES, type FeedbackRow } from './shared';
import { useList } from '@/hooks/use-list';
import { useUserEvents } from '@/hooks/use-user-live';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { ago, cn, fmtDateTime, humanize } from '@/lib/utils';

interface Att { id: string; name: string }

function Compose({ base, mode, open, onClose, onSaved }: { base: string; mode: 'client' | 'vendor'; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState('REQUEST');
  const [category, setCategory] = useState('General');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [rating, setRating] = useState(0);
  const [files, setFiles] = useState<Att[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const attach = async (f?: File) => {
    if (!f) return;
    if (f.size > 15 * 1048576) { notify.err(new Error('File exceeds 15 MB limit')); return; }
    setUploading(true);
    try { const fd = new FormData(); fd.append('file', f); const r = await api.upload<Att>(`${base}/attachments`, fd); setFiles((p) => [...p, r.data]); } catch (e) { notify.err(e); } finally { setUploading(false); if (pick.current) pick.current.value = ''; }
  };
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(base, { kind: mode === 'client' ? kind : undefined, category, subject: subject.trim(), body: body.trim(), rating: kind === 'FEEDBACK' && rating ? rating : undefined, attachmentDocumentIds: files.map((f) => f.id) });
      notify.ok(mode === 'vendor' ? 'Support ticket raised' : 'Sent to your planner'); setSubject(''); setBody(''); setFiles([]); setRating(0); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={mode === 'vendor' ? 'Raise a support ticket' : 'New request or feedback'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || subject.trim().length < 2 || body.trim().length < 2} onClick={submit}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Submit</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {mode === 'client' && <Field label="Type"><Select value={kind} onChange={setKind} options={[{ v: 'REQUEST', l: 'Request' }, { v: 'FEEDBACK', l: 'Feedback' }]} /></Field>}
          <Field label="Category"><Select value={category} onChange={setCategory} options={CATEGORIES} /></Field>
        </div>
        <Field label="Subject"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} /></Field>
        <Field label="Details"><textarea className="input min-h-[110px] py-2" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} /></Field>
        {kind === 'FEEDBACK' && mode === 'client' && (
          <Field label="Rating"><div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)}><Star className={cn('h-6 w-6', n <= rating ? 'fill-gold text-gold' : 'text-line')} /></button>)}</div></Field>
        )}
        <div>
          <input ref={pick} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(e) => attach(e.target.files?.[0])} />
          <button type="button" className="btn-secondary btn-sm" disabled={uploading || files.length >= 5} onClick={() => pick.current?.click()}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}Attach file</button>
          <div className="flex flex-wrap gap-2 mt-2">{files.map((f) => <span key={f.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs">{f.name}<button aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}><X className="h-3.5 w-3.5" /></button></span>)}</div>
        </div>
      </div>
    </Modal>
  );
}

/** Portal view: submit a request / support ticket and track "my requests" with the planner's reply. */
export function RequestsPanel({ base, mode }: { base: string; mode: 'client' | 'vendor' }) {
  const [status, setStatus] = useState('');
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<FeedbackRow | null>(null);
  const list = useList<FeedbackRow>(base, { status: status || undefined }, 10);
  useUserEvents(['feedback.updated'], () => list.reload());
  const noun = mode === 'vendor' ? 'ticket' : 'request';

  return (
    <>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <Select className="w-44" value={status} onChange={(v) => { setStatus(v); list.setPage(1); }} options={STATUSES} placeholder="All statuses" />
          <button className="btn-primary ml-auto" onClick={() => setComposing(true)}><Plus className="h-4 w-4" />{mode === 'vendor' ? 'Raise ticket' : 'New request'}</button>
        </div>
        {list.loading ? <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
          : list.rows.length === 0 ? <EmptyState title={`No ${noun}s yet`} hint={mode === 'vendor' ? 'Raise a ticket if you need help with an invoice, schedule or access.' : 'Ask for a change or share feedback. Your planner replies here.'} />
          : <ul>{list.rows.map((r) => (
            <li key={r.id} className="border-b border-line/70 last:border-0">
              <button className="w-full text-left px-5 py-3.5 hover:bg-surface-2/50 flex items-center gap-3" onClick={() => setOpen(r)}>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{r.subject}</p><p className="text-xs text-ink-soft truncate">{[humanize(r.kind), r.category, ago(r.createdAt)].filter(Boolean).join(' · ')}{r.response ? ' · replied' : ''}</p></div>
                <StatusBadge status={r.status} />
              </button>
            </li>
          ))}</ul>}
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      </Card>
      <Compose base={base} mode={mode} open={composing} onClose={() => setComposing(false)} onSaved={list.reload} />
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.subject ?? ''}>
        {open && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={open.status} /><span className="text-xs text-ink-soft">{humanize(open.kind)}{open.category ? ` · ${open.category}` : ''} · {fmtDateTime(open.createdAt)}</span>{open.rating ? <span className="inline-flex items-center gap-0.5">{Array.from({ length: open.rating }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-gold text-gold" />)}</span> : null}</div>
            <p className="whitespace-pre-wrap">{open.body}</p>
            <AttachmentLinks base={base} id={open.id} items={open.attachments} />
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="text-xs font-medium text-ink-soft mb-1">{open.response ? `Reply from ${open.assignedTo?.name ?? 'your planner'}` : 'Awaiting reply'}</p>
              <p className="whitespace-pre-wrap">{open.response ?? 'We have your message and will respond here soon.'}</p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
