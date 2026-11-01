'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  MapPin,
  CheckCircle2,
  Users,
  Plane,
  Download,
  Utensils,
  QrCode,
  Sparkles,
  Heart,
} from 'lucide-react';
import qrcode from 'qrcode-generator';
import { LotusMark } from '@/components/layout/logo';
import { notify } from '@/lib/toast';

export default function GuestRsvpPortal({
  params,
}: {
  params: Promise<{ weddingSlug: string }>;
}) {
  const { weddingSlug } = use(params);

  const [guestName, setGuestName] = useState('Vikramaditya Singhania');
  const [attending, setAttending] = useState<'yes' | 'no'>('yes');
  const [familyCount, setFamilyCount] = useState<number>(3);
  const [dietary, setDietary] = useState<string>('Pure Veg');
  const [travelMode, setTravelMode] = useState<string>('Flight (Air India AI-492)');
  const [arrivalDate, setArrivalDate] = useState('12 Nov 2026, 11:30 AM');
  const [submitted, setSubmitted] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const wedding = {
    coupleNames: 'Aarav & Ananya',
    venue: 'Rambagh Palace & Jai Mahal Palace',
    city: 'Jaipur, Rajasthan',
    dates: '12 – 15 November 2026',
    welcomeQuote: 'Together with their families, Aarav & Ananya invite you to celebrate their union under the starlit skies of Jaipur.',
  };

  useEffect(() => {
    try {
      const passData = JSON.stringify({
        guest: guestName,
        wedding: weddingSlug,
        pax: familyCount,
        diet: dietary,
        passId: `RK-PASS-${weddingSlug.slice(0, 4).toUpperCase()}-9021`,
      });
      const qr = qrcode(0, 'M');
      qr.addData(passData);
      qr.make();
      setQrDataUrl(qr.createDataURL(5, 8));
    } catch {
      /* qr generation */
    }
  }, [guestName, weddingSlug, familyCount, dietary]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    notify.ok('RSVP confirmed! Your QR Check-In Pass is ready.');
  };

  return (
    <div className="min-h-screen bg-[#F7F5F1] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Luxury Invitation Header */}
        <div className="card overflow-hidden border border-line bg-white shadow-pop text-center">
          <div className="p-8 sm:p-12 bg-gradient-to-b from-[#401827] to-[#28121D] text-white relative">
            <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(#C6A46A_1px,transparent_1px)] [background-size:20px_20px]" />
            <div className="relative space-y-3">
              <div className="h-12 w-12 rounded-full bg-white/10 border border-gold/40 grid place-items-center mx-auto mb-3">
                <LotusMark className="h-7 w-7 text-gold" />
              </div>

              <span className="text-[11px] font-medium uppercase tracking-widest text-gold block">
                Royal Wedding Celebration
              </span>

              <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-wide text-[#F7F5F1]">
                {wedding.coupleNames}
              </h1>

              <p className="text-xs sm:text-sm text-white/80 max-w-md mx-auto leading-relaxed pt-1">
                {wedding.welcomeQuote}
              </p>

              <div className="pt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-white/90">
                <span className="flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-full">
                  <Calendar className="h-3.5 w-3.5 text-gold" />
                  {wedding.dates}
                </span>
                <span className="flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-full">
                  <MapPin className="h-3.5 w-3.5 text-gold" />
                  {wedding.venue}, {wedding.city}
                </span>
              </div>
            </div>
          </div>

          {submitted ? (
            <div className="p-8 sm:p-10 space-y-6 text-center">
              <div className="h-16 w-16 rounded-full bg-success-soft text-success grid place-items-center mx-auto">
                <CheckCircle2 className="h-10 w-10" />
              </div>

              <div className="space-y-1">
                <h2 className="font-serif text-2xl text-burgundy-deep">RSVP Confirmed & Pass Issued</h2>
                <p className="text-sm text-ink-soft">
                  We look forward to welcoming you and your family, {guestName}.
                </p>
              </div>

              {/* Digital Check-In Pass Card */}
              <div className="card p-6 border-2 border-[#C6A46A]/50 bg-gradient-to-b from-white to-surface-2 max-w-sm mx-auto shadow-md space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-line text-xs">
                  <span className="font-serif font-bold text-burgundy">The Royal Knot Pass</span>
                  <span className="font-mono text-ink-soft">PAX: {familyCount}</span>
                </div>

                {qrDataUrl && (
                  <img src={qrDataUrl} alt="Guest QR Check-in Pass" className="h-44 w-44 mx-auto rounded-lg shadow-xs" />
                )}

                <div className="text-xs space-y-1 text-ink">
                  <p className="font-semibold text-sm">{guestName}</p>
                  <p className="text-ink-soft">Dietary: <span className="font-medium text-ink">{dietary}</span></p>
                  <p className="text-ink-soft">Airport Transit: <span className="font-medium text-ink">{travelMode}</span></p>
                </div>

                <a
                  href={qrDataUrl}
                  download={`Pass-${guestName.replace(/\s+/g, '_')}.png`}
                  className="w-full h-10 rounded-xl bg-burgundy hover:bg-burgundy-deep text-white text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Download className="h-3.5 w-3.5 text-gold" />
                  Save Pass to Apple Wallet / Phone
                </a>
              </div>

              <p className="text-xs text-ink-soft">
                Present this QR code at the Airport Concierge Desk or Hotel Palace Gate for instant luggage tagging and check-in.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-8 sm:p-10 space-y-5 text-left">
              <div>
                <h3 className="font-serif text-xl text-burgundy-deep">Confirm Your Presence</h3>
                <p className="text-xs text-ink-soft mt-0.5">Please let the couple know your attendance and transit arrangements.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAttending('yes')}
                  className={`h-12 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
                    attending === 'yes' ? 'bg-burgundy text-white border-burgundy shadow-sm' : 'border-line bg-surface-2/40 text-ink'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4 text-gold" />
                  Joyfully Accept
                </button>
                <button
                  type="button"
                  onClick={() => setAttending('no')}
                  className={`h-12 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
                    attending === 'no' ? 'bg-ink text-white border-ink shadow-sm' : 'border-line bg-surface-2/40 text-ink'
                  }`}
                >
                  Regretfully Decline
                </button>
              </div>

              {attending === 'yes' && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink">Primary Guest Name</label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="input text-xs"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-ink flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-burgundy" />
                        Accompanying Family / Guests
                      </label>
                      <select
                        value={familyCount}
                        onChange={(e) => setFamilyCount(parseInt(e.target.value))}
                        className="select text-xs"
                      >
                        <option value={1}>1 (Just me)</option>
                        <option value={2}>2 Guests (Couple)</option>
                        <option value={3}>3 Guests (Family)</option>
                        <option value={4}>4 Guests (Family)</option>
                        <option value={5}>5+ Guests</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-ink flex items-center gap-1.5">
                        <Utensils className="h-3.5 w-3.5 text-burgundy" />
                        Dietary Preference
                      </label>
                      <select
                        value={dietary}
                        onChange={(e) => setDietary(e.target.value)}
                        className="select text-xs"
                      >
                        <option value="Regular">Regular (North Indian & International)</option>
                        <option value="Pure Veg">Pure Vegetarian</option>
                        <option value="Jain">Jain (No Root Vegetables)</option>
                        <option value="Vegan">Vegan (Plant-Based)</option>
                        <option value="Gluten-Free">Gluten-Free</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink flex items-center gap-1.5">
                      <Plane className="h-3.5 w-3.5 text-burgundy" />
                      Arrival Flight or Train Details (For Airport Shuttle)
                    </label>
                    <input
                      type="text"
                      value={travelMode}
                      onChange={(e) => setTravelMode(e.target.value)}
                      placeholder="e.g. AI-492 landing at Jaipur Airport 11:30 AM"
                      className="input text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-primary w-full h-12 text-sm mt-3 font-semibold shadow-sm"
                  >
                    Confirm RSVP & Generate QR Pass
                  </button>
                </div>
              )}
            </form>
          )}
        </div>

        <p className="text-center text-xs text-ink-soft font-serif">
          The Royal Knot Hospitality & Concierge Desk · Jaipur
        </p>
      </div>
    </div>
  );
}

