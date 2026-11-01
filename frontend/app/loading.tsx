import { LotusMark } from '@/components/layout/logo';

export default function GlobalLoading() {
  return (
    <div className="fixed inset-0 z-50 bg-[#F7F5F1] flex flex-col items-center justify-center">
      {/* Hairline #C6A46A gold progress bar at top (NProgress luxury style) */}
      <div className="fixed top-0 left-0 right-0 h-[2.5px] bg-[#E9E4DE] overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#C6A46A] via-[#E8D2A6] to-[#C6A46A] w-full animate-[progress_1.4s_ease-in-out_infinite]" />
      </div>

      {/* Royal Knot Monogram & Subtle Pulse */}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-white border border-[#E9E4DE] shadow-card grid place-items-center">
            <LotusMark className="h-9 w-9 text-[#401827] animate-pulse" />
          </div>
          <div className="absolute -inset-1 rounded-2xl border border-[#C6A46A]/20 animate-ping opacity-30" />
        </div>

        <div className="space-y-1">
          <h2 className="font-serif text-lg tracking-wide text-[#28121D]">The Royal Knot</h2>
          <p className="text-xs text-[#777078] tracking-widest uppercase">Orchestrating Workspace…</p>
        </div>
      </div>
    </div>
  );
}

