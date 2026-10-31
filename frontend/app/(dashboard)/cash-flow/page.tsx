'use client';
import { PageHeader } from '@/components/ui/primitives';
import { CashFlowPanel } from '@/components/finance/cash-flow-panel';
import { RoleGate } from '@/components/shared/can';

export default function CashFlowPage() {
  return (
    <RoleGate roles={['FINANCE']}>
      <PageHeader title="Cash Flow" subtitle="Money in and out by month, with a forecast from unpaid milestones and vendor payables." />
      <CashFlowPanel />
    </RoleGate>
  );
}
