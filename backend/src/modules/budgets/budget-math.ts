import { Prisma } from '@prisma/client';
import { D, Dec, money } from '../../common/finance';

export const normCat = (s: string) => s.trim().toLowerCase().replace(/[_\s]+/g, ' ');
export const titleCat = (s: string) => normCat(s).replace(/\b\w/g, (m) => m.toUpperCase());
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** Inclusive list of YYYY-MM keys from `from` to `to`. */
export function monthRange(from: Date, to: Date): string[] {
  const out: string[] = [];
  let y = from.getUTCFullYear(), m = from.getUTCMonth();
  const ey = to.getUTCFullYear(), em = to.getUTCMonth();
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m + 1).padStart(2, '0')}`); m++; if (m > 11) { m = 0; y++; } }
  return out;
}

export function variance(planned: Prisma.Decimal.Value, actual: Prisma.Decimal.Value) {
  const p = D(planned), a = D(actual);
  return { variance: money(a.minus(p)), variancePct: p.gt(0) ? a.minus(p).div(p).times(100).toDecimalPlaces(1).toNumber() : null, overBudget: p.gt(0) && a.gt(p) };
}

export interface FlowEvent { month: string; inflow?: Dec; outflow?: Dec; forecast: boolean }
/** Rolls events up into per-month rows with actual vs forecast and a running cumulative net. */
export function rollMonths(months: string[], events: FlowEvent[]) {
  let cumulative = D(0);
  return months.map((month) => {
    const ev = events.filter((e) => e.month === month);
    const add = (f: boolean, k: 'inflow' | 'outflow') => ev.filter((e) => e.forecast === f).reduce((a, e) => a.plus(e[k] ?? D(0)), D(0));
    const inflowActual = add(false, 'inflow'), inflowForecast = add(true, 'inflow'), outflowActual = add(false, 'outflow'), outflowForecast = add(true, 'outflow');
    const net = inflowActual.plus(inflowForecast).minus(outflowActual).minus(outflowForecast);
    cumulative = cumulative.plus(net);
    return { month, inflowActual: money(inflowActual), inflowForecast: money(inflowForecast), outflowActual: money(outflowActual), outflowForecast: money(outflowForecast), inflow: money(inflowActual.plus(inflowForecast)), outflow: money(outflowActual.plus(outflowForecast)), net: money(net), cumulative: money(cumulative) };
  });
}
