'use client';
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';

export interface CalItem { id: string; at: Date; label: string; tone: 'burgundy' | 'info' | 'success' | 'warning' | 'danger' | 'neutral' }
const TONE: Record<CalItem['tone'], string> = {
  burgundy: 'bg-[#F1E6EA] text-burgundy', info: 'bg-info-soft text-info', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-[#A8701A]', danger: 'bg-danger-soft text-danger', neutral: 'bg-surface-2 text-ink-soft',
};

/** Visible range of a month grid (full weeks, Monday first). */
export const gridRange = (month: Date) => ({ from: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), to: addDays(endOfWeek(endOfMonth(month), { weekStartsOn: 1 }), 1) });

export function CalendarGrid({ month, items, selected, onSelect }: { month: Date; items: CalItem[]; selected: Date | null; onSelect: (d: Date) => void }) {
  const { from, to } = gridRange(month);
  const days: Date[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  const today = new Date();
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 text-xs text-ink-soft border-b border-line">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="px-2 py-2 font-medium">{d}</div>)}</div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const day = items.filter((i) => isSameDay(i.at, d));
            const sel = selected && isSameDay(selected, d);
            return (
              <button key={d.toISOString()} onClick={() => onSelect(d)} aria-label={`${format(d, 'dd MMMM')}, ${day.length} items`}
                className={cn('min-h-[92px] border-b border-r border-line p-1.5 text-left align-top transition-colors hover:bg-surface-2/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy', !isSameMonth(d, month) && 'bg-surface-2/40 text-ink-soft', sel && 'bg-gold-soft/60')}>
                <span className={cn('inline-grid h-6 w-6 place-items-center rounded-full text-xs', isSameDay(d, today) && 'bg-burgundy text-white')}>{format(d, 'd')}</span>
                <span className="mt-1 block space-y-0.5">
                  {day.slice(0, 3).map((i) => <span key={i.id} className={cn('block truncate rounded px-1.5 py-0.5 text-[11px] leading-4', TONE[i.tone])}>{i.label}</span>)}
                  {day.length > 3 && <span className="block text-[11px] text-ink-soft px-1">+{day.length - 3} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
