'use client';
import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { Field, Modal, StatusBadge } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { useUsers } from '@/hooks/use-users';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { PRIORITIES, TASK_STATUSES } from '@/lib/enums';
import { fmtDate, humanize, toInputDate } from '@/lib/utils';
import type { Task } from '@/types';

export function TaskDetail({ task, all, onClose, onSaved }: { task: Task | null; all: Task[]; onClose: () => void; onSaved: () => void }) {
  const { users } = useUsers();
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState('');
  const patch = async (body: Record<string, unknown>, msg = 'Task updated') => {
    if (!task) return;
    setBusy(true);
    try { await api.patch(`/tasks/${task.id}`, body); notify.ok(msg); onSaved(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  const blockers = (task?.dependsOn ?? []).map((d) => all.find((t) => t.id === d.dependsOnId)).filter((t): t is Task => !!t && t.status !== 'COMPLETED');

  return (
    <Modal open={!!task} onClose={onClose} title={task?.name ?? ''} side width="max-w-lg">
      {task && (
        <div className="space-y-5">
          <p className="text-sm text-ink-soft">{task.description}</p>
          <div className="flex flex-wrap gap-2"><StatusBadge status={task.category} tone="gold" /><StatusBadge status={task.priority} />{task.event && <StatusBadge status={task.event.name} tone="info" />}</div>
          {blockers.length > 0 && <div className="rounded-lg bg-warning-soft p-3 text-sm text-[#8A5A12]"><p className="font-medium flex items-center gap-1.5"><Link2 className="h-4 w-4" />Waiting on {blockers.length} dependenc{blockers.length > 1 ? 'ies' : 'y'}</p><ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b.id}>{b.name}</li>)}</ul></div>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status"><Select value={task.status} onChange={(v) => patch({ status: v }, `Moved to ${humanize(v)}`)} options={TASK_STATUSES} /></Field>
            <Field label="Priority"><Select value={task.priority} onChange={(v) => patch({ priority: v })} options={PRIORITIES} /></Field>
            <Field label="Owner"><Select value={task.owner?.id ?? task.ownerId ?? ''} onChange={(v) => patch({ ownerId: v || null }, 'Owner assigned')} options={users.map((u) => ({ v: u.id, l: u.name }))} placeholder="Unassigned" /></Field>
            <Field label="Due date"><input className="input" type="date" defaultValue={toInputDate(task.dueDate)} onBlur={(e) => e.target.value && e.target.value !== toInputDate(task.dueDate) && patch({ dueDate: e.target.value }, 'Due date changed')} /></Field>
          </div>
          <p className="text-xs text-ink-soft">Vendor: {task.weddingVendor?.vendor?.name ?? '—'} · Due {fmtDate(task.dueDate)}{task.completedAt ? ` · Completed ${fmtDate(task.completedAt)}` : ''}</p>
          <Field label="Completion evidence"><textarea className="input min-h-[72px]" defaultValue={task.evidenceNote ?? ''} onChange={(e) => setEvidence(e.target.value)} placeholder="Link, confirmation note or what was delivered…" /></Field>
          <div className="flex justify-end gap-2"><button className="btn-secondary" disabled={busy} onClick={() => patch({ evidenceNote: evidence }, 'Evidence saved')}>Save evidence</button><button className="btn-primary" disabled={busy || task.status === 'COMPLETED'} onClick={() => patch({ status: 'COMPLETED', evidenceNote: evidence || task.evidenceNote || undefined }, 'Task completed')}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Mark complete</button></div>
        </div>
      )}
    </Modal>
  );
}
