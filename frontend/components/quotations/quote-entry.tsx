'use client';
import { useFieldArray, useForm } from 'react-hook-form';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Field, Modal } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { calcTotals } from '@/lib/quotes';
import { inr, toNum } from '@/lib/utils';
import type { QuoteTarget } from '@/types';

interface Line { name: string; description: string; quantity: string; unit: string; unitPrice: string; taxRate: string; additionalCharge: string; included: boolean }
interface Form { menu: string; guests: string; guestCapacity: string; extraHourCharge: string; rating: string; notes: string; items: Line[] }
const blank: Line = { name: '', description: '', quantity: '1', unit: 'unit', unitPrice: '0', taxRate: '18', additionalCharge: '0', included: true };

export function QuoteEntryModal({ request, onClose, onSaved }: { request: QuoteTarget | null; onClose: () => void; onSaved: () => void }) {
  const isCatering = request?.category === 'CATERING';
  const q = request?.quote;
  const { register, control, handleSubmit, watch, formState: { isSubmitting } } = useForm<Form>({
    values: {
      menu: q?.menu ?? '', guests: q?.guests ? String(q.guests) : isCatering && request ? String(request.expectedGuests) : '', guestCapacity: q?.guestCapacity ? String(q.guestCapacity) : '', extraHourCharge: q?.extraHourCharge ? String(Number(q.extraHourCharge)) : '', rating: q ? String(q.vendor.rating) : '', notes: q?.notes ?? '',
      items: q?.items.length ? q.items.map((i) => ({ name: i.name, description: i.description ?? '', quantity: String(Number(i.quantity)), unit: i.unit, unitPrice: String(Number(i.unitPrice)), taxRate: String(Number(i.taxRate)), additionalCharge: String(Number(i.additionalCharge)), included: i.included })) : [isCatering ? { ...blank, name: 'Catering per plate', unit: 'plate' } : blank],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items') ?? [];
  const guests = toNum(watch('guests')) || null;
  const t = calcTotals(items.map((i) => ({ ...i, quantity: toNum(i.quantity), unitPrice: toNum(i.unitPrice), taxRate: toNum(i.taxRate), additionalCharge: toNum(i.additionalCharge) })), guests);

  const submit = async (v: Form) => {
    if (!request) return;
    try {
      await api.post(`/quotations/requests/${request.requestId}/quotation`, {
        menu: v.menu || undefined, guests: v.guests ? Number(v.guests) : undefined, guestCapacity: v.guestCapacity ? Number(v.guestCapacity) : undefined,
        extraHourCharge: v.extraHourCharge ? Number(v.extraHourCharge) : undefined, rating: v.rating ? Number(v.rating) : undefined, notes: v.notes || undefined,
        items: v.items.map((i) => ({ name: i.name, description: i.description || undefined, quantity: Number(i.quantity), unit: i.unit, unitPrice: Number(i.unitPrice), taxRate: Number(i.taxRate), additionalCharge: Number(i.additionalCharge), included: i.included })),
      });
      notify.ok('Quotation saved'); onSaved(); onClose();
    } catch (e) { notify.err(e); }
  };

  return (
    <Modal open={!!request} onClose={onClose} title={request ? `Quotation · ${request.vendorName}` : ''} width="max-w-4xl"
      footer={<><div className="mr-auto text-sm"><span className="text-ink-soft">Grand total </span><span className="num text-lg">{inr(t.grand)}</span>{t.perPlate && <span className="text-ink-soft"> · {inr(t.perPlate)}/plate</span>}</div><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" form="quote-form" disabled={isSubmitting}>{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}Save quotation</button></>}>
      <form id="quote-form" onSubmit={handleSubmit(submit)} className="space-y-5">
        {isCatering && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Menu" className="col-span-2 md:col-span-4"><input className="input" placeholder="Rajasthani thali, live counters…" {...register('menu')} /></Field>
            <Field label="Guests quoted"><input className="input" type="number" {...register('guests')} /></Field>
            <Field label="Guest capacity"><input className="input" type="number" {...register('guestCapacity')} /></Field>
            <Field label="Extra-hour charge (₹)"><input className="input" type="number" {...register('extraHourCharge')} /></Field>
            <Field label="Rating (1–5)"><input className="input" type="number" min={1} max={5} {...register('rating')} /></Field>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-ink-soft"><th className="pb-2 pr-2">Item</th><th className="pb-2 pr-2 w-20">Qty</th><th className="pb-2 pr-2 w-24">Unit</th><th className="pb-2 pr-2 w-28">Unit price</th><th className="pb-2 pr-2 w-20">Tax %</th><th className="pb-2 pr-2 w-28">Extra ₹</th><th className="pb-2 pr-2 w-16">Incl.</th><th className="pb-2 w-8" /></tr></thead>
            <tbody>
              {fields.map((f, idx) => (
                <tr key={f.id} className="align-top"><td className="pr-2 pb-2"><input className="input" placeholder="Item name" {...register(`items.${idx}.name`, { required: true })} /><input className="input mt-1 h-8 text-xs" placeholder="Description (optional)" {...register(`items.${idx}.description`)} /></td>
                  <td className="pr-2"><input className="input" type="number" step="any" {...register(`items.${idx}.quantity`)} /></td><td className="pr-2"><input className="input" {...register(`items.${idx}.unit`)} /></td>
                  <td className="pr-2"><input className="input" type="number" step="any" {...register(`items.${idx}.unitPrice`)} /></td><td className="pr-2"><input className="input" type="number" step="any" {...register(`items.${idx}.taxRate`)} /></td>
                  <td className="pr-2"><input className="input" type="number" step="any" {...register(`items.${idx}.additionalCharge`)} /></td>
                  <td className="pr-2 pt-2.5"><input type="checkbox" className="h-4 w-4 accent-[#401827]" aria-label="Included in package" {...register(`items.${idx}.included`)} /></td>
                  <td className="pt-1"><button type="button" className="btn-ghost btn-sm !px-2" onClick={() => remove(idx)} disabled={fields.length === 1} aria-label="Remove line"><Trash2 className="h-4 w-4" /></button></td></tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn-secondary btn-sm mt-1" onClick={() => append(blank)}><Plus className="h-4 w-4" />Add line</button>
        </div>
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-4 text-sm">
          <div><p className="text-xs text-ink-soft">Subtotal</p><p className="num">{inr(t.subtotal)}</p></div><div><p className="text-xs text-ink-soft">Taxes</p><p className="num">{inr(t.tax)}</p></div><div><p className="text-xs text-ink-soft">Additional charges</p><p className="num">{inr(t.extra)}</p></div>
        </div>
        <Field label="Notes / exclusions"><textarea className="input min-h-[60px]" {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}
