import { toast } from 'sonner';

export const notify = {
  ok: (m: string) => toast.success(m),
  err: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong'),
};
