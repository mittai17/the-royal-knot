'use client';
import { PageHeader } from '@/components/ui/primitives';
import { ClientAccommodation } from '@/components/ops/client-views';

export default function Page() {
  return (
    <>
      <PageHeader title="Accommodation" subtitle="Where your guests are staying." />
      <ClientAccommodation />
    </>
  );
}
