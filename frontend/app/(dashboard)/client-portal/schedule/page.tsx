'use client';
import { PageHeader } from '@/components/ui/primitives';
import { Async } from '@/components/portal/shared';
import { ScheduleTimeline, type ScheduleData } from '@/components/portal/client-views';
import { useApi } from '@/hooks/use-api';

export default function Page() {
  const q = useApi<ScheduleData>('/portal/client/schedule');
  return (
    <div>
      <PageHeader title="Event Schedule" subtitle="Your wedding itinerary, day by day." />
      <Async q={q}>{(d) => <ScheduleTimeline days={d.days} />}</Async>
    </div>
  );
}
