'use client';
import { PageHeader } from '@/components/ui/primitives';
import { ClientChecklists } from '@/components/ops/client-views';

export default function Page() {
  return (
    <>
      <PageHeader title="Checklists" subtitle="Your to-dos, shared by your planner." />
      <ClientChecklists />
    </>
  );
}
