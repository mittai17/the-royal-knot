'use client';
import { PageHeader } from '@/components/ui/primitives';
import { IncidentsBoard } from '@/components/ops/incidents-board';

export default function IncidentsPage() {
  return (
    <>
      <PageHeader title="Incidents" subtitle="Log, assign and resolve issues across all weddings." />
      <IncidentsBoard />
    </>
  );
}
