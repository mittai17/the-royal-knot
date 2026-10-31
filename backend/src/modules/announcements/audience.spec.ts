import { Role } from '@prisma/client';
import { addressedTo, audienceKey, audienceRoles, TEAM_ROLES } from './audience';

describe('announcement audience', () => {
  it('maps UI audiences to role arrays and back', () => {
    expect(audienceRoles('ALL')).toEqual([]);
    expect(audienceRoles('CLIENTS')).toEqual([Role.CLIENT]);
    expect(audienceRoles('TEAM')).toEqual(TEAM_ROLES);
    for (const k of ['ALL', 'CLIENTS', 'VENDORS', 'TEAM'] as const) expect(audienceKey(audienceRoles(k))).toBe(k);
  });
  it('builds a role-addressed filter that excludes expired items', () => {
    const w = addressedTo(Role.CLIENT, new Date('2026-01-01'));
    expect(JSON.stringify(w)).toContain('"has":"CLIENT"');
    expect(JSON.stringify(w)).toContain('expiresAt');
  });
});
