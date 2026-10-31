'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Field, Modal } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { useApi, asRows } from '@/hooks/use-api';
import { useUsers } from '@/hooks/use-users';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import type { Vendor, Wedding } from '@/types';

const TITLE: Record<string, string> = { CLIENT: 'New client conversation', VENDOR: 'New vendor conversation', TEAM: 'New team chat', PLANNER: 'New planner / finance conversation' };

export function NewThreadModal({ open, channel, onClose, onCreated }: { open: boolean; channel: string; onClose: () => void; onCreated: (id: string) => void }) {
  const weddings = asRows<Wedding>(useApi<unknown>(open && (channel === 'CLIENT' || channel === 'VENDOR') ? '/weddings' : null, { pageSize: 100 }).data);
  const vendors = asRows<Vendor>(useApi<unknown>(open && channel === 'VENDOR' ? '/vendors' : null, { pageSize: 200 }).data);
  const { users } = useUsers();
  const [subject, setSubject] = useState('');
  const [weddingId, setWeddingId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const needsWedding = channel === 'CLIENT';
  const needsVendor = channel === 'VENDOR';
  const valid = subject.trim().length >= 2 && (!needsWedding || weddingId) && (!needsVendor || vendorId);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>('/messaging/threads', { channel, subject: subject.trim(), weddingId: weddingId || undefined, vendorId: vendorId || undefined, memberIds: members });
      notify.ok('Conversation started'); setSubject(''); setWeddingId(''); setVendorId(''); setMembers([]); onCreated(r.data.id);
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={TITLE[channel] ?? 'New conversation'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!valid || busy} onClick={create}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Start</button></>}>
      <div className="space-y-4">
        <Field label="Subject"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={channel === 'CLIENT' ? 'e.g. Mehendi timing' : 'e.g. Weekly sync'} maxLength={160} /></Field>
        {(needsWedding || needsVendor) && <Field label={needsWedding ? 'Wedding (the couple is added automatically)' : 'Wedding (optional)'}><Select value={weddingId} onChange={setWeddingId} options={weddings.map((w) => ({ v: w.id, l: w.name }))} placeholder="Choose wedding…" /></Field>}
        {needsVendor && <Field label="Vendor"><Select value={vendorId} onChange={setVendorId} options={vendors.map((v) => ({ v: v.id, l: v.name }))} placeholder="Choose vendor…" /></Field>}
        {!needsWedding && !needsVendor && (
          <div><p className="label">Add people <span className="font-normal">(optional, they get unread counts)</span></p>
            <div className="max-h-40 overflow-y-auto grid grid-cols-2 gap-x-4 gap-y-2">{users.filter((u) => u.role !== 'CLIENT' && u.role !== 'VENDOR').map((u) => <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#401827]" checked={members.includes(u.id)} onChange={() => setMembers((p) => p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id])} /><span className="truncate">{u.name}</span></label>)}</div></div>
        )}
      </div>
    </Modal>
  );
}
