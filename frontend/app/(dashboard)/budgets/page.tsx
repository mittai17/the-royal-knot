'use client';
import { PageHeader } from '@/components/ui/primitives';
import { BudgetsPanel } from '@/components/finance/budgets-panel';
import { RoleGate } from '@/components/shared/can';

export default function BudgetsPage() {
  return (
    <RoleGate roles={['FINANCE']}>
      <PageHeader title="Budgets & Profitability" subtitle="Planned against actual cost, overall and by wedding, category and vendor." />
      <BudgetsPanel />
    </RoleGate>
  );
}
