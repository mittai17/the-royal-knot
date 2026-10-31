'use client';
import { PageHeader } from '@/components/ui/primitives';
import { TransportPanel } from '@/components/ops/transport-panel';
import { useWedding } from '@/lib/wedding-context';

export default function TransportPage() {
  const { selected } = useWedding();
  return (
    <>
      <PageHeader title="Transport" subtitle={selected ? `${selected.name} · vehicles, drivers, trips and guest transfers` : 'Vehicles, drivers, trips and guest transfers'} />
      <TransportPanel />
    </>
  );
}
