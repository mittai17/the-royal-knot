'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import { Segmented } from '@/components/shared/form-bits';
import { WeddingGate } from '@/components/shared/wedding-gate';
import { ExpensesPanel } from '@/components/finance/expenses-panel';
import { ReconciliationPanel } from '@/components/finance/reconciliation-panel';
import { useWedding } from '@/lib/wedding-context';
import { RoleGate } from '@/components/shared/can';
import { G } from '@/lib/permissions';

function ExpensesPageInner() {
  const { selected } = useWedding();
  const [tab, setTab] = useState<'expenses' | 'reconciliation'>('expenses');
  return (
    <>
      <PageHeader title="Expenses & Reconciliation" subtitle={selected ? `${selected.name} · costs, extra charges and vendor settlement` : 'Costs and settlement'} actions={<Segmented value={tab} onChange={setTab} options={[{ v: 'expenses', l: 'Expenses' }, { v: 'reconciliation', l: 'Reconciliation' }]} />} />
      <WeddingGate>{(id) => tab === 'expenses' ? <ExpensesPanel key={id} weddingId={id} /> : <ReconciliationPanel key={id} weddingId={id} />}</WeddingGate>
    </>
  );
}


export default function ExpensesPage() {
  return <RoleGate roles={G.FINANCE_READ}><ExpensesPageInner /></RoleGate>;
}
