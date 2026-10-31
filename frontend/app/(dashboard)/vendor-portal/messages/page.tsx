'use client';
import { PageHeader } from '@/components/ui/primitives';
import { Inbox } from '@/components/chat/inbox';

export default function Page() {
  return (<><PageHeader title="Messages" subtitle="Chat with the planning team about bookings, schedules and logistics." /><Inbox prefix="/portal/vendor/messages" emptyHint="Your planner conversation will appear here." /></>);
}
