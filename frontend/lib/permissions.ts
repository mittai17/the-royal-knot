import type { Role } from '@/types';

/** Mirrors backend/src/common/permissions.ts. ADMIN always passes (see useAuth().can). */
export const G = {
  CRM: ['PLANNER'],
  PLANNING: ['PLANNER', 'EVENT_MANAGER'],
  EVENT_OPS: ['EVENT_MANAGER', 'OPERATIONS', 'PLANNER'],
  FINANCE_WRITE: ['FINANCE'],
  FINANCE_READ: ['FINANCE', 'PLANNER'],
  ANALYTICS: ['FINANCE'],
  ALL: ['PLANNER', 'EVENT_MANAGER', 'FINANCE', 'OPERATIONS'],
} as const satisfies Record<string, readonly Role[]>;
