'use client';
import { PageHeader } from '@/components/ui/primitives';
import { ProcurementPanel } from '@/components/finance/procurement-panel';
import { RoleGate } from '@/components/shared/can';

export default function ProcurementPage() {
  return (
    <RoleGate roles={['PLANNER', 'FINANCE']}>
      <PageHeader title="Procurement & Purchase Orders" subtitle="RFQ rounds, side-by-side quotes, and purchase orders raised from the selected quotation." />
      <ProcurementPanel />
    </RoleGate>
  );
}
