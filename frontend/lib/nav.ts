import { Activity, BadgeCheck, BarChart3, BedDouble, Bell, Building2, Bus, Calendar, CalendarCheck, CalendarRange, ClipboardCheck, Contact, Database, DatabaseBackup, FileBarChart, FileSignature, FileSpreadsheet, FolderOpen, Gauge, HardDrive, HeartHandshake, Images, Inbox, KeyRound, LayoutDashboard, LifeBuoy, ListChecks, Mail, Megaphone, MessageCircle, MessagesSquare, PackageCheck, PiggyBank, Plug, RadioTower, Receipt, ReceiptText, ScrollText, ServerCog, Settings, ShieldAlert, ShieldCheck, ShoppingCart, SlidersHorizontal, Star, Store, Sun, TrendingUp, TriangleAlert, UserCheck, UserCog, UserRound, Users, Wallet, Wrench, type LucideIcon } from 'lucide-react';
import type { Role } from '@/types';

/**
 * Sidebars per role = parent groups with the exact items of MASTER_SPEC section 7 ("Sidebars per role").
 * One canonical route per domain: role-aware views of the same route, with ?tab= / ?view= for the spec's subpages.
 * Route table with owners and the query-param contract: docs/ROUTES.md. FOUNDER is explicit here, so the Founder never sees the client / vendor portals.
 */
export interface NavItem {
  /** Canonical route, optionally with ?tab= / ?view= query params. */
  href: string;
  label: string;
  icon: LucideIcon;
  countKey?: 'enquiries' | 'weddings';
  /** Small qualifier shown next to the label (e.g. "Read-only", "Oversight"). */
  tag?: string;
  /** Sub-items rendered indented under this item (spec brackets, e.g. Procurement [RFQs, Quotation Comparison, POs]). */
  children?: NavItem[];
  /** Extra pathname prefixes that keep this item highlighted (detail pages and secondary routes). */
  match?: string[];
}
export interface NavGroup { id: string; label: string; items: NavItem[] }

const it = (href: string, label: string, icon: LucideIcon, extra: Partial<NavItem> = {}): NavItem => ({ href, label, icon, ...extra });
const g = (id: string, label: string, ...items: NavItem[]): NavGroup => ({ id, label, items });

const dash = it('/dashboard', 'Dashboard', LayoutDashboard);
const comms = it('/communications', 'Communications', MessageCircle);
const announcements = it('/announcements', 'Announcements', Megaphone);
const feedback = it('/feedback', 'Feedback', LifeBuoy);
const docs = it('/documents', 'Documents', FolderOpen);
const notifications = it('/notifications', 'Notifications', Bell);
const activity = it('/activity', 'Activity Feed', Activity);
const guests = it('/guests', 'Guests', Users);
const accommodation = it('/accommodation', 'Accommodation', BedDouble);
const transport = it('/transport', 'Transport', Bus);
const calendar = it('/calendar', 'Calendar', Calendar);
const incidents = it('/incidents', 'Incidents', TriangleAlert);
const eventFunctions = it('/event-functions', 'Event Functions', CalendarRange);
const clients = it('/clients', 'Clients', Contact);
const vendors = it('/vendors', 'Vendors', Store);
const checkIn = it('/guests?tab=check-in', 'Check-in', UserCheck);
const runSheet = it('/command-centre?view=run-sheet', 'Run Sheet', RadioTower);
const vendorCheckin = it('/command-centre/vendor-checkin', 'Vendor Check-in', UserCheck);
const myTasks = it('/tasks?view=my', 'My Tasks', ListChecks);
const checklists = it('/tasks?view=checklists', 'Checklists', ClipboardCheck);

export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  FOUNDER: [
    g('overview', 'Overview', dash),
    g('crm', 'CRM & Clients', it('/enquiries', 'Enquiries', MessagesSquare, { countKey: 'enquiries' }), clients),
    g('weddings', 'Wedding Management', it('/weddings', 'Weddings', HeartHandshake, { countKey: 'weddings' }), it('/proposals', 'Proposals & Agreements', FileSignature), eventFunctions, calendar),
    g('vendors', 'Vendors & Procurement', vendors, it('/procurement', 'Procurement', ShoppingCart)),
    g('ops', 'Planning & Operations', it('/tasks', 'Planning & Tasks', ListChecks), it('/command-centre', 'Event Command Centre', RadioTower), incidents, guests, accommodation, transport),
    g('finance', 'Finance', it('/invoices', 'Client Invoices', ReceiptText), it('/payments', 'Client Payments', Wallet), it('/vendor-bills', 'Vendor Bills', Receipt), it('/vendor-payments', 'Vendor Payments', Wallet),
      it('/expenses', 'Expenses & Reconciliation', Receipt), it('/budgets', 'Budgets & Profitability', PiggyBank), it('/cash-flow', 'Cash Flow', TrendingUp), it('/financial-reports', 'Financial Reports', FileBarChart)),
    g('comms', 'Communication', comms, announcements, it('/feedback', 'Feedback & Requests', LifeBuoy), notifications, activity),
    g('governance', 'Management & Governance', it('/reports', 'Reports & Analytics', BarChart3), docs, it('/team', 'Team Management', UserCog), it('/audit-logs', 'Audit Logs', ScrollText), it('/settings', 'Business Settings', Settings)),
  ],
  PLANNER: [
    g('overview', 'Overview', dash),
    g('crm', 'CRM & Clients', it('/enquiries', 'Enquiries', MessagesSquare, { countKey: 'enquiries' }), clients),
    g('weddings', 'My Weddings', it('/weddings', 'My Weddings', HeartHandshake, { countKey: 'weddings' }), it('/proposals', 'Proposal Management', FileSignature), it('/proposals?tab=agreements', 'Agreements', FileSignature)),
    g('sourcing', 'Vendor Sourcing', vendors, it('/procurement', 'Procurement', ShoppingCart, { children: [it('/procurement?tab=rfqs', 'RFQs', FileSpreadsheet), it('/procurement?tab=comparison', 'Quotation Comparison', FileSpreadsheet), it('/procurement?tab=pos', 'POs', ShoppingCart)] })),
    g('planning', 'Planning', it('/tasks', 'Planning & Tasks', ListChecks), eventFunctions, calendar, it('/command-centre', 'Event Command Centre', RadioTower, { tag: 'Oversight' })),
    g('logistics', 'Guest & Logistics', guests, accommodation, transport),
    g('visibility', 'Financial Visibility', it('/invoices', 'Client Invoice Status', ReceiptText), it('/payments', 'Payment Status', Wallet), it('/expenses?tab=requests', 'Expense Requests', Receipt), it('/approvals?view=mine', 'My Approval Requests', BadgeCheck)),
    g('collab', 'Collaboration', comms, announcements, feedback, docs, notifications, it('/team', 'My Team & Assignments', UserCog), activity),
  ],
  FINANCE: [
    g('overview', 'Overview', dash),
    g('refs', 'Business References', clients, it('/weddings', 'Weddings', HeartHandshake), vendors, it('/procurement', 'Procurement & POs', ShoppingCart, { tag: 'Read-only' })),
    g('ar', 'Accounts Receivable', it('/invoices', 'Client Invoices', ReceiptText), it('/payments', 'Client Payments', Wallet)),
    g('ap', 'Accounts Payable', it('/vendor-bills', 'Vendor Bills', Receipt), it('/vendor-payments', 'Vendor Payments', Wallet)),
    g('expense', 'Expense Control', it('/expenses', 'Expenses & Reconciliation', Receipt), it('/approvals', 'Approvals', BadgeCheck)),
    g('planning', 'Financial Planning', it('/budgets', 'Budgets & Profitability', PiggyBank), it('/cash-flow', 'Cash Flow', TrendingUp)),
    g('reporting', 'Reporting', it('/financial-reports', 'Financial Reports', FileBarChart), it('/reports', 'Reports & Analytics', BarChart3, { tag: 'Limited' })),
    g('supporting', 'Supporting', comms, docs, notifications, it('/audit-logs', 'Audit Logs', ScrollText), it('/settings', 'Finance Settings', Settings)),
  ],
  EVENT_MANAGER: [
    g('overview', 'Overview', dash),
    g('weddings', 'My Weddings', it('/weddings', 'Assigned Weddings', HeartHandshake, { countKey: 'weddings' })),
    g('eventops', 'Event Operations', eventFunctions, it('/command-centre?view=today', 'Today’s Events', Sun), it('/command-centre', 'Event Command Centre', RadioTower), runSheet, vendorCheckin, incidents, calendar),
    g('vendors', 'Assigned Vendors', it('/vendors', 'Vendor Directory', Store), it('/command-centre?view=arrivals', 'Vendor Arrival Status', UserCheck)),
    g('guestops', 'Guest Operations', guests, checkIn, accommodation, transport),
    g('execution', 'Execution', myTasks, checklists),
    g('collab', 'Collaboration', comms, announcements, feedback, docs, notifications),
  ],
  OPERATIONS: [
    g('overview', 'Overview', dash),
    g('work', 'My Work', it('/weddings', 'My Assigned Weddings', HeartHandshake, { countKey: 'weddings' }), myTasks, checklists, it('/command-centre?view=run-sheet', 'Assigned Run Sheet', RadioTower)),
    g('support', 'Event Support', it('/event-functions', 'Assigned Event Functions', CalendarRange), it('/vendors', 'Assigned Vendors', Store), it('/guests?tab=check-in', 'Guest Check-in Support', UserCheck)),
    g('logistics', 'Logistics', accommodation, transport, calendar),
    g('issues', 'Issues & Updates', it('/incidents', 'Incident / Blocker Reports', TriangleAlert), it('/activity?tab=work-logs', 'Daily Updates & Work Logs', Activity)),
    g('comms', 'Communication', comms, docs, notifications, it('/settings', 'Profile Preferences', Settings)),
  ],
  CLIENT: [
    g('wedding', 'My Wedding', it('/client-portal/dashboard', 'Dashboard', LayoutDashboard), it('/client-portal/wedding', 'My Wedding', HeartHandshake), it('/client-portal/planner', 'Our Planner', UserRound)),
    g('experience', 'Wedding Experience', it('/client-portal/schedule', 'Event Schedule', CalendarRange), it('/client-portal/vendors', 'Vendors & Services', Store), it('/client-portal/checklists', 'My Decisions & To-dos', ClipboardCheck)),
    g('guests', 'Guests & Travel', it('/client-portal/guests', 'Guests & RSVPs', Users), it('/client-portal/accommodation', 'Accommodation', BedDouble), it('/client-portal/transport', 'Transport', Bus)),
    g('money', 'Money & Documents', it('/client-portal/payments', 'Payments & Invoices', Wallet), it('/client-portal/documents', 'Documents & Contracts', FolderOpen)),
    g('comms', 'Communication', it('/client-portal/chat', 'Chat & Support', MessageCircle), it('/client-portal/announcements', 'Announcements & Updates', Megaphone), it('/client-portal/feedback', 'Feedback & Requests', LifeBuoy)),
    g('memories', 'Memories', it('/client-portal/media', 'Photos & Media', Images)),
    g('account', 'Account', it('/client-portal/settings', 'Settings', Settings)),
  ],
  VENDOR: [
    g('overview', 'Overview', it('/vendor-portal/dashboard', 'Dashboard', LayoutDashboard)),
    g('procurement', 'Procurement', it('/vendor-portal/rfqs', 'New RFQs', Inbox), it('/vendor-portal/quotations', 'My Quotations', FileSpreadsheet)),
    g('work', 'Work', it('/vendor-portal/bookings', 'My Bookings', CalendarCheck), it('/vendor-portal/schedule', 'Event Schedule', CalendarRange), it('/vendor-portal/deliverables', 'Deliverables & Tasks', PackageCheck, { match: ['/vendor-portal/tasks'] }), it('/vendor-portal/check-in', 'Check-in / Check-out', UserCheck)),
    g('commercial', 'Commercial', it('/vendor-portal/contracts', 'Agreements & Contracts', FileSignature), it('/vendor-portal/invoices', 'Invoices & Payments', ReceiptText)),
    g('profile', 'Profile', it('/vendor-portal/profile', 'My Profile & Services', Store), it('/vendor-portal/reviews', 'Reviews & Feedback', Star)),
    g('comms', 'Communication', it('/vendor-portal/messages', 'Communications', MessageCircle), it('/vendor-portal/announcements', 'Announcements', Megaphone), it('/vendor-portal/support', 'Support', LifeBuoy)),
    g('account', 'Account', it('/vendor-portal/documents', 'Documents', FolderOpen), it('/vendor-portal/settings', 'Settings', Settings)),
  ],
  // SYSADMIN: exactly the spec's 11 groups. No generic /settings (Application Settings / System Configuration live under /admin/*).
  SYSADMIN: [
    g('overview', 'Overview', it('/admin/dashboard', 'System Dashboard', Gauge)),
    g('identity', 'Identity & Access', it('/admin/users', 'User Management', Users), it('/admin/roles', 'Roles & Permissions', ShieldCheck)),
    g('org', 'Organization', it('/admin/organization', 'Organization Setup', Building2), it('/admin/master-data', 'Master Data', Database)),
    g('config', 'Configuration', it('/admin/configuration', 'System Configuration', SlidersHorizontal), it('/admin/configuration?tab=application', 'Application Settings', Settings)),
    g('integrations', 'Integrations', it('/admin/integrations?tab=keycloak', 'Keycloak', KeyRound), it('/admin/integrations?tab=smtp', 'Email SMTP', Mail), it('/admin/integrations?tab=payment-gateway', 'Payment Gateway', Plug), it('/admin/integrations?tab=maps', 'Maps', Plug), it('/admin/integrations?tab=other', 'Other APIs', Plug)),
    g('commsinfra', 'Communication Infrastructure', it('/admin/email', 'Email & Notifications', Mail), it('/admin/email?tab=configuration', 'Mail Configuration', Mail)),
    g('storage', 'Storage', it('/admin/storage?tab=config', 'MinIO Configuration', HardDrive), it('/admin/storage?tab=buckets', 'Bucket Management', HardDrive), it('/admin/storage?tab=monitoring', 'File Storage Monitoring', HardDrive)),
    g('health', 'System Health', it('/admin/monitoring', 'System Monitoring', Activity), it('/admin/monitoring?tab=api', 'API Health', Activity), it('/admin/monitoring?tab=database', 'Database Health', Database), it('/admin/monitoring?tab=redis', 'Redis Health', ServerCog), it('/admin/monitoring?tab=queues', 'Queue Monitoring', ServerCog)),
    g('security', 'Security', it('/admin/audit', 'Audit Logs', ScrollText), it('/admin/audit?tab=security', 'Security Events', ShieldAlert)),
    g('recovery', 'Recovery & Maintenance', it('/admin/backups', 'Backups & Recovery', DatabaseBackup), it('/admin/maintenance', 'Maintenance', Wrench)),
    g('support', 'Reporting & Support', it('/admin/reports', 'System Reports', BarChart3), it('/admin/support-logs', 'Support & Diagnostic Logs', LifeBuoy)),
  ],
};

/** Sidebar groups for a role. */
export function navFor(role: Role | undefined | string): NavGroup[] {
  if (!role) return [];
  const normalized = (role === 'ADMIN' ? 'FOUNDER' : role) as Role;
  return NAV_BY_ROLE[normalized] ?? [];
}

/** Every item (children included) in sidebar order. */
export function flatNav(role: Role | undefined | string): NavItem[] {
  const groups = navFor(role);
  if (!groups || !Array.isArray(groups)) return [];
  return groups.flatMap((grp) => (grp?.items || []).flatMap((i) => [i, ...(i?.children ?? [])]));
}

/** Where a role's profile / preferences screen lives (null: none, SYSADMIN has no generic Settings). */
export const SETTINGS_HREF: Record<Role, string | null> = {
  FOUNDER: '/settings', PLANNER: '/settings', EVENT_MANAGER: '/settings', FINANCE: '/settings', OPERATIONS: '/settings',
  CLIENT: '/client-portal/settings', VENDOR: '/vendor-portal/settings', SYSADMIN: null,
};
export const SETTINGS_LABEL: Partial<Record<Role, string>> = { FOUNDER: 'Business Settings', FINANCE: 'Finance Settings' };

const split = (href: string) => { const [p, q = ''] = href.split('?'); return { path: p, query: new URLSearchParams(q) }; };

/**
 * The single item that is "current" for a URL: the one whose path matches and whose query params all match, preferring the most specific
 * (so /command-centre?view=today highlights Today's Events, plain /command-centre highlights Event Command Centre). Falls back to the first
 * path match, so sections that ignore ?tab= still highlight something.
 */
/**
 * Flat list of every nav entry with the roles that see it.
 * Used by the e2e sweep spec: NAV.filter(n => n.roles.includes(role)).map(n => n.href)
 */
export const NAV: { href: string; roles: Role[] }[] = (Object.entries(NAV_BY_ROLE) as [Role, NavGroup[]][]).reduce<{ href: string; roles: Role[] }[]>((acc, [role, groups]) => {
  for (const grp of groups) {
    for (const item of grp.items) {
      const addItem = (it: NavItem) => {
        const existing = acc.find((e) => e.href === it.href);
        if (existing) { if (!existing.roles.includes(role)) existing.roles.push(role); }
        else acc.push({ href: it.href, roles: [role] });
        for (const child of it.children ?? []) addItem(child);
      };
      addItem(item);
    }
  }
  return acc;
}, []);

export function activeHref(role: Role | undefined, pathname: string, search: URLSearchParams): string | null {
  let best: { href: string; score: number; len: number } | null = null;
  for (const item of flatNav(role)) {
    const { path, query } = split(item.href);
    const onPath = pathname === path || pathname.startsWith(path + '/') || (item.match ?? []).some((m) => pathname === m || pathname.startsWith(m + '/'));
    if (!onPath) continue;
    let score = 0;
    let all = true;
    for (const [k, v] of query) { if (search.get(k) === v) score += 2; else all = false; }
    const s = all ? score : -1; // -1: path-only fallback
    if (!best || s > best.score || (s === best.score && path.length > best.len)) best = { href: item.href, score: s, len: path.length };
  }
  return best?.href ?? null;
}
