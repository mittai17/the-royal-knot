'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Compass, LayoutDashboard, HeartHandshake, ArrowRight } from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';

export default function NotFound() {
  const router = useRouter();

  const openSearch = () => {
    // Trigger keyboard event for Cmd+K palette
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);
  };

  return (
    <div className="min-h-screen bg-[#F7F5F1] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative hairline gold emblem backdrop */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, #C6A46A 1.5px, transparent 1.5px), radial-gradient(circle at 10% 20%, #401827 2px, transparent 2px)',
          backgroundSize: '36px 36px, 72px 72px',
        }}
      />

      <div className="w-full max-w-xl relative z-10 text-center">
        {/* Brand Crest */}
        <div className="mx-auto mb-6 h-16 w-16 rounded-3xl bg-white border border-[#E9E4DE] shadow-card grid place-items-center">
          <LotusMark className="h-9 w-9 text-[#401827]" />
        </div>

        <div className="card p-8 sm:p-12 border border-[#E9E4DE] bg-white shadow-pop text-center space-y-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3EBDB] border border-[#C6A46A]/40 text-[#8A6B2E] text-xs font-medium tracking-wider uppercase">
            <Compass className="h-3.5 w-3.5" />
            Error 404 · Uncharted Route
          </div>

          <div className="space-y-2">
            <h1 className="font-serif text-3xl sm:text-4xl text-[#28121D] leading-tight font-normal">
              This page is not on the Royal Guest List.
            </h1>
            <p className="text-sm sm:text-base text-[#777078] max-w-md mx-auto leading-relaxed">
              The destination you are attempting to reach has either concluded its celebration, moved to another suite, or requires clearance.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/weddings"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[#401827] text-white hover:bg-[#28121D] text-sm font-medium transition-colors shadow-sm"
            >
              <HeartHandshake className="h-4 w-4 text-[#C6A46A]" />
              Return to Active Wedding Workspace
            </Link>

            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-[#E9E4DE] bg-white hover:bg-[#F0ECE6] text-[#242124] text-sm font-medium transition-colors"
            >
              <LayoutDashboard className="h-4 w-4 text-[#777078]" />
              Go to Executive Dashboard
            </Link>
          </div>

          {/* Quick search button */}
          <div className="pt-4 border-t border-[#E9E4DE]">
            <button
              onClick={openSearch}
              className="inline-flex items-center gap-2 text-xs text-[#777078] hover:text-[#401827] font-medium transition-colors group"
            >
              <Search className="h-3.5 w-3.5 text-[#C6A46A] group-hover:scale-110 transition-transform" />
              <span>Looking for a specific couple, vendor, or invoice? Press</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[#F0ECE6] border border-[#E9E4DE] text-[10px] font-mono text-[#242124]">
                ⌘K
              </kbd>
            </button>
          </div>
        </div>

        <p className="mt-8 text-xs text-[#777078]/70 font-serif">
          The Royal Knot Wedding ERP · Jaipur · Udaipur
        </p>
      </div>
    </div>
  );
}

