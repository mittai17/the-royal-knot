'use client';
import { useState } from 'react';
import { Card, PageHeader } from '@/components/ui/primitives';
import { Segmented } from '@/components/shared/form-bits';
import { MasterList } from '@/components/admin/master-list';

const TYPES = [{ v: 'SERVICE_CATEGORY', l: 'Service categories' }, { v: 'EVENT_FUNCTION', l: 'Event functions' }, { v: 'VENDOR_CATEGORY', l: 'Vendor categories' }] as const;

export default function MasterDataPage() {
  const [t, setT] = useState<(typeof TYPES)[number]['v']>('SERVICE_CATEGORY');
  return (
    <>
      <PageHeader title="Master Data" subtitle="Lookup lists used across enquiries, vendors and event planning." />
      <div className="mb-4 overflow-x-auto"><Segmented value={t} onChange={setT} options={TYPES} /></div>
      <Card><MasterList key={t} type={t} noun={TYPES.find((x) => x.v === t)!.l.replace(/s$/, '').replace('ies', 'y')} /></Card>
    </>
  );
}
