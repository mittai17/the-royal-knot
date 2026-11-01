import { Role } from '@prisma/client';

/** Role groups used with @Roles(). FOUNDER always passes (see RolesGuard). CLIENT / VENDOR / SYSADMIN are never in the legacy groups. */
export const G = {
  CRM: [Role.PLANNER] as Role[],
  PLANNING: [Role.PLANNER, Role.EVENT_MANAGER] as Role[],
  EVENT_OPS: [Role.EVENT_MANAGER, Role.OPERATIONS, Role.PLANNER] as Role[],
  FINANCE_WRITE: [Role.FINANCE] as Role[],
  FINANCE_READ: [Role.FINANCE, Role.PLANNER] as Role[],
  ANALYTICS: [Role.FINANCE] as Role[],
  DOCS_WRITE: [Role.PLANNER, Role.FINANCE, Role.EVENT_MANAGER, Role.OPERATIONS] as Role[],
  ALL: [Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS] as Role[],
  // --- WedFlow additions ---
  /** Internal staff (everyone who works for the planning company, excluding sysadmin and external portals). */
  STAFF: [Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS] as Role[],
  APPROVERS: [Role.FOUNDER] as Role[],
  APPROVAL_REQUEST: [Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE] as Role[],
  SYSADMIN: [Role.SYSADMIN] as Role[],
  /** Staff + sysadmin (read-only directories such as the user list). */
  STAFF_AND_SYSADMIN: [Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS, Role.SYSADMIN] as Role[],
  CLIENT_PORTAL: [Role.CLIENT] as Role[],
  VENDOR_PORTAL: [Role.VENDOR] as Role[],
  /** Staff + the client of the wedding (scope with ScopeService). */
  STAFF_AND_CLIENT: [Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS, Role.CLIENT] as Role[],
  /** Staff + vendors (scope with ScopeService). */
  STAFF_AND_VENDOR: [Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS, Role.VENDOR] as Role[],
  /** Everybody who can sign in. */
  EVERYONE: [Role.PLANNER, Role.EVENT_MANAGER, Role.FINANCE, Role.OPERATIONS, Role.CLIENT, Role.VENDOR, Role.SYSADMIN] as Role[],
};

/** Roles whose access is default-deny: they only reach routes that list them in @Roles() or are marked @AllowExternal(). */
export const LOCKED_ROLES: Role[] = [Role.CLIENT, Role.VENDOR, Role.SYSADMIN];

/** Permission modules (keep in sync with frontend/lib/permissions.ts MODULES). */
export const MODULES = [
  'enquiries', 'clients', 'weddings', 'vendors', 'quotations', 'procurement', 'proposals', 'agreements', 'tasks', 'events', 'checklists', 'guests',
  'accommodation', 'transport', 'incidents', 'arrivals', 'payments', 'invoices', 'vendor-bills', 'expenses', 'reconciliation', 'budgets', 'approvals',
  'analytics', 'documents', 'media', 'messaging', 'announcements', 'feedback', 'notifications', 'team',
  'users', 'roles', 'org', 'master-data', 'config', 'integrations', 'email', 'storage', 'monitoring', 'audit', 'backups', 'maintenance',
  'portal-client', 'portal-vendor',
  // --- WP4 additions (master spec decisions 7, 8, 10 and Module 32) ---
  'vendor-payments', 'activity', 'business-settings', 'team-manage', 'expense-requests', 'ledger',
] as const;
export type PermModule = (typeof MODULES)[number];
export const ACTIONS = ['read', 'write', 'approve'] as const;

/**
 * Human readable permission matrix: 'module:action' strings. 'write' implies 'read'. FOUNDER = '*'.
 * Served by GET /users/permissions and used to seed the DB-backed RolePermission table.
 * Legacy action names (update, checkin) are kept for the existing Settings screen.
 */
/** Bump when PERMISSION_MATRIX changes: the seed then resets the DB-backed RolePermission rows to the new defaults. */
export const PERMISSION_MATRIX_VERSION = 'wp4-2026-11-01';

/**
 * Founder holds business oversight ('*') EXCEPT modifying posted accounting records: posted invoices, payments, bills and ledger
 * entries are corrected by Finance through reversal / correction entries ('ledger:write'), never edited by the Founder.
 */
export const FOUNDER_DENIED: readonly string[] = ['ledger:write'];

export const PERMISSION_MATRIX: Record<Role, string[]> = {
  FOUNDER: ['*'],
  // Planner proposes only for money: expense requests and approval requests, never executes or approves payments.
  PLANNER: [
    'enquiries:write', 'clients:write', 'weddings:write', 'vendors:write', 'quotations:write', 'procurement:write', 'proposals:write', 'agreements:write', 'tasks:write', 'events:write',
    'checklists:write', 'guests:write', 'accommodation:write', 'transport:write', 'incidents:write', 'payments:read', 'invoices:read', 'expenses:read', 'expense-requests:write', 'budgets:read',
    'approvals:write', 'documents:write', 'media:write', 'messaging:write', 'announcements:write', 'feedback:write', 'notifications:write', 'team:read', 'activity:write', 'analytics:read',
  ],
  // Event Manager reports extra costs (expense-requests) only; no approvals, no finance data.
  EVENT_MANAGER: [
    'events:write', 'tasks:write', 'checklists:write', 'guests:write', 'accommodation:write', 'transport:write', 'incidents:write', 'arrivals:write', 'documents:write',
    'weddings:read', 'vendors:read', 'expense-requests:write', 'messaging:write', 'announcements:read', 'feedback:read', 'notifications:write', 'media:write', 'activity:write', 'analytics:read',
  ],
  // Finance owns accounting. Procurement is read-only (business reference). Requests vendor payments; the Founder approves (maker-checker).
  FINANCE: [
    'payments:write', 'invoices:write', 'vendor-bills:write', 'vendor-payments:write', 'expenses:write', 'expense-requests:write', 'reconciliation:write', 'ledger:write', 'budgets:write',
    'procurement:read', 'approvals:write', 'analytics:read', 'documents:write', 'weddings:read', 'vendors:read', 'clients:read', 'quotations:read', 'messaging:write', 'notifications:write',
    'audit:read', 'activity:read',
  ],
  // Operations: assigned work only. No finance, no client directory, no commercial records.
  OPERATIONS: [
    'tasks:write', 'checklists:write', 'guests:write', 'accommodation:write', 'transport:write', 'arrivals:write', 'incidents:write', 'events:read', 'documents:write', 'weddings:read',
    'vendors:read', 'messaging:write', 'notifications:write', 'activity:write',
  ],
  // External roles: every module below is scoped to the user's own wedding / vendor record (see ScopeService).
  CLIENT: [
    'portal-client:write', 'weddings:read', 'events:read', 'vendors:read', 'guests:write', 'accommodation:read', 'transport:read', 'documents:read', 'invoices:read', 'payments:read',
    'media:write', 'checklists:read', 'announcements:read', 'feedback:write', 'messaging:write', 'agreements:read', 'proposals:read', 'notifications:write',
  ],
  VENDOR: [
    'portal-vendor:write', 'quotations:write', 'procurement:read', 'vendor-bills:write', 'vendor-payments:read', 'events:read', 'documents:read', 'announcements:read', 'messaging:write', 'feedback:write', 'notifications:write',
  ],
  // Infra / identity only. Deliberately no payments, invoices, expenses, vendor payments, budgets or approvals; no business settings.
  SYSADMIN: [
    'users:write', 'roles:write', 'org:write', 'master-data:write', 'config:write', 'integrations:write', 'email:write', 'storage:write', 'monitoring:read', 'audit:read',
    'backups:write', 'maintenance:write', 'notifications:write', 'team:read', 'analytics:read',
  ],
};

/** Expands PERMISSION_MATRIX into (role, module, action, allowed) rows for RolePermission seeding. */
export function expandMatrix(): { role: Role; module: string; action: string; allowed: boolean }[] {
  const rows: { role: Role; module: string; action: string; allowed: boolean }[] = [];
  for (const role of Object.keys(PERMISSION_MATRIX) as Role[]) {
    const grants = new Map<string, Set<string>>();
    const add = (m: string, a: string) => { if (!grants.has(m)) grants.set(m, new Set()); grants.get(m)!.add(a); };
    for (const g of PERMISSION_MATRIX[role]) {
      if (g === '*') { for (const m of MODULES) for (const a of ACTIONS) if (!(role === Role.FOUNDER && FOUNDER_DENIED.includes(`${m}:${a}`))) add(m, a); continue; }
      const [m, a] = g.split(':');
      add(m, a);
      if (a === 'write') add(m, 'read');
    }
    for (const m of MODULES) for (const a of ACTIONS) rows.push({ role, module: m, action: a, allowed: grants.get(m)?.has(a) ?? false });
  }
  return rows;
}
