'use client';
import { PageHeader } from '@/components/ui/primitives';
import { DocumentsPanel } from '@/components/documents/documents-panel';

export default function DocumentsPage() {
  return (<><PageHeader title="Documents" subtitle="Agreements, contracts, invoices and floor plans, stored on your own servers." /><DocumentsPanel /></>);
}
