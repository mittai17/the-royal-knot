'use client';
import { PageHeader } from '@/components/ui/primitives';
import { CalendarView } from '@/components/ops/calendar-view';

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" subtitle="Functions and task deadlines by month." />
      <CalendarView />
    </>
  );
}
