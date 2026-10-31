'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { PageHeader, Card, StatusBadge, Pagination } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Select, SearchInput } from '@/components/shared/form-bits';
import { VendorFormModal } from '@/components/vendors/vendor-form';
import { VendorDetail } from '@/components/vendors/vendor-detail';
import { Rating } from '@/components/vendors/rating';
import { useList } from '@/hooks/use-list';
import { VENDOR_CATEGORIES } from '@/lib/enums';
import { inr } from '@/lib/utils';
import type { Vendor } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';

const cols: ColumnDef<Vendor, unknown>[] = [
  { id: 'name', header: 'Vendor', cell: ({ row: { original: v } }) => <div><p className="font-medium">{v.name}</p><p className="text-xs text-ink-soft">{v.businessName ?? ''}</p></div> },
  { id: 'category', header: 'Category', cell: ({ row: { original: v } }) => <StatusBadge status={v.category} tone="gold" /> },
  { id: 'contactName', header: 'Contact', enableSorting: false, cell: ({ row: { original: v } }) => <div><p>{v.contactName}</p><p className="text-xs text-ink-soft">{v.phone}</p></div> },
  { id: 'serviceAreas', header: 'Service area', enableSorting: false, cell: ({ row: { original: v } }) => v.serviceAreas.join(', ') || '—' },
  { id: 'basePrice', header: 'Base price', cell: ({ row: { original: v } }) => v.basePrice ? <span className="num">{inr(v.basePrice)}<span className="text-xs font-normal text-ink-soft"> {v.priceUnit}</span></span> : '—' },
  { id: 'rating', header: 'Rating', cell: ({ row: { original: v } }) => <Rating value={v.rating} /> },
  { id: 'available', header: 'Availability', enableSorting: false, cell: ({ row: { original: v } }) => <StatusBadge status={v.available ? 'ACTIVE' : 'CANCELLED'} /> },
];

function VendorsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [category, setCategory] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; vendor?: Vendor }>({ open: params.get('new') === '1' });
  const list = useList<Vendor>('/vendors', { category: category || undefined }, 15);
  const close = () => { setForm({ open: false }); if (params.get('new')) router.replace('/vendors'); };

  return (
    <>
      <PageHeader title="Vendors" subtitle="Trusted partners across Jaipur, Udaipur and beyond." actions={<Can roles={G.CRM}><button className="btn-primary" onClick={() => setForm({ open: true })}><Plus className="h-4 w-4" />Add vendor</button></Can>} />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search vendors…" />
          <Select className="w-48" value={category} onChange={(v) => { setCategory(v); list.setPage(1); }} options={VENDOR_CATEGORIES} placeholder="All categories" />
        </div>
        <DataTable columns={cols} data={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(v) => setOpenId(v.id)} onSort={list.setSort} emptyTitle="No vendors found" />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      </Card>
      <VendorDetail id={openId} onClose={() => setOpenId(null)} onEdit={(v) => { setOpenId(null); setForm({ open: true, vendor: v }); }} />
      <VendorFormModal open={form.open} vendor={form.vendor} onClose={close} onSaved={list.reload} />
    </>
  );
}
export default function VendorsPage() { return <Suspense><VendorsInner /></Suspense>; }
