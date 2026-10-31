'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Field, Modal } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { VENDOR_CATEGORIES } from '@/lib/enums';
import type { Vendor } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Required'), businessName: z.string().optional(), category: z.string(), contactName: z.string().min(1, 'Required'), phone: z.string().min(5, 'Required'),
  email: z.union([z.string().email('Invalid email'), z.literal('')]).optional(), address: z.string().optional(), serviceAreas: z.string().optional(),
  basePrice: z.string().optional(), priceUnit: z.string().optional(), gstin: z.string().optional(), bankDetails: z.string().optional(), available: z.boolean(),
});
type Form = z.infer<typeof schema>;

export function VendorFormModal({ open, onClose, onSaved, vendor }: { open: boolean; onClose: () => void; onSaved: () => void; vendor?: Vendor }) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    values: vendor ? { name: vendor.name, businessName: vendor.businessName ?? '', category: vendor.category, contactName: vendor.contactName, phone: vendor.phone, email: vendor.email ?? '', address: vendor.address ?? '', serviceAreas: vendor.serviceAreas.join(', '), basePrice: vendor.basePrice ? String(Number(vendor.basePrice)) : '', priceUnit: vendor.priceUnit ?? '', gstin: vendor.gstin ?? '', bankDetails: vendor.bankDetails ?? '', available: vendor.available } : { category: 'CATERING', available: true } as Form,
  });
  const submit = async (v: Form) => {
    const body = { ...v, email: v.email || undefined, serviceAreas: (v.serviceAreas ?? '').split(',').map((s) => s.trim()).filter(Boolean), basePrice: v.basePrice ? Number(v.basePrice) : undefined, businessName: v.businessName || undefined, address: v.address || undefined, priceUnit: v.priceUnit || undefined, gstin: v.gstin || undefined, bankDetails: v.bankDetails || undefined };
    try { vendor ? await api.patch(`/vendors/${vendor.id}`, body) : await api.post('/vendors', body); notify.ok(vendor ? 'Vendor updated' : 'Vendor added'); onSaved(); onClose(); } catch (e) { notify.err(e); }
  };
  return (
    <Modal open={open} onClose={onClose} title={vendor ? 'Edit vendor' : 'New vendor'} side width="max-w-xl"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" form="vendor-form" disabled={isSubmitting}>{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}Save vendor</button></>}>
      <form id="vendor-form" onSubmit={handleSubmit(submit)} className="grid grid-cols-2 gap-4" noValidate>
        <Field label="Vendor name" error={errors.name?.message}><input className="input" {...register('name')} /></Field>
        <Field label="Business name"><input className="input" {...register('businessName')} /></Field>
        <Field label="Category"><Select value={watch('category')} onChange={(v) => setValue('category', v)} options={VENDOR_CATEGORIES} /></Field>
        <Field label="Contact person" error={errors.contactName?.message}><input className="input" {...register('contactName')} /></Field>
        <Field label="Phone" error={errors.phone?.message}><input className="input" {...register('phone')} /></Field>
        <Field label="Email" error={errors.email?.message}><input className="input" type="email" {...register('email')} /></Field>
        <Field label="Address" className="col-span-2"><input className="input" {...register('address')} /></Field>
        <Field label="Service areas (comma separated)" className="col-span-2"><input className="input" placeholder="Jaipur, Udaipur" {...register('serviceAreas')} /></Field>
        <Field label="Base price (₹)"><input className="input" type="number" min={0} {...register('basePrice')} /></Field>
        <Field label="Price unit"><input className="input" placeholder="per plate, per day…" {...register('priceUnit')} /></Field>
        <Field label="GSTIN"><input className="input" {...register('gstin')} /></Field>
        <Field label="Bank / payment details"><input className="input" {...register('bankDetails')} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#401827]" {...register('available')} />Currently available for bookings</label>
      </form>
    </Modal>
  );
}
