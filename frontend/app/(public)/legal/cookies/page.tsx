import Link from 'next/link';
import { Cookie, ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';

export const metadata = {
  title: 'Cookie & Session Security Policy | The Royal Knot',
  description: 'Strictly Necessary Session Authentication Cookies and Zero Third-Party Tracker Guarantee',
};

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-[#F7F5F1] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-white border border-[#E9E4DE] shadow-card grid place-items-center mx-auto">
            <LotusMark className="h-8 w-8 text-[#401827]" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3EBDB] text-[#8A6B2E] text-xs font-semibold uppercase tracking-wider">
            <Cookie className="h-3.5 w-3.5" />
            Security & Authentication
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl text-[#28121D] font-normal">
            Cookie & Session Security Policy
          </h1>
          <p className="text-sm text-[#777078] max-w-lg mx-auto">
            We employ exclusively strictly necessary, cryptographic session tokens to authenticate planning staff and clients.
          </p>
        </div>

        {/* Content Card */}
        <div className="card p-8 sm:p-12 border border-[#E9E4DE] bg-white shadow-pop space-y-8 text-sm text-[#242124] leading-relaxed">
          <section className="space-y-3">
            <h2 className="font-serif text-xl text-[#28121D]">1. Strictly Necessary Cookies Only</h2>
            <p>
              The Royal Knot web application does not use marketing cookies, tracking pixels, or cross-site tracking beacons. The only cookies placed upon your browser are cryptographically secure, strictly necessary session tokens essential for role-based access control (RBAC).
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-serif text-xl text-[#28121D]">2. Technical Cookie Specification</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-[#E9E4DE] rounded-xl overflow-hidden">
                <thead className="bg-[#F0ECE6] border-b border-[#E9E4DE] text-[#777078] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="p-3">Cookie Name</th>
                    <th className="p-3">Purpose & Encryption</th>
                    <th className="p-3">Lifespan</th>
                    <th className="p-3">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4DE]">
                  <tr>
                    <td className="p-3 font-mono font-bold text-[#401827]">access_token</td>
                    <td className="p-3">Signed JWT bearer token for API authorization</td>
                    <td className="p-3">15 Minutes</td>
                    <td className="p-3 font-mono text-[11px]">HttpOnly, SameSite=Lax, Secure</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono font-bold text-[#401827]">refresh_token</td>
                    <td className="p-3">Single-use rotating refresh token with theft family detection</td>
                    <td className="p-3">7 Days</td>
                    <td className="p-3 font-mono text-[11px]">HttpOnly, Path=/api/v1/auth</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono font-bold text-[#401827]">rk.collapsed</td>
                    <td className="p-3">Remembers sidebar preference (local storage only)</td>
                    <td className="p-3">Persistent</td>
                    <td className="p-3 font-mono text-[11px]">Client Preference</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl text-[#28121D]">3. Cross-Site Request Forgery (CSRF) Mitigation</h2>
            <p>
              All write endpoints (e.g., payment execution, quotation approval, agreement e-signatures) enforce strict Origin Verification (`OriginGuard`) and SameSite cookie isolation to prevent any cross-origin state modification.
            </p>
          </section>

          <div className="pt-6 border-t border-[#E9E4DE] flex flex-wrap items-center justify-between gap-4 text-xs text-[#777078]">
            <span>Security Version: 2026.11</span>
            <div className="flex gap-4">
              <Link href="/legal/privacy" className="hover:underline text-[#401827] font-medium">Privacy Policy</Link>
              <Link href="/legal/terms" className="hover:underline text-[#401827] font-medium">Terms of Service</Link>
              <Link href="/system-status" className="hover:underline text-[#21845A] font-medium">System Status</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

