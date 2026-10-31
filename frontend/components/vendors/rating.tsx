import { Star } from 'lucide-react';
import { toNum } from '@/lib/utils';

export function Rating({ value }: { value: unknown }) {
  const n = toNum(value);
  return <span className="inline-flex items-center gap-1 text-sm tabular-nums"><Star className="h-3.5 w-3.5 fill-gold text-gold" />{n ? n.toFixed(1) : '—'}</span>;
}
