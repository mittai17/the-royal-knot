'use client';
import { PageHeader } from '@/components/ui/primitives';
import { Inbox } from '@/components/chat/inbox';

export default function Page() {
  return (<><PageHeader title="Chat & Support" subtitle="Message your planner directly. Replies arrive live." /><Inbox prefix="/portal/client/chat" emptyHint="Your planner chat opens as soon as your wedding is set up." /></>);
}
