'use client';
import { useParams } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { Card, Field, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { Async, FileLink } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { calcTotals } from '@/lib/quotes';
import { notify } from '@/lib/toast';
import { fmtDate, humanize, inr, toNum } from '@/lib/utils';
import type { Quotation } from '@/types';

interface Detail {
  id: string; title: string; category: string; brief?: string | null; state: string; canSubmit: boolean; createdAt: string;
  wedding: { name: string; location: string; venue?: string | null; startDate: string; endDate: string; expectedGuests: number };
  events: { id: string; name: string; date: string; venue?: string | null; expectedGuests: number }[];
  quotation?: Quotation | null;
}
interface Line { name: string; description: string; quantity: string; unit: string; unitPrice: string; taxRate: string; additionalCharge: string; included: boolean }
interface Form { menu: string; guests: string; guestCapacity: string; extraHourCharge: string; validUntil: string; notes: string; items: Line[] }
const blank: Line = { name: '', description: '', quantity: '1', unit: 'unit', unitPrice: '', taxRate: '18', additionalCharge: '0', included: true };

function QuoteForm({ rfq, onSaved }: { rfq: Detail; onSaved: () => void }) {
  const q = rfq.quotation;
  const catering = rfq.category === 'CATERING';
  const { register, control, handleSubmit, watch, formState: { isSubmitting, errors } } = useForm<Form>({
    defaultValues: {
      menu: q?.menu ?? '', guests: q?.guests ? String(q.guests) : catering ? String(rfq.wedding.expectedGuests) : '', guestCapacity: q?.guestCapacity ? String(q.guestCapacity) : '', extraHourCharge: q?.extraHourCharge ? String(toNum(q.extraHourCharge)) : '',
      validUntil: q?.validUntil ? q.validUntil.slice(0, 10) : '', notes: q?.notes ?? '',
      items: q?.items.length ? q.items.map((i) => ({ name: i.name, description: i.description ?? '', quantity: String(toNum(i.quantity)), unit: i.unit, unitPrice: String(toNum(i.unitPrice)), taxRate: String(toNum(i.taxRate)), additionalCharge: String(toNum(i.additionalCharge)), included: i.included })) : [catering ? { ...blank, name: 'Catering per plate', unit: 'plate', quantity: String(rfq.wedding.expectedGuests) } : blank],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items') ?? [];
  const guests = toNum(watch('guests')) || null;
  const t = calcTotals(items.map((i) => ({ ...i, quantity: toNum(i.quantity), unitPrice: toNum(i.unitPrice), taxRate: toNum(i.taxRate), additionalCharge: toNum(i.additionalCharge) })), catering ? guests : null);

  const submit = async (v: Form) => {
    try {
      await api.post(`/portal/vendor/rfqs/${rfq.id}/quotation`, {
        menu: v.menu || undefined, guests: v.guests ? Number(v.guests) : undefined, guestCapacity: v.guestCapacity ? Number(v.guestCapacity) : undefined, extraHourCharge: v.extraHourCharge ? Number(v.extraHourCharge) : undefined,
        validUntil: v.validUntil || undefined, notes: v.notes || undefined,
        items: v.items.map((i) => ({ name: i.name.trim(), description: i.description || undefined, quantity: Number(i.quantity), unit: i.unit.trim(), unitPrice: Number(i.unitPrice), taxRate: Number(i.taxRate), additionalCharge: Number(i.additionalCharge), included: i.included })),
      });
      notify.ok(q ? 'Quotation updated' : 'Quotation submitted'); onSaved();
    } catch (e) { notify.err(e); }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {catering && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Menu" className="col-span-2 md:col-span-4"><input className="input" placeholder="Menu highlights, live counters…" {...register('menu')} /></Field>
          <Field label="Guests quoted"><input className="input" type="number" min={0} {...register('guests')} /></Field>
          <Field label="Guest capacity"><input className="input" type="number" min={0} {...register('guestCapacity')} /></Field>
          <Field label="Extra-hour charge (₹)"><input className="input" type="number" min={0} {...register('extraHourCharge')} /></Field>
          <Field label="Quote valid until"><input className="input" type="date" {...register('validUntil')} /></Field>
        </div>
      )}
      {!catering && <Field label="Quote valid until" className="max-w-xs"><input className="input" type="date" {...register('validUntil')} /></Field>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-ink-soft"><th className="pb-2 pr-2">Line item</th><th className="pb-2 pr-2 w-20">Qty</th><th className="pb-2 pr-2 w-24">Unit</th><th className="pb-2 pr-2 w-28">Unit price</th><th className="pb-2 pr-2 w-20">Tax %</th><th className="pb-2 pr-2 w-28">Extra ₹</th><th className="pb-2 pr-2 w-16">Incl.</th><th className="pb-2 w-8" /></tr></thead>
          <tbody>
            {fields.map((f, idx) => (
              <tr key={f.id} className="align-top">
                <td className="pr-2 pb-2"><input className="input" placeholder="Item name" aria-invalid={!!errors.items?.[idx]?.name} {...register(`items.${idx}.name`, { required: true })} /><input className="input mt-1 h-8 text-xs" placeholder="Description (optional)" {...register(`items.${idx}.description`)} /></td>
                <td className="pr-2"><input className="input" type="number" step="any" min={0} {...register(`items.${idx}.quantity`, { required: true })} /></td>
                <td className="pr-2"><input className="input" {...register(`items.${idx}.unit`, { required: true })} /></td>
                <td className="pr-2"><input className="input" type="number" step="any" min={0} {...register(`items.${idx}.unitPrice`, { required: true })} /></td>
                <td className="pr-2"><input className="input" type="number" step="any" min={0} max={100} {...register(`items.${idx}.taxRate`)} /></td>
                <td className="pr-2"><input className="input" type="number" step="any" min={0} {...register(`items.${idx}.additionalCharge`)} /></td>
                <td className="pr-2 pt-2.5"><input type="checkbox" className="h-4 w-4 accent-[#401827]" aria-label="Included in package" {...register(`items.${idx}.included`)} /></td>
                <td className="pt-1"><button type="button" className="btn-ghost btn-sm !px-2" onClick={() => remove(idx)} disabled={fields.length === 1} aria-label="Remove line"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn-secondary btn-sm mt-1" onClick={() => append(blank)}><Plus className="h-4 w-4" />Add line</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl bg-surface-2 p-4 text-sm">
        <div><p className="text-xs text-ink-soft">Subtotal</p><p className="num">{inr(t.subtotal)}</p></div><div><p className="text-xs text-ink-soft">Taxes</p><p className="num">{inr(t.tax)}</p></div>
        <div><p className="text-xs text-ink-soft">Additional charges</p><p className="num">{inr(t.extra)}</p></div><div><p className="text-xs text-ink-soft">Grand total</p><p className="num text-lg">{inr(t.grand)}</p>{t.perPlate && <p className="text-xs text-ink-soft">{inr(t.perPlate)}/plate</p>}</div>
      </div>
      <Field label="Notes, inclusions & exclusions"><textarea className="input min-h-[70px]" maxLength={2000} {...register('notes')} /></Field>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-xs text-ink-soft mr-auto">One quotation per RFQ. You can revise it until the client decides.</p>
        <button className="btn-primary" disabled={isSubmitting || t.grand <= 0}>{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}{q ? 'Update quotation' : 'Submit quotation'}</button>
      </div>
    </form>
  );
}

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<Detail>(`/portal/vendor/rfqs/${id}`);
  return (
    <div>
      <PageHeader title="RFQ details" subtitle="Review the requirements and send your quotation." actions={<Link className="btn-secondary" href="/vendor-portal/rfqs"><ArrowLeft className="h-4 w-4" />All RFQs</Link>} />
      <Async q={q}>
        {(d) => (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-3">
              <Card title={d.title} className="lg:col-span-2" action={<StatusBadge status={d.state} tone={d.state === 'NEW' ? 'burgundy' : undefined} />}>
                <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div><dt className="text-xs text-ink-soft">Wedding</dt><dd className="font-medium">{d.wedding.name}</dd></div>
                  <div><dt className="text-xs text-ink-soft">Service</dt><dd className="font-medium">{humanize(d.category)}</dd></div>
                  <div><dt className="text-xs text-ink-soft">Guests</dt><dd className="font-medium">{d.wedding.expectedGuests}</dd></div>
                  <div><dt className="text-xs text-ink-soft">Dates</dt><dd className="font-medium">{fmtDate(d.wedding.startDate, 'dd MMM')} – {fmtDate(d.wedding.endDate)}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-ink-soft">Venue</dt><dd className="font-medium">{d.wedding.venue ?? '—'}, {d.wedding.location}</dd></div>
                </dl>
                {d.brief && <div className="mt-4 rounded-xl bg-surface-2 p-4"><p className="text-xs text-ink-soft mb-1">Requirements</p><p className="text-sm whitespace-pre-wrap">{d.brief}</p></div>}
              </Card>
              <Card title="Events to serve">
                {d.events.length === 0 ? <p className="text-sm text-ink-soft">Events are not scheduled yet.</p> : <ul className="space-y-3">{d.events.map((e) => <li key={e.id} className="text-sm"><p className="font-medium">{e.name}</p><p className="text-xs text-ink-soft">{fmtDate(e.date, 'EEE, dd MMM')} · {e.expectedGuests} guests{e.venue ? ` · ${e.venue}` : ''}</p></li>)}</ul>}
              </Card>
            </div>
            <Card title={d.quotation ? 'Your quotation' : 'Submit quotation'} action={d.quotation ? <FileLink path={`/portal/vendor/quotations/${d.quotation.id}/pdf`} label="PDF" preview /> : undefined}>
              {d.canSubmit ? <QuoteForm key={d.quotation?.id ?? 'new'} rfq={d} onSaved={q.reload} /> : (
                <div className="text-sm"><p className="text-ink-soft mb-3">This RFQ is closed{d.state === 'ACCEPTED' ? ' — your quotation was selected.' : '.'}</p>{d.quotation && <p className="num text-lg">{inr(d.quotation.grandTotal)}</p>}</div>
              )}
            </Card>
          </div>
        )}
      </Async>
    </div>
  );
}
