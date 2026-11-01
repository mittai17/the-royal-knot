'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  QrCode,
  Building,
  CreditCard,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  ShieldCheck,
  Loader2,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import qrcode from 'qrcode-generator';
import { LotusMark } from '@/components/layout/logo';
import { inr, fmtDate } from '@/lib/utils';
import { notify } from '@/lib/toast';

export default function RoyalPayCheckoutPortal({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);

  const [activeTab, setActiveTab] = useState<'upi' | 'rtgs' | 'card'>('upi');
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const [utrNumber, setUtrNumber] = useState('');
  const [vpa, setVpa] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  const orderAmount = 3000000; // ₹30,00,000
  const weddingName = 'Mehta & Verma Wedding';
  const milestoneName = 'Initial Booking Deposit';

  // Generate NPCI UPI QR code
  useEffect(() => {
    try {
      const upiUrl = `upi://pay?pa=royalknot@icici&pn=The%20Royal%20Knot&am=${orderAmount}&cu=INR&tn=BookingDeposit-${orderId}`;
      const qr = qrcode(0, 'M');
      qr.addData(upiUrl);
      qr.make();
      setQrDataUrl(qr.createDataURL(5, 10));
    } catch {
      /* qr generation */
    }
  }, [orderAmount, orderId]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify.ok(`Copied ${label} to clipboard`);
  };

  const simulateSuccessWebhook = async (method: string) => {
    setLoading(true);
    const mockUtr = utrNumber || `UTR${Date.now().toString().slice(-8)}`;
    setUtrNumber(mockUtr);

    try {
      // Post webhook callback to self-hosted backend
      await fetch('/api/v1/payments/callbacks/hyperswitch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': 'sig_mock_sha256_verified',
        },
        body: JSON.stringify({
          eventType: 'payment.succeeded',
          gatewayRef: `hyp_${Date.now()}`,
          orderId,
          amount: orderAmount,
          method,
          utr: mockUtr,
        }),
      }).catch(() => undefined);

      setTimeout(() => {
        setLoading(false);
        setPaymentStatus('success');
        notify.ok('Payment recorded! 25+ automated planning tasks unlocked.');
      }, 1000);
    } catch {
      setLoading(false);
      setPaymentStatus('success');
    }
  };

  const simulateFailure = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setPaymentStatus('failed');
      notify.err('Card issuer simulation rejected the transaction (Code: AUTH_DECLINED)');
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#F7F5F1] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Branding */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LotusMark className="h-9 w-9 text-burgundy" />
            <div>
              <h1 className="font-serif text-xl text-burgundy-deep">RoyalPay</h1>
              <p className="text-[11px] text-ink-soft uppercase tracking-wider">Self-Hosted Luxury Checkout Gateway</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-line text-xs font-mono text-ink-soft">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            256-Bit Encrypted
          </span>
        </div>

        {/* Payment Card */}
        <div className="card overflow-hidden border border-line bg-white shadow-pop">
          {/* Order Summary Strip */}
          <div className="p-6 bg-gradient-to-r from-burgundy-deep to-burgundy text-white space-y-2">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>{weddingName}</span>
              <span className="font-mono">Order #{orderId}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-gold font-medium uppercase tracking-wide">{milestoneName}</p>
                <h2 className="font-serif text-3xl font-normal tabular-nums">{inr(orderAmount)}</h2>
              </div>
              <span className="text-xs text-white/80 bg-white/10 px-2.5 py-1 rounded-full">
                Guaranteed Vault Ledger
              </span>
            </div>
          </div>

          {paymentStatus === 'success' ? (
            <div className="p-8 sm:p-10 text-center space-y-6">
              <div className="h-16 w-16 rounded-full bg-success-soft text-success grid place-items-center mx-auto">
                <CheckCircle2 className="h-10 w-10" />
              </div>

              <div className="space-y-1.5">
                <h3 className="font-serif text-2xl text-burgundy-deep">Payment Successfully Verified</h3>
                <p className="text-sm text-ink-soft max-w-md mx-auto">
                  ₹30,00,000 has been credited to The Royal Knot Client Escrow. The Booking Confirmation and 25+ automated planning tasks have unlocked.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-2/60 border border-line text-xs font-mono space-y-1 max-w-sm mx-auto text-left">
                <div className="flex justify-between">
                  <span className="text-ink-soft">UTR / Bank Ref:</span>
                  <span className="font-semibold text-ink">{utrNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-soft">Receipt ID:</span>
                  <span className="text-ink">RCT-2026-MEHTA-01</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-soft">Timestamp:</span>
                  <span className="text-ink">Today, {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <a
                  href={`/api/v1/payments/${orderId}/receipt`}
                  download
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-burgundy text-white hover:bg-burgundy-deep text-xs font-semibold shadow-sm"
                >
                  <Download className="h-4 w-4 text-gold" />
                  Download Gotenberg PDF Receipt
                </a>

                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-line bg-white hover:bg-surface-2 text-xs font-semibold"
                >
                  Enter Wedding Workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : paymentStatus === 'failed' ? (
            <div className="p-8 sm:p-10 text-center space-y-6">
              <div className="h-16 w-16 rounded-full bg-danger-soft text-danger grid place-items-center mx-auto">
                <XCircle className="h-10 w-10" />
              </div>

              <div className="space-y-1.5">
                <h3 className="font-serif text-2xl text-burgundy-deep">Authorization Declined</h3>
                <p className="text-sm text-ink-soft max-w-md mx-auto">
                  The issuing institution could not approve this transaction. No funds were debited from your account.
                </p>
              </div>

              <button
                onClick={() => setPaymentStatus('pending')}
                className="btn-primary btn-md mx-auto"
              >
                Try Alternative Payment Method
              </button>
            </div>
          ) : (
            <div>
              {/* Payment Method Tabs */}
              <div className="grid grid-cols-3 border-b border-line bg-surface-2/40 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveTab('upi')}
                  className={`py-3.5 flex items-center justify-center gap-2 transition-colors border-b-2 ${
                    activeTab === 'upi' ? 'border-burgundy text-burgundy bg-white font-semibold' : 'border-transparent text-ink-soft hover:text-ink'
                  }`}
                >
                  <QrCode className="h-4 w-4" />
                  Instant UPI QR
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('rtgs')}
                  className={`py-3.5 flex items-center justify-center gap-2 transition-colors border-b-2 ${
                    activeTab === 'rtgs' ? 'border-burgundy text-burgundy bg-white font-semibold' : 'border-transparent text-ink-soft hover:text-ink'
                  }`}
                >
                  <Building className="h-4 w-4" />
                  RTGS / NEFT Transfer
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('card')}
                  className={`py-3.5 flex items-center justify-center gap-2 transition-colors border-b-2 ${
                    activeTab === 'card' ? 'border-burgundy text-burgundy bg-white font-semibold' : 'border-transparent text-ink-soft hover:text-ink'
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  Centurion / Card
                </button>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                {/* Tab 1: Real NPCI UPI QR */}
                {activeTab === 'upi' && (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="p-4 rounded-2xl border-2 border-[#C6A46A]/40 bg-white shadow-md text-center shrink-0">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="NPCI UPI QR Code" className="h-44 w-44 mx-auto rounded-lg" />
                      ) : (
                        <div className="h-44 w-44 grid place-items-center bg-surface-2 rounded-lg text-xs text-ink-soft">
                          Generating QR…
                        </div>
                      )}
                      <p className="mt-2 text-[11px] font-mono font-semibold text-burgundy">Scan with any UPI App</p>
                      <p className="text-[10px] text-ink-soft">GPay · PhonePe · Paytm · BHIM</p>
                    </div>

                    <div className="space-y-4 flex-1 text-left">
                      <div>
                        <h4 className="font-serif text-lg text-burgundy-deep">Scan & Authorize</h4>
                        <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">
                          Scan the dynamic NPCI QR with your authorized bank or wealth management app. Limit up to ₹1,00,000 to ₹5,00,000 per UPI handle.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-ink">Or Enter Virtual Payment Address (VPA)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={vpa}
                            onChange={(e) => setVpa(e.target.value)}
                            placeholder="username@icici"
                            className="input text-xs"
                          />
                          <button
                            type="button"
                            disabled={loading || !vpa}
                            onClick={() => simulateSuccessWebhook('UPI_COLLECT')}
                            className="btn-primary btn-sm shrink-0"
                          >
                            Collect
                          </button>
                        </div>
                      </div>

                      {/* Hackathon webhook simulator */}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => simulateSuccessWebhook('UPI_QR')}
                        className="w-full h-10 rounded-xl bg-gold-soft border border-gold/40 text-[#8A6B2E] text-xs font-semibold hover:bg-gold-soft/80 flex items-center justify-center gap-2"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Simulate Instant UPI Webhook Confirmation
                      </button>
                    </div>
                  </div>
                )}

                {/* Tab 2: RTGS / NEFT Luxury Transfer */}
                {activeTab === 'rtgs' && (
                  <div className="space-y-4 text-left">
                    <div>
                      <h4 className="font-serif text-lg text-burgundy-deep">Virtual Client Escrow Details</h4>
                      <p className="text-xs text-ink-soft mt-0.5">
                        Transfer the milestone directly via corporate net banking or your private banker.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-surface-2/60 border border-line space-y-2.5 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-ink-soft">Beneficiary Name:</span>
                        <div className="flex items-center gap-1.5 font-semibold text-ink">
                          <span>The Royal Knot Escrow Account</span>
                          <button onClick={() => copyToClipboard('The Royal Knot Escrow Account', 'Name')} className="text-ink-soft hover:text-burgundy">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-ink-soft">Virtual Account No:</span>
                        <div className="flex items-center gap-1.5 font-semibold text-ink">
                          <span>RKNT9900881122</span>
                          <button onClick={() => copyToClipboard('RKNT9900881122', 'Account Number')} className="text-ink-soft hover:text-burgundy">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-ink-soft">IFSC Code:</span>
                        <div className="flex items-center gap-1.5 font-semibold text-ink">
                          <span>ICIC0000001 (Jaipur Main Branch)</span>
                          <button onClick={() => copyToClipboard('ICIC0000001', 'IFSC')} className="text-ink-soft hover:text-burgundy">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 space-y-2">
                      <label className="text-xs font-medium text-ink">Bank UTR Number (from your net banking receipt)</label>
                      <input
                        type="text"
                        value={utrNumber}
                        onChange={(e) => setUtrNumber(e.target.value)}
                        placeholder="e.g. ICICR520261101998822"
                        className="input text-xs"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => simulateSuccessWebhook('RTGS')}
                      className="w-full h-11 rounded-xl bg-burgundy text-white hover:bg-burgundy-deep text-xs font-semibold flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Submit UTR & Simulate Bank Settlement Webhook
                    </button>
                  </div>
                )}

                {/* Tab 3: Corporate / Centurion Card */}
                {activeTab === 'card' && (
                  <div className="space-y-4 text-left">
                    <div>
                      <h4 className="font-serif text-lg text-burgundy-deep">Corporate or High-Limit Card</h4>
                      <p className="text-xs text-ink-soft mt-0.5">
                        Processed via self-hosted Hyperswitch tokenization vault.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-line bg-surface-2/40 space-y-3">
                      <div>
                        <label className="text-[11px] font-medium text-ink-soft uppercase tracking-wider">Card Number</label>
                        <input type="text" readOnly value="•••• •••• •••• 9012 (Centurion Black)" className="input text-xs bg-white font-mono mt-1" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-medium text-ink-soft uppercase tracking-wider">Expires</label>
                          <input type="text" readOnly value="12/28" className="input text-xs bg-white font-mono mt-1" />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-ink-soft uppercase tracking-wider">CVV</label>
                          <input type="password" value="•••" readOnly className="input text-xs bg-white font-mono mt-1" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => simulateSuccessWebhook('CARD')}
                        className="h-11 rounded-xl bg-burgundy hover:bg-burgundy-deep text-white text-xs font-semibold flex items-center justify-center gap-2"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Authorize ₹30,00,000
                      </button>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={simulateFailure}
                        className="h-11 rounded-xl border border-danger/40 bg-danger-soft text-danger hover:bg-danger-soft/80 text-xs font-semibold flex items-center justify-center gap-2"
                      >
                        Simulate Failure
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-ink-soft font-serif">
          The Royal Knot Sovereign Payment Engine · Powered by Self-Hosted Hyperswitch
        </p>
      </div>
    </div>
  );
}

