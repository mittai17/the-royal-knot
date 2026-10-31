'use client';
import { PageHeader } from '@/components/ui/primitives';
import { RequestsPanel } from '@/components/feedback/requests-panel';

export default function Page() {
  return (<><PageHeader title="Feedback & Requests" subtitle="Ask for changes, share feedback and track replies from your planner." /><RequestsPanel base="/portal/client/feedback" mode="client" /></>);
}
