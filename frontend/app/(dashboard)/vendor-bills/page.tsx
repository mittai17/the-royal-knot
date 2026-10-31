'use client';
import { PageHeader } from '@/components/ui/primitives';
import { VendorBillsPanel } from '@/components/finance/vendor-bills-panel';
import { RoleGate } from '@/components/shared/can';

export default function VendorBillsPage() {
  return (
    <RoleGate roles={['FINANCE']}>
      <PageHeader title="Vendor Bills" subtitle="Accounts payable: verify against the purchase order, approve, then pay." />
      <VendorBillsPanel />
    </RoleGate>
  );
}
