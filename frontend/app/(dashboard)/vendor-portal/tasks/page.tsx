'use client';
import { useState } from 'react';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Segmented } from '@/components/shared/form-bits';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDate, humanize } from '@/lib/utils';

interface Task { id: string; name: string; description: string; category: string; priority: string; status: string; dueDate: string; completedAt?: string | null; evidenceNote?: string | null; wedding: { name: string }; overdue: boolean }
type View = 'open' | 'done';
const STATUSES = ['IN_PROGRESS', 'BLOCKED', 'DONE'];

export default function Page() {
  const [view, setView] = useState<View>('open');
  const q = useApi<Task[]>('/portal/vendor/tasks');
  const update = async (t: Task, status: string) => {
    let evidenceNote: string | undefined;
    if (status === 'DONE' || status === 'BLOCKED') { const n = prompt(status === 'DONE' ? 'Add a completion note (optional)' : 'What is blocking this?', t.evidenceNote ?? ''); if (n === null) return; evidenceNote = n || undefined; }
    try { await api.patch(`/portal/vendor/tasks/${t.id}`, { status, evidenceNote }); notify.ok('Task updated'); q.reload(); } catch (e) { notify.err(e); }
  };
  return (
    <div>
      <PageHeader title="Tasks & Action Items" subtitle="Work assigned to you by the planning team." actions={<Segmented<View> value={view} onChange={setView} options={[{ v: 'open', l: 'Open' }, { v: 'done', l: 'Completed' }]} />} />
      <Async q={q}>
        {(rows) => {
          const list = rows.filter((t) => (t.status === 'DONE') === (view === 'done'));
          if (!list.length) return <Card><EmptyState title={view === 'open' ? 'You are all caught up' : 'No completed tasks yet'} hint="New action items from your planner will appear here." /></Card>;
          return (
            <Card pad={false}>
              <div className="overflow-x-auto"><table className="w-full min-w-[780px] dt"><thead><tr><th className="th">Task</th><th className="th">Wedding</th><th className="th">Due</th><th className="th">Priority</th><th className="th">Status</th></tr></thead>
                <tbody>{list.map((t) => (
                  <tr key={t.id}><td className="td"><p className="font-medium">{t.name}</p><p className="text-xs text-ink-soft max-w-md">{t.description}</p>{t.evidenceNote && <p className="text-xs text-info mt-0.5">Note: {t.evidenceNote}</p>}</td>
                    <td className="td">{t.wedding.name}</td><td className={`td whitespace-nowrap ${t.overdue ? 'text-danger font-medium' : ''}`}>{fmtDate(t.dueDate)}{t.overdue && ' · overdue'}</td><td className="td"><StatusBadge status={t.priority} /></td>
                    <td className="td">{t.status === 'DONE' ? <StatusBadge status={t.status} /> : (
                      <select aria-label={`Status of ${t.name}`} className="text-xs rounded-md border border-line bg-white h-8 px-2" value={STATUSES.includes(t.status) ? t.status : ''} onChange={(e) => e.target.value && update(t, e.target.value)}>
                        {!STATUSES.includes(t.status) && <option value="">{humanize(t.status)}</option>}{STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                      </select>)}</td></tr>
                ))}</tbody></table></div>
            </Card>
          );
        }}
      </Async>
    </div>
  );
}
