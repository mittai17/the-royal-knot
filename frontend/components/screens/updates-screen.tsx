'use client';
import { PageHeader } from '@/components/ui/primitives';
import { WeddingGate } from '@/components/shared/wedding-gate';
import { RoleGate } from '@/components/shared/can';
import { UpdatesPanel } from '@/components/ops/updates-panel';
import { useWedding } from '@/lib/wedding-context';

export function UpdatesScreen() {
  const { selected } = useWedding();
  return (
    <>
      <PageHeader title="Updates & Reports" subtitle={selected ? `${selected.name} · daily progress, task and event reports` : 'Daily progress, task and event reports'} />
      <RoleGate roles={['OPERATIONS']}><WeddingGate>{(id) => <UpdatesPanel key={id} weddingId={id} />}</WeddingGate></RoleGate>
    </>
  );
}
