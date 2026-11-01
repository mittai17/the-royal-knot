'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  RadioTower,
  Users,
  AlertTriangle,
  Truck,
  CheckCircle2,
  Calendar,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';

export default function BackstageKioskMode({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = use(params);

  const [time, setTime] = useState('');
  const [headcount, setHeadcount] = useState(460);
  const [expected, setExpected] = useState(400);

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      document.exitFullscreen().catch(() => undefined);
    }
  };

  const incidents = [
    { id: '1', time: '18:42', title: 'South Lawn Bar Generator Surge', status: 'RESOLVED', team: 'Electrical Ground Team' },
    { id: '2', time: '19:15', title: 'Late Arrival of Vintage Baraat Car', status: 'MONITORING', team: 'Logistics Desk' },
  ];

  const vendorStatus = [
    { name: 'Jaipur Royal Caterers', stage: 'Dinner Buffet Prepped', status: 'ON_SCHEDULE', pfp: 'RC' },
    { name: 'Rathore Sound & Truss', stage: 'Main Stage Audio Soundcheck', status: 'VERIFIED', pfp: 'RS' },
    { name: 'Udaipur Floral Studio', stage: 'Mandap Varmala Setup Completed', status: 'VERIFIED', pfp: 'UF' },
    { name: 'Shutter & Silk Studio', stage: 'Drone Permissions Approved', status: 'ON_SCHEDULE', pfp: 'SS' },
  ];

  return (
    <div className="min-h-screen bg-[#28121D] text-[#F7F5F1] p-6 lg:p-10 flex flex-col justify-between select-none">
      {/* Top Banner: Broadcast Header & Master Clock */}
      <div className="flex items-center justify-between pb-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-white/10 border border-[#C6A46A]/40 grid place-items-center shadow-lg">
            <LotusMark className="h-8 w-8 text-[#C6A46A]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-danger animate-ping" />
              <span className="text-xs font-mono font-bold tracking-widest uppercase text-[#C6A46A]">
                Backstage Kiosk Live Operations
              </span>
            </div>
            <h1 className="font-serif text-3xl font-normal text-white tracking-wide mt-0.5">
              Mehta Wedding · Royal Grand Sangeet
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[11px] text-white/50 tracking-widest uppercase">Palace Standard Time (IST)</p>
            <p className="font-mono text-4xl lg:text-5xl font-bold tracking-tight text-white tabular-nums">
              {time || '19:45:00 PM'}
            </p>
          </div>
          <button
            onClick={toggleFullScreen}
            className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Toggle TV Fullscreen"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Grid: 3 Large TV Dash Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-6 flex-1">
        {/* Panel 1: Current Run Sheet & Ceremony Stage */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-[#C6A46A] flex items-center gap-1.5">
                <RadioTower className="h-4 w-4" />
                Live Stage Cue
              </span>
              <span className="px-3 py-1 rounded-full bg-[#21845A]/30 text-success text-xs font-semibold uppercase">
                Active Now
              </span>
            </div>

            <div className="space-y-2 pt-2">
              <span className="text-sm font-mono text-white/60">Stage 04 · Grand Ballroom Lawn</span>
              <h2 className="font-serif text-3xl font-normal text-white leading-tight">
                Groom & Bride Family Royal Dance Face-Off
              </h2>
              <p className="text-sm text-white/70 leading-relaxed">
                400+ guests seated at Maharaja lawn tables. Special pyro cold-sparks loaded at cue point 3:45.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-white/40 font-mono">Next Upcoming Stage</p>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-white">20:30 PM · Royal Buffet Live Opening</span>
              <span className="text-[#C6A46A] font-mono">In 35 mins</span>
            </div>
          </div>
        </div>

        {/* Panel 2: Real-Time Gate Headcount Telemetry */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-[#C6A46A] flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                Live Gate Headcount
              </span>
              <span className="px-3 py-1 rounded-full bg-[#D99A35]/30 text-warning text-xs font-semibold font-mono">
                +60 Extra Plates
              </span>
            </div>

            <div className="pt-6 text-center space-y-2">
              <p className="text-6xl lg:text-7xl font-mono font-bold text-white tabular-nums">
                {headcount}
              </p>
              <p className="text-sm text-white/60 font-mono">
                Current Checked-In / <span className="text-white/40">{expected} Guaranteed</span>
              </p>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-black/30 border border-white/10 text-xs font-mono space-y-1.5">
              <div className="flex justify-between">
                <span className="text-white/60">Actual vs Minimum Guarantee:</span>
                <span className="text-warning font-semibold">+15% Attendance Surge</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Auto-Reconciled Plate Surcharge:</span>
                <span className="text-white font-semibold">60 × ₹1,200 = ₹72,000</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/50">
            <span>Scanner Sync: Gate 1 & Gate 2 Live</span>
            <span className="text-success font-semibold flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-success" />
              Socket.IO Connected
            </span>
          </div>
        </div>

        {/* Panel 3: Vendor On-Ground Readiness */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-[#C6A46A] flex items-center gap-1.5">
                <Truck className="h-4 w-4" />
                Empanelled Vendor Telemetry
              </span>
              <span className="text-xs text-white/50 font-mono">4 Verified</span>
            </div>

            <div className="space-y-3">
              {vendorStatus.map((v, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-[#401827] text-white grid place-items-center text-xs font-bold font-mono">
                      {v.pfp}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">{v.name}</p>
                      <p className="text-[11px] text-white/60">{v.stage}</p>
                    </div>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
            <span>Ground Shadow Coordinator: Rohan Das</span>
            <span>Channel 4 VHF</span>
          </div>
        </div>
      </div>

      {/* Bottom Ticker: Real-Time Incident Telemetry */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-4 flex items-center gap-4 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-danger font-semibold uppercase tracking-wider shrink-0 bg-danger/20 px-2.5 py-1 rounded-md">
          <AlertTriangle className="h-4 w-4" />
          Incident Ticker
        </div>

        <div className="flex-1 overflow-hidden whitespace-nowrap">
          <div className="inline-block space-x-8 text-white/80">
            {incidents.map((inc) => (
              <span key={inc.id} className="inline-flex items-center gap-2">
                <span className="text-[#C6A46A]">[{inc.time}]</span>
                <span className="font-semibold text-white">{inc.title}</span>
                <span className="text-white/40">· Team: {inc.team}</span>
                <span className="text-success font-bold">({inc.status})</span>
              </span>
            ))}
          </div>
        </div>

        <Link
          href={`/command-centre/${weddingId}/scanner`}
          className="text-[11px] text-[#C6A46A] hover:underline shrink-0"
        >
          Open Gate Scanner →
        </Link>
      </div>
    </div>
  );
}

