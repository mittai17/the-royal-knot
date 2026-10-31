import { canMoveTrip, normPlate, tidyPlate } from './transport.service';

describe('trip status flow', () => {
  it('allows forward moves', () => { expect(canMoveTrip('SCHEDULED', 'IN_PROGRESS')).toBe(true); expect(canMoveTrip('IN_PROGRESS', 'COMPLETED')).toBe(true); });
  it('blocks leaving a finished trip', () => { expect(canMoveTrip('COMPLETED', 'SCHEDULED')).toBe(false); expect(canMoveTrip('IN_PROGRESS', 'SCHEDULED')).toBe(false); });
  it('allows re-scheduling a cancelled trip', () => expect(canMoveTrip('CANCELLED', 'SCHEDULED')).toBe(true));
});

describe('plates', () => {
  it('compares ignoring case, spaces and dashes', () => expect(normPlate('rj14-ca 2210')).toBe(normPlate('RJ14 CA 2210')));
  it('tidies for display', () => expect(tidyPlate('  rj14   ca 2210 ')).toBe('RJ14 CA 2210'));
});
