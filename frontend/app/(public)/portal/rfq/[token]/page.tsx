'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  FileCheck,
  Building2,
  Plus,
  Trash2,
  ShieldCheck,
  Calendar,
  Users,
} from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';
import { inr } from '@/lib/utils';
import { notify } from '@/lib/toast';

interface LineItem {
  id: string;
  description: string;
  qty: number;
  rate: number;
}

export default function VendorRfqPortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [vendorName, setVendorName] = useState('Jaipur Royal Caterers & Confectioners');
  const [perPlateCost, setPerPlateCost] = useState<number>(3200);
  const [gstType, setGstType] = useState<'intra' | 'inter'>('intra'); // intra: 18% (9+9), inter: 18% IGST
  const [extraHourRate, setExtraHourRate] = useState<number>(35000);
  const [menuFileName, setMenuFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: 'Royal Rajputana 4-Course Gala Dinner Buffet', qty: 400, rate: 3200 },
    { id: '2', description: 'Live Rajasthani Chaat & Dal Baati Counters', qty: 400, rate: 850 },
    { id: '3', description: 'Artisanal Mithai & Late-Night Dessert Studio', qty: 400, rate: 650 },
    { id: '4', description: 'Mocktail & High-Tea Lounge Service', qty: 400, rate: 500 },
  ]);

  const guestCount = 400;

  const addItem = () => {
    setLineItems((items) => [
      ...items,
      { id: Date.now().toString(), description: 'Specialized Live Service Counter', qty: 400, rate: 450 },
    ]);
  };

  const removeItem = (id: string) => {
    setLineItems((items) => items.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: keyof LineItem, val: string | number) => {
    setLineItems((items) =>
      items.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const subtotal = lineItems.reduce((acc, item) => acc + (item.qty || 0) * (item.rate || 0), 0);
  const gstRate = 0.18;
  const gstAmount = subtotal * gstRate;
  const grandTotal = subtotal + gstAmount;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMenuFileName(file.name);
      notify.ok(`Attached ${file.name}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      notify.ok('Quotation successfully submitted and added to comparison matrix');
    }, 1100);
  };

  return (
    <div className="min-h-screen bg-[#F7F5F1] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LotusMark className="h-9 w-9 text-burgundy" />
            <div>
              <h1 className="font-serif text-xl text-burgundy-deep">Vendor RFQ Submission</h1>
              <p className="text-[11px] text-ink-soft uppercase tracking-wider">The Royal Knot Procurement Office</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-line text-xs font-mono text-ink-soft">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Verified Vendor Link
          </span>
        </div>

        {submitted ? (
          <div className="card p-10 border border-line bg-white shadow-pop text-center space-y-6">
            <div className="h-16 w-16 rounded-full bg-success-soft text-success grid place-items-center mx-auto">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <div className="space-y-1.5">
              <h2 className="font-serif text-2xl text-burgundy-deep">Quotation Bid Locked & Submitted</h2>
              <p className="text-sm text-ink-soft max-w-md mx-auto">
                Thank you, {vendorName}. Your bid of <span className="font-semibold text-burgundy">{inr(grandTotal)}</span> has been securely logged into the 3-Vendor Comparison Matrix for the Wedding Planner.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface-2/60 border border-line text-xs font-mono max-w-sm mx-auto text-left space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-soft">RFQ Reference:</span>
                <span className="font-semibold text-ink">RFQ-2026-{token.slice(0, 6).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Attached Menu:</span>
                <span className="text-ink">{menuFileName || 'Standard Royal Banquet Menu.pdf'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">GST Rate:</span>
                <span className="text-ink">18% ({gstType === 'intra' ? 'CGST 9% + SGST 9%' : 'IGST 18%'})</span>
              </div>
            </div>

            <p className="text-xs text-ink-soft">
              The planning director will review your submission and contact you directly upon quotation acceptance.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Wedding Brief Card */}
            <div className="card p-6 border border-line bg-white space-y-4 shadow-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-line gap-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gold">Catering & Banquet RFP</span>
                  <h2 className="font-serif text-2xl text-burgundy-deep font-normal">The Mehta Wedding · Sangeet & Reception</h2>
                </div>
                <div className="text-xs text-ink-soft sm:text-right">
                  <p className="font-mono">RFP #{token.slice(0, 8).toUpperCase()}</p>
                  <p>Venue: Rambagh Palace, Jaipur</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-2/60 border border-line">
                  <Calendar className="h-4 w-4 text-burgundy" />
                  <div>
                    <p className="text-ink-soft">Date of Function</p>
                    <p className="font-semibold">14 Nov 2026</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-2/60 border border-line">
                  <Users className="h-4 w-4 text-burgundy" />
                  <div>
                    <p className="text-ink-soft">Confirmed Headcount</p>
                    <p className="font-semibold">{guestCount} Guests</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-2/60 border border-line">
                  <Building2 className="h-4 w-4 text-burgundy" />
                  <div>
                    <p className="text-ink-soft">Kitchen Clearance</p>
                    <p className="font-semibold">Palace Central Kitchen</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="card p-6 border border-line bg-white space-y-4 shadow-card">
              <div className="flex items-center justify-between pb-2 border-b border-line">
                <div>
                  <h3 className="font-serif text-lg text-burgundy-deep">Line-Item Cost Breakdown</h3>
                  <p className="text-xs text-ink-soft">Specify your package components and per-plate pricing.</p>
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="btn-secondary btn-sm text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Line Item
                </button>
              </div>

              <div className="space-y-3">
                {lineItems.map((item, idx) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2.5 items-center p-3 rounded-xl border border-line bg-surface-2/30">
                    <div className="col-span-12 sm:col-span-6">
                      <label className="text-[10px] text-ink-soft uppercase tracking-wider block">Description</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        className="input text-xs mt-1"
                        required
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <label className="text-[10px] text-ink-soft uppercase tracking-wider block">Guest Qty</label>
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateItem(item.id, 'qty', parseInt(e.target.value) || 0)}
                        className="input text-xs mt-1 text-right tabular-nums"
                        required
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-3">
                      <label className="text-[10px] text-ink-soft uppercase tracking-wider block">Rate / Plate (₹)</label>
                      <input
                        type="number"
                        value={item.rate}
                        onChange={(e) => updateItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                        className="input text-xs mt-1 text-right tabular-nums"
                        required
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-1 text-right pt-3">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={lineItems.length === 1}
                        className="text-ink-soft hover:text-danger p-1 rounded transition-colors disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tax & Extra Fees */}
              <div className="pt-4 border-t border-line grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-ink">GST Classification</label>
                  <select
                    value={gstType}
                    onChange={(e) => setGstType(e.target.value as 'intra' | 'inter')}
                    className="select text-xs"
                  >
                    <option value="intra">Intra-State: CGST 9% + SGST 9% (Total 18%)</option>
                    <option value="inter">Inter-State: IGST 18%</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-ink">Overtime / Extra Hour Rate (₹)</label>
                  <input
                    type="number"
                    value={extraHourRate}
                    onChange={(e) => setExtraHourRate(parseFloat(e.target.value) || 0)}
                    className="input text-xs tabular-nums"
                  />
                </div>
              </div>

              {/* Calculation Summary Box */}
              <div className="p-4 rounded-xl bg-surface-2/60 border border-line space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-soft">Subtotal:</span>
                  <span className="font-medium text-ink tabular-nums">{inr(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-soft">GST (18%):</span>
                  <span className="font-medium text-ink tabular-nums">{inr(gstAmount)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-line text-sm font-semibold">
                  <span className="text-burgundy-deep">Grand Total Quotation:</span>
                  <span className="text-burgundy font-serif tabular-nums text-lg">{inr(grandTotal)}</span>
                </div>
              </div>

              {/* Upload Menu PDF to MinIO */}
              <div className="pt-2 space-y-2">
                <label className="text-xs font-medium text-ink flex items-center justify-between">
                  <span>Attach Detailed Menu & Presentation Deck (PDF)</span>
                  {menuFileName && <span className="text-success text-[11px] font-semibold flex items-center gap-1"><FileCheck className="h-3 w-3" /> Attached</span>}
                </label>
                <div className="border-2 border-dashed border-line rounded-xl p-4 text-center hover:bg-surface-2/30 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="h-6 w-6 text-gold mx-auto mb-1.5" />
                  <p className="text-xs font-medium text-ink">{menuFileName || 'Click to upload Menu & Service Schedule PDF'}</p>
                  <p className="text-[10px] text-ink-soft mt-0.5">Archived securely to Private MinIO Storage Vault</p>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full h-12 text-sm mt-4 font-semibold"
              >
                {submitting ? 'Submitting to Quotation Matrix...' : `Submit Quotation (${inr(grandTotal)})`}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-ink-soft font-serif">
          The Royal Knot Procurement System · Empanelled Vendor Network
        </p>
      </div>
    </div>
  );
}

