'use client';
import { PageHeader } from '@/components/ui/primitives';
import { VendorInvoicesPanel } from '@/components/finance/vendor-invoices-panel';
import { RoleGate } from '@/components/shared/can';

export default function VendorInvoicesPage() {
  return (
    <RoleGate roles={['VENDOR']}>
      <PageHeader title="Invoices & Payments" subtitle="Upload invoices, follow their review, and see what has been paid and settled." />
      <VendorInvoicesPanel />
    </RoleGate>
  );
}
