'use client';
import { PageHeader } from '@/components/ui/primitives';
import { InvoicesPanel } from '@/components/finance/invoices-panel';
import { RoleGate } from '@/components/shared/can';

export default function InvoicesPage() {
  return (
    <RoleGate roles={['FINANCE', 'PLANNER']}>
      <PageHeader title="Client Invoices" subtitle="Create, send and collect against client invoices. Payments post to the wedding’s milestones." />
      <InvoicesPanel />
    </RoleGate>
  );
}
