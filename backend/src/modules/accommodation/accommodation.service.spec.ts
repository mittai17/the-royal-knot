import { overlaps } from './accommodation.service';

describe('stay overlap', () => {
  const d = (s: string) => new Date(`2026-11-${s}T12:00:00Z`);
  it('shares a night', () => expect(overlaps({ checkIn: d('01'), checkOut: d('03') }, { checkIn: d('02'), checkOut: d('04') })).toBe(true));
  it('back-to-back stays do not overlap', () => expect(overlaps({ checkIn: d('01'), checkOut: d('03') }, { checkIn: d('03'), checkOut: d('05') })).toBe(false));
});
