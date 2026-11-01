import type { Role } from '@/types';

/** Mirrors backend/src/common/permissions.ts. FOUNDER always passes (see useAuth().can). */
export const G = {
  CRM: ['PLANNER'],
  PLANNING: ['PLANNER', 'EVENT_MANAGER'],
  EVENT_OPS: ['EVENT_MANAGER', 'OPERATIONS', 'PLANNER'],
  FINANCE_WRITE: ['FINANCE'],
  FINANCE_READ: ['FINANCE', 'PLANNER'],
  ANALYTICS: ['FINANCE'],
  DOCS_WRITE: ['PLANNER', 'FINANCE', 'EVENT_MANAGER', 'OPERATIONS'],
  ALL: ['PLANNER', 'EVENT_MANAGER', 'FINANCE', 'OPERATIONS'],
  // --- WedFlow additions ---
  STAFF: ['PLANNER', 'EVENT_MANAGER', 'FINANCE', 'OPERATIONS'],
  APPROVERS: ['FOUNDER'],
  APPROVAL_REQUEST: ['PLANNER', 'EVENT_MANAGER', 'FINANCE'],
  SYSADMIN: ['SYSADMIN'],
  STAFF_AND_SYSADMIN: ['PLANNER', 'EVENT_MANAGER', 'FINANCE', 'OPERATIONS', 'SYSADMIN'],
  CLIENT_PORTAL: ['CLIENT'],
  VENDOR_PORTAL: ['VENDOR'],
  STAFF_AND_CLIENT: ['PLANNER', 'EVENT_MANAGER', 'FINANCE', 'OPERATIONS', 'CLIENT'],
  STAFF_AND_VENDOR: ['PLANNER', 'EVENT_MANAGER', 'FINANCE', 'OPERATIONS', 'VENDOR'],
  EVERYONE: ['PLANNER', 'EVENT_MANAGER', 'FINANCE', 'OPERATIONS', 'CLIENT', 'VENDOR', 'SYSADMIN'],
} as const satisfies Record<string, readonly Role[]>;

/** Roles that are default-deny on the API (only explicitly granted routes). */
export const LOCKED_ROLES: readonly Role[] = ['CLIENT', 'VENDOR', 'SYSADMIN'];
export const isExternalRole = (r?: Role) => r === 'CLIENT' || r === 'VENDOR';

/** Where each role lands after sign-in, and the only URL prefix it may browse (besides /notifications). */
export const HOME: Record<Role, string> = {
  FOUNDER: '/dashboard', PLANNER: '/dashboard', EVENT_MANAGER: '/dashboard', FINANCE: '/dashboard', OPERATIONS: '/dashboard',
  CLIENT: '/client-portal/dashboard', VENDOR: '/vendor-portal/dashboard', SYSADMIN: '/admin/dashboard',
};
/** Routes every role may open besides its own area (SYSADMIN deliberately has NO /settings: it uses /admin/*). */
export const SHARED_PREFIXES: Partial<Record<Role, readonly string[]>> = { CLIENT: ['/notifications'], VENDOR: ['/notifications'], SYSADMIN: ['/notifications'] };
export const AREA_PREFIX: Partial<Record<Role, string>> = { CLIENT: '/client-portal', VENDOR: '/vendor-portal', SYSADMIN: '/admin' };

/** Permission modules (mirrors MODULES in the backend file). */
export const MODULES = [
  'enquiries', 'clients', 'weddings', 'vendors', 'quotations', 'procurement', 'proposals', 'agreements', 'tasks', 'events', 'checklists', 'guests',
  'accommodation', 'transport', 'incidents', 'arrivals', 'payments', 'invoices', 'vendor-bills', 'expenses', 'reconciliation', 'budgets', 'approvals',
  'analytics', 'documents', 'media', 'messaging', 'announcements', 'feedback', 'notifications', 'team',
  'users', 'roles', 'org', 'master-data', 'config', 'integrations', 'email', 'storage', 'monitoring', 'audit', 'backups', 'maintenance',
  'portal-client', 'portal-vendor',
  'vendor-payments', 'activity', 'business-settings', 'team-manage', 'expense-requests', 'ledger',
] as const;
export type PermModule = (typeof MODULES)[number];

/** Mirrors PERMISSION_MATRIX in the backend file ('module:action'; write implies read; FOUNDER = '*' minus FOUNDER_DENIED). Live values come from GET /config/my-permissions. */
/** Bump when PERMISSION_MATRIX changes: the seed then resets the DB-backed RolePermission rows to the new defaults. */
export const PERMISSION_MATRIX_VERSION = 'wp4-2026-11-01';

/**
 * Founder holds business oversight ('*') EXCEPT modifying posted accounting records: posted invoices, payments, bills and ledger
 * entries are corrected by Finance through reversal / correction entries ('ledger:write'), never edited by the Founder.
 */
export const FOUNDER_DENIED: readonly string[] = ['ledger:write'];

export const PERMISSION_MATRIX: Record<Role, readonly string[]> = {
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

/** Static check against the mirrored matrix (UI hint only; the API is authoritative). write implies read. */
export function roleHas(role: Role | undefined, module: PermModule, action: 'read' | 'write' | 'approve' = 'read'): boolean {
  if (!role) return false;
  if (role === 'FOUNDER') return !FOUNDER_DENIED.includes(`${module}:${action}`);
  const g = PERMISSION_MATRIX[role];
  return g.includes(`${module}:${action}`) || (action === 'read' && g.includes(`${module}:write`));
}
