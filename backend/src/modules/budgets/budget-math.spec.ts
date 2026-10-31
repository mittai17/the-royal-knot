import { D } from '../../common/finance';
import { toCsv } from './csv';
import { monthRange, normCat, rollMonths, variance } from './budget-math';

describe('budget math', () => {
  it('normalises categories', () => { expect(normCat(' Photo_graphy ')).toBe('photo graphy'); expect(normCat('LIGHTING')).toBe('lighting'); });
  it('computes variance and over-budget flag', () => {
    const v = variance(1000, 1250);
    expect(v.variance.toString()).toBe('250'); expect(v.variancePct).toBe(25); expect(v.overBudget).toBe(true);
    expect(variance(0, 50).variancePct).toBeNull();
  });
  it('lists months across a year boundary', () => {
    expect(monthRange(new Date('2026-11-01'), new Date('2027-02-15'))).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
  it('rolls actual + forecast into net and cumulative', () => {
    const rows = rollMonths(['2026-10', '2026-11'], [
      { month: '2026-10', inflow: D(1000), forecast: false }, { month: '2026-10', outflow: D(400), forecast: false },
      { month: '2026-11', inflow: D(500), forecast: true }, { month: '2026-11', outflow: D(900), forecast: true },
    ]);
    expect(rows[0].net.toString()).toBe('600');
    expect(rows[1].net.toString()).toBe('-400');
    expect(rows[1].cumulative.toString()).toBe('200');
    expect(rows[1].inflowForecast.toString()).toBe('500');
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2' }])).toBe('a,b,c\r\n"x,y","say ""hi""","l1\nl2"\r\n');
  });
  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    const csv = toCsv([{ a: '=SUM(A1)', b: '-12.5', c: '-cmd' }]);
    expect(csv).toContain("'=SUM(A1),-12.5,'-cmd");
  });
});
