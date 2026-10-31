import { Hammer } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';

/** Placeholder for screens that are scaffolded but not built yet. The owner module replaces the page; see docs/ROUTES.md. */
export function ComingSoon({ title, subtitle, module }: { title: string; subtitle?: string; module?: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <EmptyState title="Coming soon" hint={module ? `This screen is being built (module: ${module}).` : 'This screen is being built.'} action={<Hammer className="h-5 w-5 text-ink-soft" aria-hidden />} />
      </Card>
    </div>
  );
}
