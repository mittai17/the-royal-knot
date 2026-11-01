'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  HeartHandshake,
  Store,
  Users,
  RadioTower,
  Plus,
  FileBarChart,
  FileSignature,
  CreditCard,
  Calendar,
  X,
  Compass,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';

interface CommandItem {
  id: string;
  category: 'Weddings' | 'Quick Actions' | 'Navigation' | 'Vendors & Sourcing';
  title: string;
  subtitle?: string;
  href?: string;
  action?: () => void;
  icon: React.ComponentType<{ className?: string }>;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const items: CommandItem[] = useMemo(
    () => [
      // Quick Actions
      {
        id: 'new-enquiry',
        category: 'Quick Actions',
        title: 'Log New Couple Enquiry',
        subtitle: 'Capture intake for Jaipur / Udaipur lead',
        href: '/enquiries?new=1',
        icon: Plus,
      },
      {
        id: 'open-command',
        category: 'Quick Actions',
        title: 'Open Live Event Command Centre',
        subtitle: 'Real-time telemetry, run-sheet, & incidents',
        href: '/command-centre',
        icon: RadioTower,
      },
      {
        id: 'export-report',
        category: 'Quick Actions',
        title: 'Export Profitability & Reconciliation Report',
        subtitle: 'Generate Gotenberg PDF financial summary',
        href: '/reports?tab=profitability',
        icon: FileBarChart,
      },
      {
        id: 'create-rfq',
        category: 'Quick Actions',
        title: 'Request 3-Vendor Quotations (RFP)',
        subtitle: 'Sourcing matrix for catering, decor, photography',
        href: '/procurement?tab=rfqs&new=1',
        icon: FileSignature,
      },

      // Weddings
      {
        id: 'w-mehta',
        category: 'Weddings',
        title: 'Mehta Wedding · Jaipur',
        subtitle: 'The Leela & Rambagh Palace · ₹1,50,00,000 · 400 Pax',
        href: '/weddings/b721a90c-e296-4034-869b-926feb635f4b',
        icon: HeartHandshake,
      },
      {
        id: 'w-sharma',
        category: 'Weddings',
        title: 'Sharma Wedding · Udaipur',
        subtitle: 'Taj Lake Palace & Jagmandir · ₹95,00,000 · 280 Pax',
        href: '/weddings',
        icon: HeartHandshake,
      },
      {
        id: 'w-khanna',
        category: 'Weddings',
        title: 'Khanna Wedding · Udaipur',
        subtitle: 'The Oberoi Udaivilas · ₹1,20,00,000 · 350 Pax',
        href: '/weddings',
        icon: HeartHandshake,
      },

      // Navigation
      {
        id: 'nav-enquiries',
        category: 'Navigation',
        title: 'Enquiries Pipeline & Leads',
        subtitle: 'CRM stages: New, Consultation, Proposal, Won',
        href: '/enquiries',
        icon: Compass,
      },
      {
        id: 'nav-payments',
        category: 'Navigation',
        title: 'Client Invoices & Payments Register',
        subtitle: 'Milestone tracking, UPI QR, and bank deposits',
        href: '/payments',
        icon: CreditCard,
      },
      {
        id: 'nav-guests',
        category: 'Navigation',
        title: 'Guest List & Transit Roster',
        subtitle: 'RSVP status, hotel allocations, and airport shuttles',
        href: '/guests',
        icon: Users,
      },
      {
        id: 'nav-vendors',
        category: 'Navigation',
        title: 'Empanelled Vendor Directory',
        subtitle: '26+ verified Rajasthan caterers, decor, and sound',
        href: '/vendors',
        icon: Store,
      },
      {
        id: 'nav-status',
        category: 'Navigation',
        title: 'System Infrastructure Status',
        subtitle: 'Check PostgreSQL, Redis, MinIO, and Gotenberg health',
        href: '/system-status',
        icon: ShieldAlert,
      },
    ],
    []
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle?.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [items, query]);

  const handleSelect = (item: CommandItem) => {
    setOpen(false);
    setQuery('');
    if (item.action) {
      item.action();
    } else if (item.href) {
      router.push(item.href);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="card w-full max-w-xl overflow-hidden border border-[#C6A46A]/40 bg-white shadow-pop text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 p-4 border-b border-line bg-surface-2/40">
          <Search className="h-5 w-5 text-burgundy shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Jump to wedding, search guest, vendor, or trigger action…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-soft focus:outline-hidden"
            autoFocus
          />
          <kbd className="px-2 py-0.5 rounded bg-white border border-line text-[11px] font-mono text-ink-soft">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-line/40">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-soft">
              No matching weddings, vendors, or operational routes found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors text-left text-xs ${
                    idx === selectedIndex ? 'bg-gold-soft/50 text-burgundy' : 'hover:bg-surface-2 text-ink'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-surface-2 border border-line grid place-items-center shrink-0">
                      <Icon className="h-4 w-4 text-burgundy" />
                    </div>
                    <div>
                      <p className="font-semibold text-ink">{item.title}</p>
                      {item.subtitle && <p className="text-[11px] text-ink-soft">{item.subtitle}</p>}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono text-ink-soft bg-surface-2 px-2 py-0.5 rounded border border-line">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="p-3 border-t border-line bg-surface-2/60 flex items-center justify-between text-[11px] text-ink-soft">
          <div className="flex items-center gap-2">
            <LotusMark className="h-3.5 w-3.5 text-burgundy" />
            <span>The Royal Knot Command Palette</span>
          </div>
          <span>↑↓ Navigate · ↵ Select · ESC Close</span>
        </div>
      </div>
    </div>
  );
}

