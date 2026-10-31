import type { Role } from '@/types';

/** Mirrors backend/src/common/permissions.ts. ADMIN always passes (see useAuth().can). */
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
  APPROVERS: ['ADMIN'],
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

/** Where each role lands after sign-in, and the only URL prefix it may browse (besides /settings, /notifications). */
export const HOME: Record<Role, string> = {
  ADMIN: '/dashboard', PLANNER: '/dashboard', EVENT_MANAGER: '/dashboard', FINANCE: '/dashboard', OPERATIONS: '/dashboard',
  CLIENT: '/client-portal/dashboard', VENDOR: '/vendor-portal/dashboard', SYSADMIN: '/admin/dashboard',
};
export const AREA_PREFIX: Partial<Record<Role, string>> = { CLIENT: '/client-portal', VENDOR: '/vendor-portal', SYSADMIN: '/admin' };

/** Permission modules (mirrors MODULES in the backend file). */
export const MODULES = [
  'enquiries', 'clients', 'weddings', 'vendors', 'quotations', 'procurement', 'proposals', 'agreements', 'tasks', 'events', 'checklists', 'guests',
  'accommodation', 'transport', 'incidents', 'arrivals', 'payments', 'invoices', 'vendor-bills', 'expenses', 'reconciliation', 'budgets', 'approvals',
  'analytics', 'documents', 'media', 'messaging', 'announcements', 'feedback', 'notifications', 'team',
  'users', 'roles', 'org', 'master-data', 'config', 'integrations', 'email', 'storage', 'monitoring', 'audit', 'backups', 'maintenance',
  'portal-client', 'portal-vendor',
] as const;
export type PermModule = (typeof MODULES)[number];

/** Mirrors PERMISSION_MATRIX in the backend file ('module:action'; write implies read; ADMIN = '*'). Live values come from GET /users/permissions. */
export const PERMISSION_MATRIX: Record<Role, readonly string[]> = {
  ADMIN: ['*'],
  PLANNER: [
    'enquiries:write', 'clients:write', 'weddings:write', 'vendors:write', 'quotations:write', 'procurement:write', 'proposals:write', 'agreements:write', 'tasks:write', 'events:write',
    'checklists:write', 'guests:write', 'accommodation:write', 'transport:write', 'payments:read', 'invoices:read', 'budgets:read', 'approvals:write', 'documents:write', 'media:write',
    'messaging:write', 'announcements:write', 'feedback:write', 'notifications:write', 'team:read', 'analytics:read',
  ],
  EVENT_MANAGER: [
    'events:write', 'tasks:write', 'checklists:write', 'guests:write', 'accommodation:write', 'transport:write', 'incidents:write', 'arrivals:write', 'documents:write',
    'weddings:read', 'vendors:read', 'messaging:write', 'announcements:read', 'feedback:read', 'notifications:write', 'media:write', 'analytics:read',
  ],
  FINANCE: [
    'payments:write', 'invoices:write', 'vendor-bills:write', 'expenses:write', 'reconciliation:write', 'budgets:write', 'procurement:write', 'approvals:write', 'analytics:read',
    'documents:write', 'weddings:read', 'vendors:read', 'clients:read', 'quotations:read', 'messaging:write', 'notifications:write', 'audit:read',
  ],
  OPERATIONS: [
    'tasks:write', 'checklists:write', 'guests:write', 'accommodation:write', 'transport:write', 'arrivals:write', 'incidents:write', 'events:read', 'documents:write', 'weddings:read',
    'vendors:read', 'messaging:write', 'notifications:write',
  ],
  CLIENT: [
    'portal-client:write', 'weddings:read', 'events:read', 'vendors:read', 'guests:write', 'accommodation:read', 'transport:read', 'documents:read', 'invoices:read', 'payments:read',
    'media:write', 'checklists:read', 'announcements:read', 'feedback:write', 'messaging:write', 'agreements:read', 'proposals:read', 'notifications:write',
  ],
  VENDOR: [
    'portal-vendor:write', 'quotations:write', 'procurement:read', 'vendor-bills:write', 'events:read', 'documents:read', 'announcements:read', 'messaging:write', 'feedback:write', 'notifications:write',
  ],
  SYSADMIN: [
    'users:write', 'roles:write', 'org:write', 'master-data:write', 'config:write', 'integrations:write', 'email:write', 'storage:write', 'monitoring:read', 'audit:read',
    'backups:write', 'maintenance:write', 'notifications:write', 'team:read', 'analytics:read',
  ],
};
