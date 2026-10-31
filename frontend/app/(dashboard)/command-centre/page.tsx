'use client';
import { PageHeader } from '@/components/ui/primitives';
import { WeddingGate } from '@/components/shared/wedding-gate';
import { CommandCentre } from '@/components/command-centre/command-centre';

export default function CommandCentrePage() {
  return (
    <>
      <PageHeader title="Event Command Centre" subtitle="Live operations for the wedding selected above." />
      <WeddingGate>{(id) => <CommandCentre key={id} weddingId={id} />}</WeddingGate>
    </>
  );
}
