import { toast } from 'sonner';
import { ApiError } from './api';

/** Turns an API error into a readable line: ILLEGAL_TRANSITION shows the allowed next states, blockers are listed. */
export function errorText(e: unknown): string {
  if (!(e instanceof Error)) return 'Something went wrong';
  if (!(e instanceof ApiError)) return e.message;
  const d = e.details as { allowed?: string[]; blockers?: string[]; from?: string; to?: string } | string[] | undefined;
  if (e.reason === 'ILLEGAL_TRANSITION' && d && !Array.isArray(d) && d.allowed)
    return `${e.message}${d.from ? ` (${d.from} to ${d.to})` : ''}. Allowed next: ${d.allowed.length ? d.allowed.join(', ') : 'none'}`;
  if (e.reason === 'CONFIRMATION_BLOCKED' && d && !Array.isArray(d) && d.blockers) return `Cannot confirm yet: ${d.blockers.join(', ')}`;
  if (e.reason === 'AGREEMENT_NOT_SIGNED') return 'The service agreement is not signed yet. Get it signed before continuing.';
  if (Array.isArray(d) && d.length) return `${e.message}: ${d.join('; ')}`;
  return e.message;
}

export const notify = {
  ok: (m: string) => toast.success(m),
  err: (e: unknown) => toast.error(errorText(e)),
};
