'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wrench, RefreshCw, CheckCircle2, Server, Database, ShieldCheck } from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';

export default function MaintenancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('from') || '/dashboard';

  const [countdown, setCountdown] = useState(5);
  const [checking, setChecking] = useState(false);
  const [healthy, setHealthy] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const checkHealth = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/v1/health', { cache: 'no-store' });
      if (res.ok) {
        setHealthy(true);
        setTimeout(() => {
          window.location.href = returnTo;
        }, 1200);
        return;
      }
    } catch {
      /* still maintenance mode */
    } finally {
      setChecking(false);
      setRetryCount((c) => c + 1);
      setCountdown(5);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          checkHealth();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [returnTo]);

  return (
    <div className="min-h-screen bg-[#F7F5F1] flex flex-col items-center justify-center p-6 relative">
      <div className="w-full max-w-xl text-center space-y-6 relative z-10">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-white border border-[#E9E4DE] shadow-card grid place-items-center">
          <LotusMark className="h-9 w-9 text-[#401827]" />
        </div>

        <div className="card p-8 sm:p-10 border border-[#E9E4DE] bg-white shadow-pop text-left space-y-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-[#F3EBDB] border border-[#C6A46A]/30 text-[#8A6B2E] grid place-items-center shrink-0">
              <Wrench className="h-6 w-6" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F3EBDB] text-[#8A6B2E] text-[11px] font-semibold uppercase tracking-wider">
                503 · Scheduled Maintenance & Migration
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl text-[#28121D] font-normal mt-1">
                Refining the Palace Suite
              </h1>
              <p className="text-sm text-[#777078] mt-1">
                The database or operational containers are applying zero-downtime ledger migrations. All wedding records remain safely encrypted.
              </p>
            </div>
          </div>

          {/* Infrastructure Health Status */}
          <div className="p-4 rounded-xl bg-[#F0ECE6]/60 border border-[#E9E4DE] space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[#777078]">
                <Database className="h-3.5 w-3.5 text-[#C6A46A]" />
                PostgreSQL 16 Schema Migration:
              </span>
              <span className="font-medium text-[#8A6B2E] bg-white px-2 py-0.5 rounded border border-[#E9E4DE]">
                Executing WP4 Foundation
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[#777078]">
                <Server className="h-3.5 w-3.5 text-[#401827]" />
                API Health Poller:
              </span>
              <span className="font-mono text-[#242124]">
                {healthy ? 'Operational' : checking ? 'Pinging /health…' : `Next check in ${countdown}s`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[#777078]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#21845A]" />
                Data Integrity:
              </span>
              <span className="font-medium text-[#21845A]">100% Encrypted & Preserved</span>
            </div>
          </div>

          {/* Live Auto-Retry Countdown Display */}
          <div className="p-4 rounded-xl border border-line bg-surface-2/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 grid place-items-center">
                {healthy ? (
                  <CheckCircle2 className="h-7 w-7 text-success animate-bounce" />
                ) : (
                  <RefreshCw className={`h-5 w-5 text-burgundy ${checking ? 'animate-spin' : ''}`} />
                )}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-ink">
                  {healthy ? 'Systems Online! Returning to workspace…' : `Auto-reconnecting in ${countdown} seconds`}
                </p>
                <p className="text-xs text-ink-soft">
                  Attempt #{retryCount + 1} · Safe auto-redirect when operational
                </p>
              </div>
            </div>

            <button
              onClick={checkHealth}
              disabled={checking || healthy}
              className="btn-primary btn-sm h-9 px-3"
            >
              Check Now
            </button>
          </div>
        </div>

        <p className="text-xs text-[#777078]/60 font-serif">
          Dokploy High-Availability Orchestration · The Royal Knot
        </p>
      </div>
    </div>
  );
}

