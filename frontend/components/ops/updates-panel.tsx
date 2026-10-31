'use client';
import { useCallback, useRef, useState } from 'react';
import { ClipboardList, FileText, ImagePlus, Loader2, Send, X } from 'lucide-react';
import { Card, EmptyState, Field, StatCard, StatusBadge } from '@/components/ui/primitives';
import { Segmented, Select } from '@/components/shared/form-bits';
import { useApi, asRows } from '@/hooks/use-api';
import { api, apiUrl } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDateTime } from '@/lib/utils';
import { Async } from './shared';
import type { EventFunction, FieldReport } from './types';

type Kind = 'DAILY' | 'TASK' | 'EVENT';
const LABEL: Record<Kind, string> = { DAILY: 'Daily progress', TASK: 'Task report', EVENT: 'Event report' };

function ReportForm({ weddingId, onSaved }: { weddingId: string; onSaved: () => void }) {
  const [kind, setKind] = useState<Kind>('DAILY');
  const tasks = useApi<unknown>(kind === 'TASK' ? '/tasks' : null, { weddingId, mine: true, pageSize: 100 });
  const fns = useApi<EventFunction[]>(kind === 'EVENT' ? '/events/functions' : null, { weddingId });
  const blank = { title: '', summary: '', progress: '50', issues: '', nextSteps: '', taskId: '', functionId: '', attendance: '' };
  const [f, setF] = useState(blank);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      const photoIds: string[] = [];
      for (const file of files) {
        const form = new FormData(); form.append('weddingId', weddingId); form.append('file', file);
        photoIds.push((await api.upload<{ id: string }>('/checklists/updates/photos', form)).data.id);
      }
      await api.post('/checklists/updates', {
        type: kind, weddingId, title: f.title, summary: f.summary, issues: f.issues || undefined, nextSteps: f.nextSteps || undefined, photoIds: photoIds.length ? photoIds : undefined,
        ...(kind === 'DAILY' ? { progress: Number(f.progress) } : {}), ...(kind === 'TASK' && f.taskId ? { taskId: f.taskId } : {}),
        ...(kind === 'EVENT' ? { functionId: f.functionId || undefined, attendance: f.attendance ? Number(f.attendance) : undefined } : {}),
      });
      notify.ok(`${LABEL[kind]} submitted`); setF(blank); setFiles([]); onSaved();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Card title="Submit an update">
      <div className="space-y-4">
        <Segmented<Kind> value={kind} onChange={setKind} options={[{ v: 'DAILY', l: 'Daily update' }, { v: 'TASK', l: 'Task report' }, { v: 'EVENT', l: 'Event report' }]} />
        {kind === 'TASK' && <Field label="Task"><Select value={f.taskId} onChange={(v) => { set('taskId', v); const t = asRows<{ id: string; name: string }>(tasks.data).find((x) => x.id === v); if (t && !f.title) set('title', t.name); }} options={asRows<{ id: string; name: string }>(tasks.data).map((t) => ({ v: t.id, l: t.name }))} placeholder={tasks.loading ? 'Loading your tasks…' : 'Select one of your tasks'} /></Field>}
        {kind === 'EVENT' && <Field label="Function"><Select value={f.functionId} onChange={(v) => { set('functionId', v); const x = fns.data?.find((y) => y.id === v); if (x && !f.title) set('title', `${x.name} report`); }} options={(fns.data ?? []).map((x) => ({ v: x.id, l: x.name }))} placeholder={fns.loading ? 'Loading…' : 'Select function'} /></Field>}
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Summary"><textarea className="input min-h-[96px]" placeholder="What was done, what was observed…" value={f.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
        {kind === 'DAILY' && <Field label={`Overall progress: ${f.progress}%`}><input type="range" min={0} max={100} step={5} className="w-full" value={f.progress} onChange={(e) => set('progress', e.target.value)} /></Field>}
        {kind === 'EVENT' && <Field label="Attendance"><input className="input" type="number" min={0} value={f.attendance} onChange={(e) => set('attendance', e.target.value)} /></Field>}
        <div className="grid sm:grid-cols-2 gap-4"><Field label="Issues"><input className="input" value={f.issues} onChange={(e) => set('issues', e.target.value)} /></Field><Field label="Next steps"><input className="input" value={f.nextSteps} onChange={(e) => set('nextSteps', e.target.value)} /></Field></div>
        <div>
          <p className="label">Photos</p>
          <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, 10)); e.target.value = ''; }} />
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" className="btn-secondary btn-sm" onClick={() => input.current?.click()}><ImagePlus className="h-4 w-4" />Add photos</button>
            {files.map((file, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs max-w-[12rem]"><span className="truncate">{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button></span>)}
          </div>
        </div>
        <div className="flex justify-end"><button className="btn-primary" disabled={busy || f.title.trim().length < 2 || f.summary.trim().length < 2} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Submit</button></div>
      </div>
    </Card>
  );
}

export function UpdatesPanel({ weddingId }: { weddingId: string }) {
  const [type, setType] = useState('');
  const summary = useApi<{ updatesToday: number; myUpdates: number; myOpenTasks: number; myOverdueTasks: number }>('/checklists/updates/summary');
  const feed = useApi<FieldReport[]>('/checklists/updates', { weddingId, type: type || undefined, limit: 50 });
  const refresh = useCallback(() => { void summary.reload(); void feed.reload(); }, [summary, feed]);
  const s = summary.data;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Updates today" value={s?.updatesToday ?? '—'} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="My updates" value={s?.myUpdates ?? '—'} />
        <StatCard label="My open tasks" value={s?.myOpenTasks ?? '—'} icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="Overdue tasks" value={s?.myOverdueTasks ?? '—'} />
      </div>
      <div className="grid xl:grid-cols-[1fr_1fr] gap-5">
        <ReportForm weddingId={weddingId} onSaved={refresh} />
        <Card title="Recent updates" action={<Select className="!w-40 !h-8 !text-xs" value={type} onChange={setType} options={[{ v: 'DAILY', l: 'Daily updates' }, { v: 'TASK', l: 'Task reports' }, { v: 'EVENT', l: 'Event reports' }]} placeholder="All types" />}>
          <Async loading={feed.loading} error={feed.error} onRetry={feed.reload} hasData={!!feed.data} rows={2}>
            {(feed.data ?? []).length === 0 ? <EmptyState title="No updates yet" hint="Submitted updates for this wedding appear here." /> : (
              <ul className="space-y-3 max-h-[640px] overflow-y-auto pr-1">{feed.data!.map((r) => (
                <li key={r.id} className="rounded-xl border border-line p-3.5">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium flex-1 min-w-0">{r.title}</p><StatusBadge status={r.type} tone="burgundy" />{typeof r.progress === 'number' && <span className="text-xs font-medium">{r.progress}%</span>}</div>
                  <p className="text-sm mt-1.5 whitespace-pre-wrap">{r.summary}</p>
                  {r.issues && <p className="text-xs mt-1.5"><b>Issues:</b> {r.issues}</p>}
                  {r.nextSteps && <p className="text-xs mt-1"><b>Next:</b> {r.nextSteps}</p>}
                  {typeof r.attendance === 'number' && <p className="text-xs mt-1"><b>Attendance:</b> {r.attendance}</p>}
                  {r.photos.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{r.photos.map((p) => <a key={p.id} href={apiUrl(`/documents/${p.id}/download`)} target="_blank" rel="noreferrer"><img src={apiUrl(`/documents/${p.id}/preview`)} alt={p.name} className="h-16 w-16 rounded-lg object-cover border border-line" /></a>)}</div>}
                  <p className="text-xs text-ink-soft mt-2">{r.author?.name ?? 'Unknown'} · {fmtDateTime(r.createdAt)}</p>
                </li>
              ))}</ul>
            )}
          </Async>
        </Card>
      </div>
    </div>
  );
}
