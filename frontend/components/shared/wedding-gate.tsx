'use client';
import type { ReactNode } from 'react';
import { Card, EmptyState, Skeleton } from '@/components/ui/primitives';
import { useWedding } from '@/lib/wedding-context';

/** Renders children once a wedding is selected in the global selector. */
export function WeddingGate({ children }: { children: (weddingId: string) => ReactNode }) {
  const { selectedId, loading } = useWedding();
  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (!selectedId) return <Card><EmptyState title="No wedding selected" hint="Create a wedding or pick one from the selector in the top bar." /></Card>;
  return <>{children(selectedId)}</>;
}
