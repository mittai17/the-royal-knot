'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import {
  QrCode,
  Users,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Utensils,
  Search,
} from 'lucide-react';
import { inr } from '@/lib/utils';
import { notify } from '@/lib/toast';

export default function GateCheckInScannerPage({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = use(params);

  const [guaranteedPax, setGuaranteedPax] = useState(400);
  const [actualPax, setActualPax] = useState(460);
  const perPlateRate = 1200; // ₹1,200 extra plate surcharge
  const [searchCode, setSearchCode] = useState('');
  const [lastScanned, setLastScanned] = useState<{ name: string; pax: number; table: string } | null>({
    name: 'Vikramaditya Singhania',
    pax: 3,
    table: 'Table 14 · Haveli Terrace',
  });

  const extraPlates = Math.max(0, actualPax - guaranteedPax);
  const extraPlateCost = extraPlates * perPlateRate;

  const adjustHeadcount = (delta: number) => {
    setActualPax((prev) => {
      const next = Math.max(0, prev + delta);
      notify.ok(`Gate headcount updated to ${next}`);
      return next;
    });
  };

  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCode.trim()) return;

    setLastScanned({
      name: `Guest Pass #${searchCode}`,
      pax: 2,
      table: 'Table 08 · Royal Courtyard',
    });
    adjustHeadcount(2);
    setSearchCode('');
    notify.ok(`Check-in verified for Pass #${searchCode}`);
  };

  return (
    <div className="max-w-md mx-auto space-y-5 pb-10">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/command-centre"
          className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-burgundy font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Command Centre
        </Link>
        <Link
          href={`/command-centre/${weddingId}/kiosk`}
          className="text-xs text-gold font-semibold hover:underline"
        >
          Open TV Kiosk View →
        </Link>
      </div>

      <div className="space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-burgundy">
          Gate Operations & Hospitality Desk
        </span>
        <h1 className="font-serif text-2xl text-burgundy-deep">Live Gate Headcount & QR Scanner</h1>
        <p className="text-xs text-ink-soft">
          Mehta Wedding · Jaipur Gate 1 & 2 Rapid Intake Terminal
        </p>
      </div>

      {/* Headcount Telemetry Card */}
      <div className="card p-6 border-2 border-line bg-white shadow-pop text-center space-y-4">
        <div className="flex items-center justify-between text-xs text-ink-soft border-b border-line pb-3">
          <span>Current Gate Headcount</span>
          <span className="font-semibold text-ink">Min. Guarantee: {guaranteedPax}</span>
        </div>

        <div className="space-y-1">
          <p className="font-mono text-6xl font-bold text-burgundy tabular-nums">{actualPax}</p>
          <p className="text-xs text-ink-soft uppercase tracking-wider">Verified Guests Admitted</p>
        </div>

        {/* Rapid Headcount Increments */}
        <div className="grid grid-cols-3 gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => adjustHeadcount(1)}
            className="h-12 rounded-xl bg-burgundy hover:bg-burgundy-deep text-white text-xs font-semibold flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4 text-gold" />
            +1 Guest
          </button>
          <button
            type="button"
            onClick={() => adjustHeadcount(5)}
            className="h-12 rounded-xl bg-burgundy hover:bg-burgundy-deep text-white text-xs font-semibold flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4 text-gold" />
            +5 Family
          </button>
          <button
            type="button"
            onClick={() => adjustHeadcount(10)}
            className="h-12 rounded-xl bg-gold-soft border border-gold/40 text-[#8A6B2E] hover:bg-gold-soft/80 text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4" />
            +10 Surge
          </button>
        </div>

        {/* Extra Plate Surcharge Calculation */}
        {extraPlates > 0 && (
          <div className="p-4 rounded-xl bg-warning-soft border border-warning/30 text-left space-y-1.5">
            <div className="flex items-center gap-2 text-warning text-xs font-semibold">
              <Utensils className="h-4 w-4" />
              <span>Catering Surge Triggered ({extraPlates} Extra Plates)</span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-[#A8701A] font-mono">
                {extraPlates} plates × {inr(perPlateRate)}/plate
              </span>
              <span className="font-serif font-bold text-base text-[#8A6B2E] tabular-nums">
                {inr(extraPlateCost)}
              </span>
            </div>
            <p className="text-[11px] text-[#A8701A]/80">
              Auto-reconciled on the client final invoice upon Sangeet closing.
            </p>
          </div>
        )}
      </div>

      {/* Manual Code Scanner Form */}
      <div className="card p-5 border border-line bg-white shadow-card space-y-3">
        <label className="text-xs font-medium text-ink flex items-center justify-between">
          <span>Scan Guest QR Pass / Enter Pass ID</span>
          <span className="text-[11px] text-ink-soft">Camera Active</span>
        </label>
        <form onSubmit={handleManualScan} className="flex gap-2">
          <input
            type="text"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            placeholder="e.g. PASS-MEHTA-9021"
            className="input text-xs font-mono"
          />
          <button type="submit" className="btn-primary btn-sm shrink-0">
            Verify
          </button>
        </form>
      </div>

      {/* Last Scanned Guest Card */}
      {lastScanned && (
        <div className="card p-4 border border-success/30 bg-success-soft text-success shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#186241] flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Pass Verified
            </span>
            <span className="font-mono text-xs font-semibold bg-white/80 px-2 py-0.5 rounded text-[#186241]">
              PAX: {lastScanned.pax}
            </span>
          </div>

          <div>
            <p className="font-semibold text-sm text-[#186241]">{lastScanned.name}</p>
            <p className="text-xs text-[#21845A]">{lastScanned.table}</p>
          </div>
        </div>
      )}
    </div>
  );
}

