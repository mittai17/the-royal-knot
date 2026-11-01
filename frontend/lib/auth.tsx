'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Role, User } from '@/types';

interface AuthCtx { user: User | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void>; can: (...roles: Role[]) => boolean }
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // The login page has no session to look up; skipping avoids a pointless 401 + refresh round-trip.
    if (typeof location !== 'undefined' && location.pathname.startsWith('/login')) { setLoading(false); return; }
    try { setUser((await api.get<{ user: User }>('/auth/me')).data.user); } catch { setUser(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally { setUser(null); location.href = '/login'; }
  }, []);

  const can = useCallback((...roles: Role[]) => !!user && (user.role === 'FOUNDER' || (user.role as string) === 'ADMIN' || roles.includes(user.role)), [user]);
  return <Ctx.Provider value={{ user, loading, refresh, logout, can }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

export const ROLE_LABEL: Record<string, string> = {
  FOUNDER: 'Founder / Director', ADMIN: 'Founder / Director', PLANNER: 'Wedding Planner', EVENT_MANAGER: 'Event Manager', FINANCE: 'Finance Manager', OPERATIONS: 'Operations Staff',
  CLIENT: 'Couple / Client', VENDOR: 'Vendor', SYSADMIN: 'System Administrator',
};
