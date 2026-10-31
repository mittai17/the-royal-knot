'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/primitives';
import { WeddingGate } from '@/components/shared/wedding-gate';
import { QuotationsPanel } from '@/components/quotations/quotations-panel';
import { useWedding } from '@/lib/wedding-context';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const { selected } = useWedding();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const close = () => { setCreating(false); if (params.get('new')) router.replace('/quotations'); };
  return (
    <>
      <PageHeader title="Quotations" subtitle={selected ? `Vendor requests for ${selected.name}` : 'Request and compare vendor quotations'} actions={<Can roles={G.CRM}><button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Request quotations</button></Can>} />
      <WeddingGate>{(id) => <QuotationsPanel key={id} weddingId={id} creating={creating} onCloseCreate={close} onOpenCreate={() => setCreating(true)} />}</WeddingGate>
    </>
  );
}
export default function QuotationsPage() { return <Suspense><Inner /></Suspense>; }
