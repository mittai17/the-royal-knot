'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert, ArrowLeft, Users, Check, Loader2, Sparkles, KeyRound } from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';
import { useAuth, ROLE_LABEL } from '@/lib/auth';
import { DEMO_USERS, DEMO_PASSWORD } from '@/lib/config';
import { HOME } from '@/lib/permissions';
import { api } from '@/lib/api';

export default function ForbiddenPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchErr, setSwitchErr] = useState<string | null>(null);

  const attemptedPath = searchParams.get('from') || searchParams.get('path') || 'Requested Resource';
  const requiredRoles = searchParams.get('required') || 'FOUNDER or FINANCE';

  const switchRole = async (email: string, targetRole: string) => {
    setSwitching(email);
    setSwitchErr(null);
    try {
      await api.post('/auth/login', { email, password: DEMO_PASSWORD });
      const dest = searchParams.get('from') || HOME[targetRole as keyof typeof HOME] || '/dashboard';
      window.location.href = dest;
    } catch (e) {
      setSwitchErr(e instanceof Error ? e.message : 'Unable to switch role');
      setSwitching(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F5F1] flex flex-col items-center justify-center p-6 relative">
      <div className="w-full max-w-xl relative z-10 text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-white border border-[#E9E4DE] shadow-card grid place-items-center">
          <LotusMark className="h-9 w-9 text-[#401827]" />
        </div>

        <div className="card p-8 sm:p-10 border border-[#E9E4DE] bg-white shadow-pop text-left space-y-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-[#F9E5E5] border border-[#C94B4B]/20 text-[#C94B4B] grid place-items-center shrink-0">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F9E5E5] text-[#C94B4B] text-[11px] font-semibold uppercase tracking-wider">
                403 · Access Restricted
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl text-[#28121D] font-normal">
                Restricted Suite
              </h1>
              <p className="text-sm text-[#777078]">
                Your authenticated profile lacks the clearance policy required for this operational route.
              </p>
            </div>
          </div>

          {/* User Details & Clearance Spec */}
          <div className="p-4 rounded-xl bg-[#F0ECE6]/70 border border-[#E9E4DE] space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#777078]">Current Active Account:</span>
              <span className="font-medium text-[#242124]">{user?.name ?? 'Signed In Staff'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#777078]">Your Role Clearance:</span>
              <span className="px-2 py-0.5 rounded bg-white border border-[#E9E4DE] font-semibold text-[#401827]">
                {user ? (ROLE_LABEL[user.role] ?? user.role) : 'OPERATIONS_STAFF'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#777078]">Required Clearance:</span>
              <span className="font-medium text-[#21845A]">{requiredRoles}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-[#E9E4DE]/60">
              <span className="text-[#777078]">Restricted Resource:</span>
              <span className="font-mono text-[11px] text-[#777078] truncate max-w-[240px]">{attemptedPath}</span>
            </div>
          </div>

          {/* Navigation Action */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-[#E9E4DE] bg-white hover:bg-[#F0ECE6] text-xs font-medium text-[#242124] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-[#777078]" />
              Return to Previous Page
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#401827] text-white hover:bg-[#28121D] text-xs font-medium transition-colors ml-auto"
            >
              My Workspace
            </Link>
          </div>

          {/* Hackathon Superpower: Quick Role Switcher */}
          <div className="pt-5 border-t border-[#E9E4DE] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8A6B2E]">
                <Sparkles className="h-4 w-4 text-[#C6A46A]" />
                <span>Hackathon RBAC Quick-Switch</span>
              </div>
              <span className="text-[10px] text-[#777078] uppercase tracking-wider bg-[#F3EBDB] px-2 py-0.5 rounded-full border border-[#C6A46A]/30">
                1-Click Role Verification
              </span>
            </div>
            <p className="text-xs text-[#777078]">
              Switch instantly to an executive or authorized role to verify that access is granted:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.filter((u) => u.role === 'FOUNDER' || u.role === 'FINANCE' || u.role === 'PLANNER').map((u) => (
                <button
                  key={u.email}
                  disabled={!!switching || user?.email === u.email}
                  onClick={() => switchRole(u.email, u.role)}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-[#E9E4DE] bg-white hover:border-[#C6A46A] hover:bg-[#F3EBDB]/40 transition-colors text-left text-xs disabled:opacity-50"
                >
                  <div>
                    <span className="font-medium text-[#242124] block">{u.label}</span>
                    <span className="text-[11px] text-[#777078]">{u.name}</span>
                  </div>
                  {switching === u.email ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#401827]" />
                  ) : user?.email === u.email ? (
                    <Check className="h-4 w-4 text-[#21845A]" />
                  ) : (
                    <KeyRound className="h-3.5 w-3.5 text-[#C6A46A]" />
                  )}
                </button>
              ))}
            </div>

            {switchErr && <p className="text-xs text-danger">{switchErr}</p>}
          </div>
        </div>

        <p className="text-xs text-[#777078]/60 font-serif">
          The Royal Knot Role-Based Access Control · Protected Environment
        </p>
      </div>
    </div>
  );
}

