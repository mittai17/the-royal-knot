'use client';
import { PageHeader } from '@/components/ui/primitives';
import { Async } from '@/components/portal/shared';
import { VendorCards, type VendorRow } from '@/components/portal/client-views';
import { useApi } from '@/hooks/use-api';

export default function Page() {
  const q = useApi<{ vendors: VendorRow[] }>('/portal/client/vendors');
  return (
    <div>
      <PageHeader title="Vendors & Services" subtitle="The vendors your planner has booked for you." />
      <Async q={q}>{(d) => <VendorCards vendors={d.vendors} />}</Async>
    </div>
  );
}
