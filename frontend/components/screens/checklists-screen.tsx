'use client';
import { PageHeader } from '@/components/ui/primitives';
import { WeddingGate } from '@/components/shared/wedding-gate';
import { ChecklistsPanel } from '@/components/ops/checklists-panel';
import { useWedding } from '@/lib/wedding-context';

export function ChecklistsScreen() {
  const { selected } = useWedding();
  return (
    <>
      <PageHeader title="Checklists" subtitle={selected ? `${selected.name} · wedding and function checklists` : 'Wedding and function checklists'} />
      <WeddingGate>{(id) => <ChecklistsPanel key={id} weddingId={id} />}</WeddingGate>
    </>
  );
}
