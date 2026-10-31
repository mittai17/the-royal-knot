'use client';
import { PageHeader } from '@/components/ui/primitives';
import { SettingsPanel } from '@/components/portal/shared';

export default function Page() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Your profile, notification preferences and password." />
      <SettingsPanel base="/portal/vendor" />
    </div>
  );
}
