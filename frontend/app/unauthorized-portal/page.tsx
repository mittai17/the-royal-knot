'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KeyRound, MessageSquare, Mail, CheckCircle2, ShieldX, PhoneCall } from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';

export default function UnauthorizedPortalPage() {
  const searchParams = useSearchParams();
  const type = searchParams.get('type') || 'document'; // agreement | rfq | payment | guest-rsvp
  const token = searchParams.get('token');
  const plannerName = searchParams.get('planner') || 'Priya Nair (Senior Wedding Planner)';
  const plannerPhone = searchParams.get('phone') || '+91 98290 00102';

  const [requested, setRequested] = useState<'whatsapp' | 'email' | null>(null);

  const labels: Record<string, { title: string; desc: string }> = {
    agreement: {
      title: 'Digital Agreement Link Expired',
      desc: 'Security policy requires couple contract access tokens to refresh every 72 hours to protect confidential milestone budgets.',
    },
    rfq: {
      title: 'Vendor RFQ Link Expired',
      desc: 'This vendor quotation request window has closed or requires a new encrypted token from the planning office.',
    },
    payment: {
      title: 'Payment Session Expired',
      desc: 'This checkout token has timed out to prevent double-debiting. Your bank ledger was not charged.',
    },
    rsvp: {
      title: 'Guest RSVP Token Inactive',
      desc: 'This personalized guest invitation link is no longer active. The couple’s planning team can issue an instant pass.',
    },
    document: {
      title: 'Encrypted Portal Link Inactive',
      desc: 'The magic link token provided is either expired, completed, or invalidated by security rotation.',
    },
  };

  const current = labels[type] || labels.document;

  const handleRequest = (channel: 'whatsapp' | 'email') => {
    setRequested(channel);
  };

  return (
    <div className="min-h-screen bg-[#F7F5F1] flex flex-col items-center justify-center p-6 relative">
      <div className="w-full max-w-lg text-center space-y-6 relative z-10">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-white border border-[#E9E4DE] shadow-card grid place-items-center">
          <LotusMark className="h-9 w-9 text-[#401827]" />
        </div>

        <div className="card p-8 sm:p-10 border border-[#E9E4DE] bg-white shadow-pop text-left space-y-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-[#F9E5E5] border border-[#C94B4B]/20 text-[#C94B4B] grid place-items-center shrink-0">
              <ShieldX className="h-6 w-6" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F3EBDB] text-[#8A6B2E] text-[11px] font-semibold uppercase tracking-wider">
                Magic Link Security
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl text-[#28121D] font-normal mt-1">
                {current.title}
              </h1>
              <p className="text-sm text-[#777078] mt-1 leading-relaxed">
                {current.desc}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F0ECE6]/60 border border-[#E9E4DE] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#777078]">Assigned Wedding Office:</span>
              <span className="font-medium text-[#242124]">{plannerName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#777078]">Direct Support Contact:</span>
              <a href={`tel:${plannerPhone}`} className="text-[#401827] font-semibold hover:underline flex items-center gap-1">
                <PhoneCall className="h-3 w-3" />
                {plannerPhone}
              </a>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-semibold text-[#8A6B2E] uppercase tracking-wide">
              Request Instant Verification Link:
            </p>

            {requested ? (
              <div className="p-4 rounded-xl bg-success-soft border border-success/30 text-success flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-[#186241]">
                    Verification dispatched via {requested === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  </p>
                  <p className="text-[#21845A]/80 mt-0.5">
                    Check your mobile notifications. You will receive a fresh 1-click token within 60 seconds.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => handleRequest('whatsapp')}
                  className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-[#21845A] text-white hover:bg-[#186241] text-xs font-medium transition-colors shadow-sm"
                >
                  <MessageSquare className="h-4 w-4" />
                  Send via WhatsApp
                </button>
                <button
                  onClick={() => handleRequest('email')}
                  className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-line bg-white hover:bg-surface-2 text-xs font-medium text-ink transition-colors"
                >
                  <Mail className="h-4 w-4 text-ink-soft" />
                  Send via Email
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-[#777078]/60 font-serif">
          The Royal Knot External Security Protocol · Private Ledger Architecture
        </p>
      </div>
    </div>
  );
}

