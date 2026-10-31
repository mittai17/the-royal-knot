'use client';
import { PageHeader } from '@/components/ui/primitives';
import { WeddingGate } from '@/components/shared/wedding-gate';
import { GuestsPanel } from '@/components/guests/guests-panel';
import { useWedding } from '@/lib/wedding-context';

export default function GuestsPage() {
  const { selected } = useWedding();
  return (
    <>
      <PageHeader title="Guests" subtitle={selected ? `${selected.name} · expected, confirmed and actual attendance` : 'Guest list and RSVPs'} />
      <WeddingGate>{(id) => <GuestsPanel key={id} weddingId={id} expected={selected?.expectedGuests} />}</WeddingGate>
    </>
  );
}
