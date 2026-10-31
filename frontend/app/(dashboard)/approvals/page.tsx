'use client';
import { PageHeader } from '@/components/ui/primitives';
import { ApprovalsCentre } from '@/components/finance/approvals-centre';
import { RoleGate } from '@/components/shared/can';

export default function ApprovalsPage() {
  return (
    <RoleGate roles={['PLANNER', 'FINANCE']}>
      <PageHeader title="Approvals Centre" subtitle="Vendor contracts, extra expenses, client discounts and vendor payments waiting for a decision." />
      <ApprovalsCentre />
    </RoleGate>
  );
}
