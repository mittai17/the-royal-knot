'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Field, Modal } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { PACKAGES, SOURCES } from '@/lib/enums';
import { useUsers } from '@/hooks/use-users';

const schema = z.object({
  brideName: z.string().min(1, 'Required'), groomName: z.string().min(1, 'Required'),
  phone: z.string().optional(), email: z.union([z.string().email('Invalid email'), z.literal('')]).optional(),
  preferredDate: z.string().optional(), location: z.string().optional(),
  guestCount: z.string().optional(), budget: z.string().optional(), theme: z.string().optional(),
  packageType: z.string(), source: z.string(), assignedToId: z.string().optional(), followUpAt: z.string().optional(), notes: z.string().optional(),
});
type Form = z.infer<typeof schema>;
const num = (s?: string) => (s && s.trim() !== '' ? Number(s) : undefined);

export function EnquiryFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { users } = useUsers();
  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { packageType: 'FULL_SERVICE', source: 'PHONE' } });

  const submit = async (v: Form) => {
    try {
      await api.post('/enquiries', {
        brideName: v.brideName, groomName: v.groomName, phone: v.phone || undefined, email: v.email || undefined,
        preferredDate: v.preferredDate || undefined, location: v.location || undefined, guestCount: num(v.guestCount), budget: num(v.budget),
        theme: v.theme || undefined, packageType: v.packageType, source: v.source, assignedToId: v.assignedToId || undefined,
        followUpAt: v.followUpAt || undefined, notes: v.notes || undefined,
      });
      notify.ok('Enquiry captured'); reset(); onSaved(); onClose();
    } catch (e) { notify.err(e); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New enquiry" side width="max-w-xl"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" form="enq-form" disabled={isSubmitting}>{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}Save enquiry</button></>}>
      <form id="enq-form" onSubmit={handleSubmit(submit)} className="grid grid-cols-2 gap-4" noValidate>
        <Field label="Bride’s name" error={errors.brideName?.message}><input className="input" {...register('brideName')} /></Field>
        <Field label="Groom’s name" error={errors.groomName?.message}><input className="input" {...register('groomName')} /></Field>
        <Field label="Phone"><input className="input" {...register('phone')} /></Field>
        <Field label="Email" error={errors.email?.message}><input className="input" type="email" {...register('email')} /></Field>
        <Field label="Preferred wedding date"><input className="input" type="date" {...register('preferredDate')} /></Field>
        <Field label="Location"><input className="input" placeholder="Jaipur, Udaipur…" {...register('location')} /></Field>
        <Field label="Expected guests"><input className="input" type="number" min={0} {...register('guestCount')} /></Field>
        <Field label="Budget (₹)"><input className="input" type="number" min={0} {...register('budget')} /></Field>
        <Field label="Package"><Select value={watch('packageType')} onChange={(v) => setValue('packageType', v)} options={PACKAGES} /></Field>
        <Field label="Source"><Select value={watch('source')} onChange={(v) => setValue('source', v)} options={SOURCES} /></Field>
        <Field label="Assigned planner"><Select value={watch('assignedToId') ?? ''} onChange={(v) => setValue('assignedToId', v)} options={users.map((u) => ({ v: u.id, l: u.name }))} placeholder="Unassigned" /></Field>
        <Field label="Follow-up date"><input className="input" type="date" {...register('followUpAt')} /></Field>
        <Field label="Theme" className="col-span-2"><input className="input" placeholder="Winter palace, royal heritage…" {...register('theme')} /></Field>
        <Field label="Notes" className="col-span-2"><textarea className="input min-h-[80px]" {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}
