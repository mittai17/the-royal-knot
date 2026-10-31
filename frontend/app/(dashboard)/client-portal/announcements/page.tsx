'use client';
import { PageHeader } from '@/components/ui/primitives';
import { AnnouncementsFeed } from '@/components/announcements/feed';

export default function Page() {
  return (<><PageHeader title="Announcements & Updates" subtitle="News and changes from your planning team." /><AnnouncementsFeed base="/portal/client/announcements" /></>);
}
