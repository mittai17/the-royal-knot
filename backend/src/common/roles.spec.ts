import { Role } from '@prisma/client';

describe('Role enum', () => {
  it('is exactly the 8 master-spec role codes (no generic ADMIN)', () => {
    expect(Object.values(Role).sort()).toEqual(['CLIENT', 'EVENT_MANAGER', 'FINANCE', 'FOUNDER', 'OPERATIONS', 'PLANNER', 'SYSADMIN', 'VENDOR']);
    expect(Object.values(Role)).not.toContain('ADMIN');
  });
});
