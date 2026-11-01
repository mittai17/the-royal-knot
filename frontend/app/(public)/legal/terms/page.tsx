import Link from 'next/link';
import { FileText, ShieldCheck, Scale, CheckCircle2 } from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';

export const metadata = {
  title: 'Terms of Service & E-Signature Disclosure | The Royal Knot',
  description: 'Master Wedding Management Terms, Milestone Schedules, and Electronic Signature Legal Enforceability',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#F7F5F1] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-white border border-[#E9E4DE] shadow-card grid place-items-center mx-auto">
            <LotusMark className="h-8 w-8 text-[#401827]" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3EBDB] text-[#8A6B2E] text-xs font-semibold uppercase tracking-wider">
            <Scale className="h-3.5 w-3.5" />
            Legal Operating Framework
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl text-[#28121D] font-normal">
            Terms of Service & E-Signature Disclosure
          </h1>
          <p className="text-sm text-[#777078] max-w-lg mx-auto">
            Operational contract rules governing Jaipur and Udaipur wedding management, payment stages, and digital signature enforceability.
          </p>
        </div>

        {/* Content Card */}
        <div className="card p-8 sm:p-12 border border-[#E9E4DE] bg-white shadow-pop space-y-8 text-sm text-[#242124] leading-relaxed">
          <section className="space-y-3">
            <h2 className="font-serif text-xl text-[#28121D]">1. Binding Electronic Signature Disclosure</h2>
            <p>
              In accordance with Section 10A of the India Information Technology Act, 2000 and the Indian Contract Act, 1872, digital signatures executed on The Royal Knot Client Portal possess the identical legal validity, enforceability, and weight of wet-ink hand signatures.
            </p>
            <p className="text-xs text-[#777078] bg-[#F0ECE6]/60 p-3.5 rounded-xl border border-[#E9E4DE]">
              Every signature event captures and cryptographically signs: (a) Signatory IPv4/IPv6 address, (b) UTC/IST timestamp, (c) Full user-agent hardware footprint, and (d) Document hash sha256 archived directly to Gotenberg PDF and MinIO vault.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl text-[#28121D]">2. Staged Milestone Payment Protocol</h2>
            <p>
              Luxury wedding preparation operates on milestone progression. Workflows are scheduled and vendor commitments are issued strictly upon confirmed bank settlement:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#777078]">
              <li><strong className="text-[#242124]">Booking Deposit (20%):</strong> Locks event dates in palace calendar and automatically generates the 25+ automated planning task checklist.</li>
              <li><strong className="text-[#242124]">Mid-Planning Advance (50%):</strong> Disbursed 60 days prior to event; secures empanelled catering, floral, audio-visual, and production vendors.</li>
              <li><strong className="text-[#242124]">Final Settlement (30%):</strong> Disbursed 7 days prior to celebration check-in to clear full vendor commitments and security deposits.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl text-[#28121D]">3. Catering Minimum Guarantee & Extra Plate Formulas</h2>
            <p>
              Banquet and catering commitments are locked on the agreed Minimum Guarantee (MG) headcount. On-ground attendance recorded by hotel gate scanners triggers automatic reconciliation:
            </p>
            <div className="p-3.5 rounded-xl bg-[#F0ECE6]/60 border border-[#E9E4DE] font-mono text-xs text-[#401827]">
              Final Catering Cost = (Max(Actual Attendance, Minimum Guarantee) × Base Plate Rate) + (Overtime Hours × Surcharge Rate)
            </div>
            <p className="text-xs text-[#777078]">
              Any surge beyond the 10% tolerance is calculated live on the Command Centre TV Kiosk and appended to the final event reconciliation ledger.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl text-[#28121D]">4. Dispute Resolution & Jurisdiction</h2>
            <p>
              Any disputes arising from wedding coordination agreements shall be resolved through private arbitration in Jaipur, Rajasthan, conducted in English in accordance with the Arbitration and Conciliation Act, 1996.
            </p>
          </section>

          <div className="pt-6 border-t border-[#E9E4DE] flex flex-wrap items-center justify-between gap-4 text-xs text-[#777078]">
            <span>Version: WP4-2026.11</span>
            <div className="flex gap-4">
              <Link href="/legal/privacy" className="hover:underline text-[#401827] font-medium">Privacy Policy</Link>
              <Link href="/legal/cookies" className="hover:underline text-[#401827] font-medium">Cookie Policy</Link>
              <Link href="/system-status" className="hover:underline text-[#21845A] font-medium">System Status</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

