'use client';
import { PageHeader } from '@/components/ui/primitives';
import { RequestsPanel } from '@/components/feedback/requests-panel';

export default function Page() {
  return (<><PageHeader title="Support" subtitle="Raise a ticket and follow the planning team's replies." /><RequestsPanel base="/portal/vendor/support" mode="vendor" /></>);
}
