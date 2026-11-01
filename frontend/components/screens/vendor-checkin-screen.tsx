'use client';
import { PageHeader } from '@/components/ui/primitives';
import { VendorCheckin } from '@/components/ops/vendor-checkin';

export function VendorCheckinScreen() {
  return (
    <>
      <PageHeader title="Vendor Check-in" subtitle="Expected, arrived, pending and delayed vendors for the day." />
      <VendorCheckin />
    </>
  );
}
