'use client';
import { PageHeader } from '@/components/ui/primitives';
import { WeddingGate } from '@/components/shared/wedding-gate';
import { FunctionsPanel } from '@/components/ops/functions-panel';
import { useWedding } from '@/lib/wedding-context';

export default function EventFunctionsPage() {
  const { selected } = useWedding();
  return (
    <>
      <PageHeader title="Event Functions" subtitle={selected ? `${selected.name} · functions, timeline, calendar and run sheet` : 'Functions, timeline, calendar and run sheet'} />
      <WeddingGate>{(id) => <FunctionsPanel key={id} weddingId={id} />}</WeddingGate>
    </>
  );
}
