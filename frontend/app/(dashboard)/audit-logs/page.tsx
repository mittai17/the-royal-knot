'use client';
import { PageHeader } from '@/components/ui/primitives';
import { AuditLogTable } from '@/components/audit-log-table';
import { RoleGate } from '@/components/shared/can';

export default function AuditLogsPage() {
  return (
    <RoleGate roles={['FINANCE']}>
      <PageHeader title="Audit Logs" subtitle="Who did what, and when, across payments, approvals and records." />
      <AuditLogTable />
    </RoleGate>
  );
}
