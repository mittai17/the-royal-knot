'use client';
import { PageHeader } from '@/components/ui/primitives';
import { FinancialReportsPanel } from '@/components/finance/financial-reports-panel';
import { RoleGate } from '@/components/shared/can';

export default function FinancialReportsPage() {
  return (
    <RoleGate roles={['FINANCE']}>
      <PageHeader title="Financial Reports" subtitle="Profitability, receivables, vendor payments, expenses, GST and season performance. Export any report as CSV." />
      <FinancialReportsPanel />
    </RoleGate>
  );
}
