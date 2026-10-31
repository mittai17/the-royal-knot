'use client';
import { PageHeader } from '@/components/ui/primitives';
import { VendorCheckin } from '@/components/ops/vendor-checkin';

export default function VendorCheckinPage() {
  return (
    <>
      <PageHeader title="Vendor Check-in" subtitle="Expected, arrived, pending and delayed vendors for the day." />
      <VendorCheckin />
    </>
  );
}
