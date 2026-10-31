'use client';
import { PageHeader } from '@/components/ui/primitives';
import { TodaysEvents } from '@/components/ops/todays-events';

export default function TodaysEventsPage() {
  return (
    <>
      <PageHeader title="Today’s Events" subtitle="Everything happening today across live weddings." />
      <TodaysEvents />
    </>
  );
}
