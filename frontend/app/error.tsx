'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, RotateCcw, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';
import { useAuth } from '@/lib/auth';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showTech, setShowTech] = useState(false);
  const [istTime, setIstTime] = useState('');
  const { user } = useAuth();
  const isDev = process.env.NODE_ENV === 'development';
  const isPrivileged = isDev || user?.role === 'FOUNDER' || (user?.role as string) === 'ADMIN';

  useEffect(() => {
    // Format timestamp in Indian Standard Time (IST)
    const now = new Date();
    setIstTime(
      now.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'medium',
      }) + ' IST'
    );
    console.error('[The Royal Knot] Application Error:', error);
  }, [error]);

  const reloadWorkspaceSafely = () => {
    try {
      // Clear transient or corrupted filter state from localStorage / sessionStorage
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith('rk.filter') || k.startsWith('rk.table') || k.startsWith('rk.nav.open')) {
          localStorage.removeItem(k);
        }
      }
      sessionStorage.clear();
    } catch {
      /* ignore storage errors */
    }
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#F7F5F1] flex flex-col items-center justify-center p-6 relative">
      <div className="w-full max-w-xl relative z-10 text-center">
        {/* Brand Crest */}
        <div className="mx-auto mb-6 h-14 w-14 rounded-2xl bg-white border border-[#E9E4DE] shadow-card grid place-items-center">
          <LotusMark className="h-8 w-8 text-[#401827]" />
        </div>

        <div className="card p-8 sm:p-10 border border-[#E9E4DE] bg-white shadow-pop text-left space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#F9E5E5] text-[#C94B4B] grid place-items-center shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-2xl text-[#28121D] leading-tight font-normal">
                Workspace Alert
              </h2>
              <p className="text-xs text-[#777078] mt-0.5">
                An unexpected condition paused execution on this screen.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F0ECE6]/60 border border-[#E9E4DE] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#777078]">Error Digest ID:</span>
              <span className="font-mono font-medium text-[#242124] bg-white px-2 py-0.5 rounded border border-[#E9E4DE]">
                {error.digest || 'ERR_SYS_' + Math.random().toString(36).substring(2, 9).toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#777078]">Recorded Timestamp:</span>
              <span className="font-mono text-[#242124]">{istTime || 'Recording...'}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid sm:grid-cols-3 gap-2.5 pt-1">
            <button
              onClick={() => reset()}
              className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-[#401827] text-white hover:bg-[#28121D] text-xs font-medium transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[#C6A46A]" />
              Retry Operation
            </button>

            <button
              onClick={reloadWorkspaceSafely}
              className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl border border-[#E9E4DE] bg-white hover:bg-[#F0ECE6] text-[#242124] text-xs font-medium transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#777078]" />
              Reload Safely
            </button>

            <Link
              href="/system-status"
              className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl border border-[#E9E4DE] bg-white hover:bg-[#F0ECE6] text-[#242124] text-xs font-medium transition-colors text-center"
            >
              <Activity className="h-3.5 w-3.5 text-[#21845A]" />
              System Status
            </Link>
          </div>

          {/* Collapsible Technical Details (Dev or Founder only) */}
          {isPrivileged && (
            <div className="pt-2 border-t border-[#E9E4DE]">
              <button
                onClick={() => setShowTech((s) => !s)}
                className="w-full flex items-center justify-between py-1 text-xs text-[#777078] hover:text-[#242124] font-medium"
              >
                <span>Technical Trace ({user?.role ?? 'DEVELOPER'})</span>
                {showTech ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {showTech && (
                <div className="mt-2.5 p-3 rounded-lg bg-[#28121D] text-[#F7F5F1] font-mono text-[11px] overflow-x-auto max-h-48 border border-black/20">
                  <p className="text-[#C6A46A] font-semibold">{error.name}: {error.message}</p>
                  {error.stack && (
                    <pre className="mt-2 text-white/70 whitespace-pre-wrap leading-relaxed text-[10px]">
                      {error.stack}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-6 text-xs text-[#777078]/60 font-serif">
          The Royal Knot Wedding Planning System · Jaipur & Udaipur
        </p>
      </div>
    </div>
  );
}

