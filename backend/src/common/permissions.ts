import { Role } from '@prisma/client';

/** Role groups used with @Roles(). ADMIN always passes (see RolesGuard). */
export const G = {
  CRM: [Role.PLANNER] as Role[],
  PLANNING: [Role.PLANNER, Role.EVENT_MANAGER] as Role[],
  EVENT_OPS: [Role.EVENT_MANAGER, Role.OPERATIONS, Role.PLANNER] as Role[],
  FINANCE_WRITE: [Role.FINANCE] as Role[],
  FINANCE_READ: [Role.FINANCE, Role.PLANNER] as Role[],
  ANALYTICS: [Role.FINANCE] as Role[],
  DOCS_WRITE: [Role.PLANNER, Role.FINANCE, Role.EVENT_MANAGER, Role.OPERATIONS] as Role[],
  ALL: [Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS] as Role[],
};

/** Human readable permission matrix (served by GET /users/permissions for the Settings screen). */
export const PERMISSION_MATRIX: Record<Role, string[]> = {
  ADMIN: ['*'],
  PLANNER: ['enquiries:write', 'weddings:write', 'vendors:write', 'quotations:write', 'tasks:write', 'guests:write', 'agreements:write', 'payments:read', 'documents:write', 'events:write'],
  EVENT_MANAGER: ['events:write', 'tasks:write', 'guests:write', 'incidents:write', 'documents:write', 'weddings:read'],
  FINANCE: ['payments:write', 'expenses:write', 'reconciliation:write', 'analytics:read', 'documents:write', 'weddings:read'],
  OPERATIONS: ['tasks:update', 'guests:checkin', 'arrivals:write', 'incidents:write', 'documents:write', 'weddings:read'],
};
