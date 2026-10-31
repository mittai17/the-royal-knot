'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Field, Modal } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { PACKAGES } from '@/lib/enums';
import { useUsers } from '@/hooks/use-users';
import { toInputDate } from '@/lib/utils';
import type { Wedding } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Required'), brideName: z.string().min(1, 'Required'), groomName: z.string().min(1, 'Required'),
  phone: z.string().optional(), email: z.union([z.string().email('Invalid email'), z.literal('')]).optional(),
  location: z.string().min(1, 'Required'), venue: z.string().optional(),
  startDate: z.string().min(1, 'Required'), endDate: z.string().min(1, 'Required'),
  expectedGuests: z.string().min(1, 'Required'), packageType: z.string(), budget: z.string().min(1, 'Required'), contractValue: z.string().min(1, 'Required'),
  plannerId: z.string().optional(), theme: z.string().optional(),
}).refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'End must be on/after start' });
type Form = z.infer<typeof schema>;

export function WeddingFormModal({ open, onClose, onSaved, wedding }: { open: boolean; onClose: () => void; onSaved: (id?: string) => void; wedding?: Wedding }) {
  const { users } = useUsers();
  const editing = !!wedding;
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    values: wedding ? {
      name: wedding.name, brideName: wedding.couple?.brideName ?? '-', groomName: wedding.couple?.groomName ?? '-', phone: wedding.couple?.phone ?? '', email: wedding.couple?.email ?? '',
      location: wedding.location, venue: wedding.venue ?? '', startDate: toInputDate(wedding.startDate), endDate: toInputDate(wedding.endDate),
      expectedGuests: String(wedding.expectedGuests), packageType: wedding.packageType, budget: String(Number(wedding.budget)), contractValue: String(Number(wedding.contractValue)),
      plannerId: wedding.plannerId ?? wedding.planner?.id ?? '', theme: wedding.theme ?? '',
    } : { packageType: 'FULL_SERVICE' } as Form,
  });

  const submit = async (v: Form) => {
    const days = Math.round((new Date(v.endDate).getTime() - new Date(v.startDate).getTime()) / 86400000) + 1;
    const body = {
      name: v.name, location: v.location, venue: v.venue || undefined, startDate: v.startDate, endDate: v.endDate, eventDays: days,
      expectedGuests: Number(v.expectedGuests), packageType: v.packageType, budget: Number(v.budget), contractValue: Number(v.contractValue),
      plannerId: v.plannerId || undefined, theme: v.theme || undefined,
    };
    try {
      if (editing) { await api.patch(`/weddings/${wedding.id}`, body); notify.ok('Wedding updated'); onSaved(wedding.id); }
      else {
        const r = await api.post<{ id: string }>('/weddings', { ...body, brideName: v.brideName, groomName: v.groomName, phone: v.phone || undefined, email: v.email || undefined });
        notify.ok('Wedding created'); onSaved(r.data.id);
      }
      onClose();
    } catch (e) { notify.err(e); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit wedding' : 'New wedding'} side width="max-w-xl"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" form="wed-form" disabled={isSubmitting}>{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? 'Save changes' : 'Create wedding'}</button></>}>
      <form id="wed-form" onSubmit={handleSubmit(submit)} className="grid grid-cols-2 gap-4" noValidate>
        <Field label="Wedding name" error={errors.name?.message} className="col-span-2"><input className="input" placeholder="Mehta Wedding" {...register('name')} /></Field>
        {!editing && <>
          <Field label="Bride’s name" error={errors.brideName?.message}><input className="input" {...register('brideName')} /></Field>
          <Field label="Groom’s name" error={errors.groomName?.message}><input className="input" {...register('groomName')} /></Field>
          <Field label="Phone"><input className="input" {...register('phone')} /></Field>
          <Field label="Email" error={errors.email?.message}><input className="input" type="email" {...register('email')} /></Field>
        </>}
        <Field label="Location" error={errors.location?.message}><input className="input" placeholder="Jaipur" {...register('location')} /></Field>
        <Field label="Venue"><input className="input" {...register('venue')} /></Field>
        <Field label="Start date" error={errors.startDate?.message}><input className="input" type="date" {...register('startDate')} /></Field>
        <Field label="End date" error={errors.endDate?.message}><input className="input" type="date" {...register('endDate')} /></Field>
        <Field label="Expected guests" error={errors.expectedGuests?.message}><input className="input" type="number" min={1} {...register('expectedGuests')} /></Field>
        <Field label="Package"><Select value={watch('packageType')} onChange={(v) => setValue('packageType', v)} options={PACKAGES} /></Field>
        <Field label="Budget (₹)" error={errors.budget?.message}><input className="input" type="number" min={0} {...register('budget')} /></Field>
        <Field label="Contract value (₹)" error={errors.contractValue?.message}><input className="input" type="number" min={0} {...register('contractValue')} /></Field>
        <Field label="Assigned planner"><Select value={watch('plannerId') ?? ''} onChange={(v) => setValue('plannerId', v)} options={users.map((u) => ({ v: u.id, l: u.name }))} placeholder="Unassigned" /></Field>
        <Field label="Theme"><input className="input" {...register('theme')} /></Field>
      </form>
    </Modal>
  );
}
