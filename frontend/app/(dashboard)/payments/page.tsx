'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/primitives';
import { WeddingGate } from '@/components/shared/wedding-gate';
import { PaymentsPanel } from '@/components/finance/payments-panel';
import { useWedding } from '@/lib/wedding-context';
import { RoleGate } from '@/components/shared/can';
import { G } from '@/lib/permissions';

function Inner() {
  const { selected } = useWedding();
  const autoOpen = useSearchParams().get('new') === '1';
  return (
    <>
      <PageHeader title="Payments" subtitle={selected ? `${selected.name} · booking, advance and final milestones` : 'Client payment milestones'} />
      <WeddingGate>{(id) => <PaymentsPanel key={id} weddingId={id} autoOpen={autoOpen} contractValue={selected?.contractValue} />}</WeddingGate>
    </>
  );
}
function PaymentsPageInner() { return <Suspense><Inner /></Suspense>; }


export default function PaymentsPage() {
  return <RoleGate roles={G.FINANCE_READ}><PaymentsPageInner /></RoleGate>;
}
