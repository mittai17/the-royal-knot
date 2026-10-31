'use client';
import { PageHeader } from '@/components/ui/primitives';
import { WeddingGate } from '@/components/shared/wedding-gate';
import { TasksPanel } from '@/components/tasks/tasks-panel';
import { useWedding } from '@/lib/wedding-context';

export default function TasksPage() {
  const { selected } = useWedding();
  return (
    <>
      <PageHeader title="Planning & Tasks" subtitle={selected ? `${selected.name} · checklist and deadlines` : 'Wedding checklist and deadlines'} />
      <WeddingGate>{(id) => <TasksPanel key={id} weddingId={id} />}</WeddingGate>
    </>
  );
}
