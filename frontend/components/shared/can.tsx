'use client';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { EmptyState } from '@/components/ui/primitives';
import type { Role } from '@/types';

/** Renders children only when the signed-in role may perform the action (mirrors the backend @Roles guard). */
export function Can({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...roles) ? <>{children}</> : null;
}

/** Page-level gate for screens the API refuses to serve to a role. */
export function RoleGate({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { can, loading } = useAuth();
  if (loading) return null;
  if (!can(...roles)) return <EmptyState title="You don’t have access to this screen" hint="Your role doesn’t include it. Ask a Founder / Director if you need access." />;
  return <>{children}</>;
}
