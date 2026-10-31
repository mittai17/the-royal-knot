'use client';
import { PageHeader } from '@/components/ui/primitives';
import { AnnouncementsFeed } from '@/components/announcements/feed';

export default function Page() {
  return (<><PageHeader title="Announcements" subtitle="Briefings and updates from the planning team." /><AnnouncementsFeed base="/portal/vendor/announcements" /></>);
}
