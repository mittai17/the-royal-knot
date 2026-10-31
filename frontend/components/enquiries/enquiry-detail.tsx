'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Calendar, MapPin, Phone, Mail, Users, IndianRupee, Loader2 } from 'lucide-react';
import { Modal, StatusBadge, Skeleton, Field, ErrorState } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { useApi } from '@/hooks/use-api';
import { useUsers } from '@/hooks/use-users';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { ENQUIRY_STAGES } from '@/lib/enums';
import { ago, fmtDate, humanize, inr, toInputDate } from '@/lib/utils';
import type { Enquiry } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';

export function EnquiryDetail({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const { data: e, loading, error, reload } = useApi<Enquiry>(id ? `/enquiries/${id}` : null);
  const { users } = useUsers();
  const [note, setNote] = useState('');
  const [converting, setConverting] = useState(false);
  const [conv, setConv] = useState({ name: '', venue: '', startDate: '', endDate: '', contractValue: '' });
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>, msg: string) => {
    if (!id) return;
    try { await api.patch(`/enquiries/${id}`, body); notify.ok(msg); reload(); onChanged(); } catch (err) { notify.err(err); }
  };
  const addNote = async () => {
    if (!id || !note.trim()) return;
    try { await api.post(`/enquiries/${id}/activities`, { message: note.trim() }); setNote(''); reload(); } catch (err) { notify.err(err); }
  };
  const convert = async () => {
    if (!id || !e) return;
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>(`/enquiries/${id}/convert`, {
        name: conv.name || `${e.couple.groomName.split(' ').pop()} Wedding`, venue: conv.venue || undefined,
        startDate: conv.startDate || toInputDate(e.preferredDate) || undefined, endDate: conv.endDate || conv.startDate || toInputDate(e.preferredDate) || undefined,
        contractValue: conv.contractValue ? Number(conv.contractValue) : e.budget ? Number(e.budget) : undefined,
      });
      notify.ok('Wedding workspace created'); onChanged(); router.push(`/weddings/${r.data.id}`);
    } catch (err) { notify.err(err); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!id} onClose={() => { setConverting(false); onClose(); }} title={e ? `${e.couple.brideName} & ${e.couple.groomName}` : 'Enquiry'} side width="max-w-xl">
      {loading && <div className="space-y-3"><Skeleton className="h-6" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>}
      {error && <ErrorState message={error} onRetry={reload} />}
      {e && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 flex-wrap"><StatusBadge status={e.stage} /><span className="text-xs text-ink-soft">via {humanize(e.source)} · {ago(e.createdAt)}</span></div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div className="flex gap-2"><Calendar className="h-4 w-4 text-ink-soft mt-0.5" />{fmtDate(e.preferredDate)}</div>
            <div className="flex gap-2"><MapPin className="h-4 w-4 text-ink-soft mt-0.5" />{e.location ?? '—'}</div>
            <div className="flex gap-2"><Users className="h-4 w-4 text-ink-soft mt-0.5" />{e.guestCount ?? '—'} guests</div>
            <div className="flex gap-2"><IndianRupee className="h-4 w-4 text-ink-soft mt-0.5" />{e.budget ? inr(e.budget) : '—'}</div>
            <div className="flex gap-2"><Phone className="h-4 w-4 text-ink-soft mt-0.5" />{e.couple.phone ?? '—'}</div>
            <div className="flex gap-2 min-w-0"><Mail className="h-4 w-4 text-ink-soft mt-0.5 shrink-0" /><span className="truncate">{e.couple.email ?? '—'}</span></div>
            <div className="col-span-2 text-ink-soft">Theme: <span className="text-ink">{e.theme ?? '—'}</span> · Package: <span className="text-ink">{humanize(e.packageType)}</span></div>
          </dl>
          {e.notes && <p className="text-sm bg-surface-2 rounded-lg p-3">{e.notes}</p>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Stage"><Select value={e.stage} onChange={(v) => patch({ stage: v }, 'Stage updated')} options={ENQUIRY_STAGES} /></Field>
            <Field label="Assigned planner"><Select value={e.assignedTo?.id ?? ''} onChange={(v) => patch({ assignedToId: v || null }, 'Planner assigned')} options={users.map((u) => ({ v: u.id, l: u.name }))} placeholder="Unassigned" /></Field>
            <Field label="Follow-up date"><input className="input" type="date" defaultValue={toInputDate(e.followUpAt)} onBlur={(ev) => ev.target.value !== toInputDate(e.followUpAt) && patch({ followUpAt: ev.target.value || null }, 'Follow-up scheduled')} /></Field>
          </div>

          {e.convertedWeddingId ? (
            <button className="btn-secondary w-full" onClick={() => router.push(`/weddings/${e.convertedWeddingId}`)}>Open wedding workspace</button>
          ) : converting ? (
            <div className="rounded-xl border border-line p-4 space-y-3">
              <p className="font-medium text-sm">Convert to wedding</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Wedding name" className="col-span-2"><input className="input" value={conv.name} placeholder={`${e.couple.groomName.split(' ').pop()} Wedding`} onChange={(ev) => setConv({ ...conv, name: ev.target.value })} /></Field>
                <Field label="Venue" className="col-span-2"><input className="input" value={conv.venue} onChange={(ev) => setConv({ ...conv, venue: ev.target.value })} /></Field>
                <Field label="Start date"><input className="input" type="date" value={conv.startDate || toInputDate(e.preferredDate)} onChange={(ev) => setConv({ ...conv, startDate: ev.target.value })} /></Field>
                <Field label="End date"><input className="input" type="date" value={conv.endDate} onChange={(ev) => setConv({ ...conv, endDate: ev.target.value })} /></Field>
                <Field label="Contract value (₹)" className="col-span-2"><input className="input" type="number" value={conv.contractValue} placeholder={e.budget ? String(Number(e.budget)) : ''} onChange={(ev) => setConv({ ...conv, contractValue: ev.target.value })} /></Field>
              </div>
              <div className="flex gap-2 justify-end"><button className="btn-secondary btn-sm" onClick={() => setConverting(false)}>Cancel</button><button className="btn-primary btn-sm" disabled={busy} onClick={convert}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Create wedding</button></div>
            </div>
          ) : (
            <Can roles={G.CRM}><button className="btn-primary w-full" onClick={() => setConverting(true)} disabled={e.stage === 'LOST'}><ArrowRightLeft className="h-4 w-4" />Convert to wedding</button></Can>
          )}

          <div>
            <h3 className="font-serif text-lg mb-3">Activity history</h3>
            <div className="flex gap-2 mb-4"><input className="input" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Log a call, message or meeting…" onKeyDown={(ev) => ev.key === 'Enter' && addNote()} /><button className="btn-secondary" onClick={addNote}>Add</button></div>
            <ol className="space-y-3 border-l border-line ml-1.5">
              {(e.activities ?? []).map((a) => (
                <li key={a.id} className="pl-4 relative"><span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" /><p className="text-sm">{a.message}</p><p className="text-xs text-ink-soft">{ago(a.createdAt)}</p></li>
              ))}
              {!(e.activities ?? []).length && <li className="pl-4 text-sm text-ink-soft">No activity recorded yet.</li>}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}
