import { arrivalBucket, dayRange, deriveStatus } from './event-ops.service';

describe('event ops helpers', () => {
  it('dayRange honours the caller timezone', () => {
    const r = dayRange({ date: '2026-11-05', tz: 330 });
    expect(r.start.toISOString()).toBe('2026-11-04T18:30:00.000Z');
    expect(r.end.getTime() - r.start.getTime()).toBe(864e5);
    expect(r.date).toBe('2026-11-05');
  });
  it('dayRange defaults to the current day in the given offset', () => {
    const r = dayRange({ tz: 330 }, new Date('2026-11-05T20:00:00Z')); // 01:30 next day in IST
    expect(r.date).toBe('2026-11-06');
  });
  it('deriveStatus prefers the explicit override and falls back to the date', () => {
    const now = new Date('2026-11-05T10:00:00Z');
    expect(deriveStatus(new Date('2026-11-01T10:00:00Z'), undefined, now)).toBe('COMPLETED');
    expect(deriveStatus(new Date('2026-11-05T08:00:00Z'), undefined, now)).toBe('IN_PROGRESS');
    expect(deriveStatus(new Date('2026-11-05T08:00:00Z'), { endAt: '2026-11-05T09:00:00Z' }, now)).toBe('COMPLETED');
    expect(deriveStatus(new Date('2026-11-09T10:00:00Z'), undefined, now)).toBe('UPCOMING');
    expect(deriveStatus(new Date('2026-11-01T10:00:00Z'), { status: 'CANCELLED' }, now)).toBe('CANCELLED');
  });
  it('arrivalBucket maps vendor arrival states', () => {
    expect(arrivalBucket(null)).toBe('pending');
    expect(arrivalBucket({ status: 'NOT_ARRIVED' })).toBe('pending');
    expect(arrivalBucket({ status: 'ARRIVED' })).toBe('arrived');
    expect(arrivalBucket({ status: 'DELAYED' })).toBe('delayed');
    expect(arrivalBucket({ status: 'COMPLETED' })).toBe('completed');
  });
});
