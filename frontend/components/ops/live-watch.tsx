'use client';
import { useLive, type LiveEvent } from '@/hooks/use-live';

/** Invisible helper: joins one wedding room and calls onChange for any live event (use one per active wedding on multi-wedding screens). */
export function LiveWatch({ weddingId, events, onChange }: { weddingId: string; events?: LiveEvent[]; onChange: () => void }) {
  useLive(weddingId, (e) => { if (!events || events.includes(e)) onChange(); });
  return null;
}
