'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Field, Modal } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { Rating } from '@/components/vendors/rating';
import { useApi, asRows } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { VENDOR_CATEGORIES } from '@/lib/enums';
import { useWedding } from '@/lib/wedding-context';
import { humanize } from '@/lib/utils';
import type { Vendor } from '@/types';

export function RequestFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { weddings, selectedId } = useWedding();
  const [weddingId, setWeddingId] = useState('');
  const [category, setCategory] = useState('CATERING');
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const vendors = asRows<Vendor>(useApi<unknown>(open ? '/vendors' : null, { category, pageSize: 100 }).data);
  const wid = weddingId || selectedId || '';

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/quotations/requests', { weddingId: wid, category, title: title || `${humanize(category)} quotation`, brief: brief || undefined, vendorIds: picked });
      notify.ok(`Requested quotations from ${picked.length} vendors`); setPicked([]); setTitle(''); setBrief(''); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request quotations" width="max-w-2xl"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || picked.length < 3 || !wid} onClick={submit}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Send to {picked.length} vendors</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Wedding"><Select value={wid} onChange={setWeddingId} options={weddings.map((w) => ({ v: w.id, l: w.name }))} placeholder="Select wedding" /></Field>
        <Field label="Category"><Select value={category} onChange={(v) => { setCategory(v); setPicked([]); }} options={VENDOR_CATEGORIES} /></Field>
        <Field label="Request title" className="col-span-2"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${humanize(category)} for the wedding`} /></Field>
        <Field label="Brief" className="col-span-2"><textarea className="input min-h-[64px]" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Menu expectations, guest count, hours of service…" /></Field>
      </div>
      <p className="label mt-5">Select at least three vendors <span className="text-ink-soft font-normal">({picked.length} selected)</span></p>
      <ul className="border border-line rounded-xl divide-y divide-line max-h-64 overflow-y-auto">
        {vendors.length === 0 && <li className="p-4 text-sm text-ink-soft">No vendors in this category yet.</li>}
        {vendors.map((v) => (
          <li key={v.id}><label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-2/60"><input type="checkbox" className="h-4 w-4 accent-[#401827]" checked={picked.includes(v.id)} onChange={() => toggle(v.id)} /><span className="flex-1 text-sm">{v.name}<span className="block text-xs text-ink-soft">{v.serviceAreas.join(', ')}</span></span><Rating value={v.rating} /></label></li>
        ))}
      </ul>
    </Modal>
  );
}
