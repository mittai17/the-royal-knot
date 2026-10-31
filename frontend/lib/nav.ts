import { LayoutDashboard, MessagesSquare, HeartHandshake, Store, FileSpreadsheet, ListChecks, RadioTower, Users, Wallet, Receipt, BarChart3, FolderOpen, UserCog, Settings, type LucideIcon } from 'lucide-react';

import type { Role } from '@/types';
import { G } from '@/lib/permissions';

export interface NavItem { href: string; label: string; icon: LucideIcon; countKey?: 'enquiries' | 'weddings'; roles?: readonly Role[] }
export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/enquiries', label: 'Enquiries', icon: MessagesSquare, countKey: 'enquiries' },
  { href: '/weddings', label: 'Weddings', icon: HeartHandshake, countKey: 'weddings' },
  { href: '/vendors', label: 'Vendors', icon: Store },
  { href: '/quotations', label: 'Quotations', icon: FileSpreadsheet },
  { href: '/tasks', label: 'Planning & Tasks', icon: ListChecks },
  { href: '/command-centre', label: 'Event Command Centre', icon: RadioTower },
  { href: '/guests', label: 'Guests', icon: Users },
  { href: '/payments', label: 'Payments', icon: Wallet, roles: G.FINANCE_READ },
  { href: '/expenses', label: 'Expenses & Reconciliation', icon: Receipt, roles: G.FINANCE_READ },
  { href: '/reports', label: 'Reports & Analytics', icon: BarChart3, roles: G.ANALYTICS },
  { href: '/documents', label: 'Documents', icon: FolderOpen },
  { href: '/team', label: 'Team Management', icon: UserCog },
  { href: '/settings', label: 'Settings', icon: Settings },
];
