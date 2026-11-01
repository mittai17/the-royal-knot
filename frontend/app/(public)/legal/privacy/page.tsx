import Link from 'next/link';
import { ShieldCheck, Lock, Database, HardDrive, CheckCircle2 } from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';

export const metadata = {
  title: 'Privacy & Guest Data Protection Policy | The Royal Knot',
  description: 'Digital Personal Data Protection (DPDP) Act Compliance and Private Cloud Architecture',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#F7F5F1] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-white border border-[#E9E4DE] shadow-card grid place-items-center mx-auto">
            <LotusMark className="h-8 w-8 text-[#401827]" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3EBDB] text-[#8A6B2E] text-xs font-semibold uppercase tracking-wider">
            <ShieldCheck className="h-3.5 w-3.5" />
            India DPDP Act, 2023 Compliant
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl text-[#28121D] font-normal">
            Privacy & Guest Data Protection Policy
          </h1>
          <p className="text-sm text-[#777078] max-w-lg mx-auto">
            Strict sovereign architecture for luxury Indian wedding guest rosters, flight schedules, dietary tags, and multi-crore vendor contracts.
          </p>
        </div>

        {/* Content Card */}
        <div className="card p-8 sm:p-12 border border-[#E9E4DE] bg-white shadow-pop space-y-8 text-sm text-[#242124] leading-relaxed">
          <section className="space-y-3">
            <h2 className="font-serif text-xl text-[#28121D]">1. Sovereign Self-Hosted Data Mandate</h2>
            <p>
              The Royal Knot does not transmit or synchronize client wedding records with multi-tenant commercial public clouds. All wedding contracts, guest phone numbers, government ID documents, and milestone payments reside strictly inside private self-hosted Docker containers orchestrated on dedicated physical hardware.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F0ECE6]/60 border border-[#E9E4DE] flex items-center gap-2.5">
                <Database className="h-4 w-4 text-[#401827] shrink-0" />
                <span>Encrypted PostgreSQL 16 Private Relational Database</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F0ECE6]/60 border border-[#E9E4DE] flex items-center gap-2.5">
                <HardDrive className="h-4 w-4 text-[#C6A46A] shrink-0" />
                <span>Private MinIO S3 Object Storage with zero external egress</span>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl text-[#28121D]">2. Categories of Guest Personal Identifiable Information (PII)</h2>
            <p>
              In executing Jaipur and Udaipur destination wedding logistics, our on-ground concierge desks collect only strictly necessary guest information:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#777078]">
              <li><strong className="text-[#242124]">Travel & Transit:</strong> Flight / train numbers, PNR codes, arrival terminals for luxury chauffeur and coach roster coordination.</li>
              <li><strong className="text-[#242124]">Hospitality & Stay:</strong> Hotel room allocation, palace wing keycard assignments, and accompanying minor counts.</li>
              <li><strong className="text-[#242124]">Dietary Safety Tags:</strong> Specific medical allergies, Pure Veg, Jain, or Vegan tags provided directly to catering head chefs.</li>
              <li><strong className="text-[#242124]">Digital Pass Verification:</strong> Encrypted QR check-in tokens scanned exclusively by hotel security gates.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl text-[#28121D]">3. Right to Erasure & Wedding Archival</h2>
            <p>
              In full alignment with the Digital Personal Data Protection Act (DPDP), couples and guests maintain the absolute right to request complete redaction of phone numbers and travel itineraries 30 days after wedding accounts reconciliation. Audit logs of financial transactions remain preserved in immutable double-entry ledger state as required under the Institute of Chartered Accountants of India (ICAI) and GST compliance.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl text-[#28121D]">4. Zero Third-Party Advertising Policy</h2>
            <p>
              The Royal Knot employs zero advertising SDKs, zero Facebook / Google remarketing pixels, and zero telemetry tracking scripts. Your celebration remains private, confidential, and sovereign.
            </p>
          </section>

          <div className="pt-6 border-t border-[#E9E4DE] flex flex-wrap items-center justify-between gap-4 text-xs text-[#777078]">
            <span>Effective Date: 1 November 2026</span>
            <div className="flex gap-4">
              <Link href="/legal/terms" className="hover:underline text-[#401827] font-medium">Terms of Service</Link>
              <Link href="/legal/cookies" className="hover:underline text-[#401827] font-medium">Cookie Policy</Link>
              <Link href="/system-status" className="hover:underline text-[#21845A] font-medium">Live Infrastructure</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

