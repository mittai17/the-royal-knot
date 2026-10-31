'use client';
import { PageHeader } from '@/components/ui/primitives';
import { AccommodationPanel } from '@/components/ops/accommodation-panel';
import { useWedding } from '@/lib/wedding-context';

export default function AccommodationPage() {
  const { selected } = useWedding();
  return (
    <>
      <PageHeader title="Accommodation" subtitle={selected ? `${selected.name} · hotels, rooms and guest allocation` : 'Hotels, rooms and guest allocation'} />
      <AccommodationPanel />
    </>
  );
}
