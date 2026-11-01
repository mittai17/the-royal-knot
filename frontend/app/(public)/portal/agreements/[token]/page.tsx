'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileSignature,
  Download,
  CreditCard,
  CheckCircle2,
  Calendar,
  MapPin,
  Users,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Lock,
} from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';
import { inr, fmtDate } from '@/lib/utils';
import { notify } from '@/lib/toast';

interface AgreementData {
  id: string;
  weddingName: string;
  coupleNames: string;
  venue: string;
  location: string;
  dates: string;
  expectedGuests: number;
  packageType: string;
  totalContractValue: number;
  milestones: { name: string; percent: number; amount: number; dueDescription: string }[];
  scopeSummary: string[];
}

export default function DigitalAgreementSigningPortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [signed, setSigned] = useState(false);
  const [consent, setConsent] = useState(false);
  const [signingName, setSigningName] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Demo contract data populated for this secure token
  const contract: AgreementData = {
    id: `AGR-2026-${token.slice(0, 6).toUpperCase()}`,
    weddingName: 'The Mehta & Verma Wedding',
    coupleNames: 'Rohan Mehta & Ananya Verma',
    venue: 'The Leela Palace & Rambagh Palace',
    location: 'Jaipur, Rajasthan',
    dates: '12 Nov 2026 – 15 Nov 2026 (4 Days)',
    expectedGuests: 400,
    packageType: 'Full Royal Rajputana Bespoke Planning & Execution',
    totalContractValue: 15000000,
    milestones: [
      { name: 'Initial Booking Deposit', percent: 20, amount: 3000000, dueDescription: 'Upon e-signature execution' },
      { name: 'Mid-Planning Advance', percent: 50, amount: 7500000, dueDescription: '60 days prior to event commencement' },
      { name: 'Final Reconciliation', percent: 30, amount: 4500000, dueDescription: '7 days prior to check-in' },
    ],
    scopeSummary: [
      'Complete 3-Vendor Quotation Sourcing across Catering, Decor, Floral, and Photography.',
      'Full Ground Logistics Management: Airport concierge roster, 40+ luxury coach allocations, and check-in desks.',
      'Backstage Command Centre with real-time incident escalation and guest headcount telemetry.',
      'Dedicated Hospitality Team and Bride/Groom Personal Shadows for all 7 ceremonies.',
      'Strict Compliance with Private Network Data Protection and MinIO Vault Document Encryption.',
    ],
  };

  // Canvas drawing handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#401827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    setHasStroke(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const handleSign = async () => {
    if (!signingName.trim()) {
      notify.err('Please enter your legal signatory name');
      return;
    }
    if (!hasStroke) {
      notify.err('Please sign in the digital signature box');
      return;
    }
    if (!consent) {
      notify.err('Please agree to the terms and legal consent');
      return;
    }

    setLoading(true);
    // Simulate Gotenberg compilation + MinIO vault archival
    setTimeout(() => {
      setLoading(false);
      setSigned(true);
      notify.ok('Agreement signed and securely archived to MinIO Vault');
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#F7F5F1] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Luxury Letterhead */}
        <div className="card p-8 sm:p-12 border border-line bg-white shadow-pop">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-8 border-b border-line gap-6">
            <div className="flex items-center gap-3">
              <LotusMark className="h-10 w-10 text-burgundy" />
              <div>
                <h1 className="font-serif text-2xl text-burgundy-deep font-normal tracking-wide">The Royal Knot</h1>
                <p className="text-xs text-ink-soft uppercase tracking-widest">Bespoke Wedding Management · Jaipur & Udaipur</p>
              </div>
            </div>
            <div className="text-left sm:text-right space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-soft border border-gold/40 text-[#8A6B2E] text-xs font-semibold">
                <Lock className="h-3.5 w-3.5" />
                Confidential Master Agreement
              </span>
              <p className="text-xs text-ink-soft font-mono">Ref: {contract.id}</p>
            </div>
          </div>

          {/* Wedding Metadata Summary */}
          <div className="py-6 border-b border-line space-y-4">
            <h2 className="font-serif text-3xl text-burgundy-deep font-normal">{contract.weddingName}</h2>
            <p className="text-base text-ink font-medium">{contract.coupleNames}</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs text-ink">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-2/60 border border-line">
                <MapPin className="h-4 w-4 text-burgundy shrink-0" />
                <div>
                  <p className="text-ink-soft">Venue & City</p>
                  <p className="font-semibold">{contract.venue}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-2/60 border border-line">
                <Calendar className="h-4 w-4 text-burgundy shrink-0" />
                <div>
                  <p className="text-ink-soft">Celebration Dates</p>
                  <p className="font-semibold">{contract.dates}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-2/60 border border-line">
                <Users className="h-4 w-4 text-burgundy shrink-0" />
                <div>
                  <p className="text-ink-soft">Expected Guests</p>
                  <p className="font-semibold">{contract.expectedGuests} Guests (Guaranteed)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Scope of Management Services */}
          <div className="py-6 border-b border-line space-y-3">
            <h3 className="font-serif text-lg text-burgundy-deep">Scope of Operational Management</h3>
            <ul className="space-y-2 text-sm text-ink leading-relaxed">
              {contract.scopeSummary.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="h-5 w-5 rounded-full bg-gold-soft text-[#8A6B2E] grid place-items-center text-xs font-semibold shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Staged Payment Schedule */}
          <div className="py-6 border-b border-line space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg text-burgundy-deep">Staged Payment Schedule</h3>
              <span className="font-serif text-xl text-burgundy font-medium tabular-nums">
                Total: {inr(contract.totalContractValue)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-line rounded-xl overflow-hidden">
                <thead className="bg-surface-2 border-b border-line text-ink-soft uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Milestone Stage</th>
                    <th className="p-3">Percentage</th>
                    <th className="p-3">Due Condition</th>
                    <th className="p-3 text-right">Amount (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {contract.milestones.map((m, i) => (
                    <tr key={i} className="hover:bg-surface-2/40">
                      <td className="p-3 font-semibold text-ink">{m.name}</td>
                      <td className="p-3 text-ink-soft">{m.percent}%</td>
                      <td className="p-3 text-ink-soft">{m.dueDescription}</td>
                      <td className="p-3 text-right font-medium text-ink tabular-nums">{inr(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Signature & Consent Section */}
          <div className="pt-6 space-y-6">
            <h3 className="font-serif text-xl text-burgundy-deep">Digital Execution & Consent</h3>

            {signed ? (
              <div className="p-6 rounded-2xl bg-success-soft border border-success/30 text-success space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-success shrink-0" />
                  <div>
                    <h4 className="font-serif text-lg text-[#186241]">Agreement Executed Successfully</h4>
                    <p className="text-xs text-[#21845A]">
                      Digitally signed by <span className="font-semibold">{signingName}</span> · Verified audit record locked.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <a
                    href={`/api/v1/agreements/${contract.id}/pdf`}
                    download
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-success/40 text-success hover:bg-white/80 text-xs font-semibold shadow-xs"
                  >
                    <Download className="h-4 w-4" />
                    Download Official Signed PDF (Gotenberg)
                  </a>

                  <Link
                    href={`/portal/pay/ORD-BOOKING-${contract.id}`}
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-burgundy text-white hover:bg-burgundy-deep text-xs font-semibold shadow-sm ml-auto"
                  >
                    <CreditCard className="h-4 w-4 text-gold" />
                    Proceed to Booking Deposit Checkout (₹30,00,000)
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink">Legal Signatory Full Name</label>
                    <input
                      type="text"
                      value={signingName}
                      onChange={(e) => setSigningName(e.target.value)}
                      placeholder="e.g. Rohan Mehta / Ananya Verma"
                      className="input"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-ink">E-Signature Pad</label>
                      <button
                        type="button"
                        onClick={clearSignature}
                        className="text-[11px] text-ink-soft hover:text-danger flex items-center gap-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Clear Pad
                      </button>
                    </div>

                    <div className="border border-line rounded-xl bg-surface-2/40 overflow-hidden h-28 relative touch-none">
                      <canvas
                        ref={canvasRef}
                        width={380}
                        height={112}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="w-full h-full cursor-crosshair"
                      />
                      {!hasStroke && (
                        <span className="absolute inset-0 grid place-items-center text-xs text-ink-soft/60 pointer-events-none font-serif">
                          Draw your signature here with finger or mouse
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Consent checkbox */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-line bg-surface-2/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line text-burgundy focus:ring-gold"
                  />
                  <span className="text-xs text-ink leading-relaxed">
                    I confirm that I have reviewed the scope of services, milestone schedule, and cancellation provisions.
                    I agree to the legally binding electronic signature under the India Information Technology Act, 2000.
                  </span>
                </label>

                {/* Sign Action Button */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleSign}
                  className="w-full h-12 rounded-xl bg-burgundy hover:bg-burgundy-deep text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                >
                  <FileSignature className="h-4 w-4 text-gold" />
                  {loading ? 'Compiling Official PDF via Gotenberg...' : 'Sign & Download Official Agreement'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-ink-soft">
          <Link href="/legal/privacy" className="hover:underline">DPDP Privacy Disclosure</Link>
          <Link href="/legal/terms" className="hover:underline">Terms of Service</Link>
          <span>Self-Hosted Private Vault · The Royal Knot</span>
        </div>
      </div>
    </div>
  );
}

