'use client';
import { PageHeader } from '@/components/ui/primitives';
import { ClientTransport } from '@/components/ops/client-views';

export default function Page() {
  return (
    <>
      <PageHeader title="Transport" subtitle="Pickups, drops and trips for your guests." />
      <ClientTransport />
    </>
  );
}
