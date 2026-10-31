'use client';
import Link from 'next/link';
import { CalendarHeart, CheckCircle2, CreditCard, FileText, Heart, Users, Store, CalendarRange, ArrowRight } from 'lucide-react';
import { Card, PageHeader, ProgressBar, StatCard } from '@/components/ui/primitives';
import { Async } from '@/components/portal/shared';
import { useApi } from '@/hooks/use-api';
import { fmtDate, inr, toNum } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/primitives';

interface Dash {
  wedding: { id: string; name: string; brideName: string; groomName: string; venue?: string | null; location: string; startDate: string; endDate: string; status: string; theme?: string | null };
  daysToGo: number; tasks: { done: number; total: number }; progress: number;
  guests: { expected: number; invited: number; invitations: number; confirmed: number; declined: number; pending: number };
  payments: { expected: string; received: string; outstanding: string; percentPaid: number; completedMilestones: number; totalMilestones: number; next: { type: string; dueDate: string; outstanding: string; status: string } | null };
  upcomingEvents: { id: string; name: string; date: string; venue?: string | null }[];
  planner?: { name: string; email: string; phone?: string | null } | null;
}

const ACTIONS = [
  { href: '/client-portal/guests', label: 'Manage guest list', icon: Users }, { href: '/client-portal/payments', label: 'View payments', icon: CreditCard },
  { href: '/client-portal/documents', label: 'Contracts & documents', icon: FileText }, { href: '/client-portal/schedule', label: 'Event schedule', icon: CalendarRange },
  { href: '/client-portal/vendors', label: 'Our vendors', icon: Store },
];

export default function Page() {
  const q = useApi<Dash>('/portal/client/dashboard');
  return (
    <div>
      <PageHeader title="Welcome" subtitle="Everything about your wedding in one place." />
      <Async q={q} rows={3}>
        {(d) => (
          <div className="space-y-5">
            <Card className="bg-gradient-to-br from-burgundy-deep to-burgundy text-white border-0" >
              <div className="flex flex-wrap items-center justify-between gap-4 pt-5">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gold-soft/80">{d.wedding.theme ?? 'Your celebration'}</p>
                  <h2 className="font-serif text-3xl mt-1">{d.wedding.brideName} &amp; {d.wedding.groomName}</h2>
                  <p className="text-sm text-white/80 mt-1">{fmtDate(d.wedding.startDate, 'dd MMM')} – {fmtDate(d.wedding.endDate)} · {d.wedding.venue ?? d.wedding.location}</p>
                </div>
                <div className="text-center"><p className="num text-5xl leading-none">{d.daysToGo}</p><p className="text-xs uppercase tracking-widest text-gold-soft/80 mt-1">{d.daysToGo === 1 ? 'day to go' : 'days to go'}</p></div>
              </div>
            </Card>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={<CalendarHeart className="h-5 w-5" />} label="Days to go" value={d.daysToGo} hint={fmtDate(d.wedding.startDate)} />
              <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Tasks completed" value={`${d.tasks.done}/${d.tasks.total}`} hint="planning checklist" />
              <StatCard icon={<Users className="h-5 w-5" />} label="Guests confirmed" value={d.guests.confirmed} hint={`of ${d.guests.invited} invited`} />
              <StatCard icon={<CreditCard className="h-5 w-5" />} label="Payments completed" value={`${d.payments.percentPaid}%`} hint={`${d.payments.completedMilestones}/${d.payments.totalMilestones} milestones`} />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card title="Wedding progress" className="lg:col-span-2">
                <div className="flex items-center justify-between text-sm mb-2"><span className="text-ink-soft">Planning tasks done</span><span className="num">{d.progress}%</span></div>
                <ProgressBar value={d.progress} tone="burgundy" />
                <div className="flex items-center justify-between text-sm mt-5 mb-2"><span className="text-ink-soft">Paid so far · {inr(d.payments.received)} of {inr(d.payments.expected)}</span><span className="num">{d.payments.percentPaid}%</span></div>
                <ProgressBar value={d.payments.percentPaid} tone="success" />
                {d.payments.next && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-4">
                    <div><p className="text-xs text-ink-soft">Next payment · {d.payments.next.type.toLowerCase()}</p><p className="num text-lg">{inr(d.payments.next.outstanding)}</p><p className="text-xs text-ink-soft">Due {fmtDate(d.payments.next.dueDate)}</p></div>
                    <div className="flex items-center gap-3"><StatusBadge status={d.payments.next.status} /><Link className="btn-primary btn-sm" href="/client-portal/payments">Pay now</Link></div>
                  </div>
                )}
              </Card>
              <Card title="Upcoming events">
                {d.upcomingEvents.length === 0 ? <p className="text-sm text-ink-soft">No upcoming events.</p> : (
                  <ul className="space-y-3">{d.upcomingEvents.map((e) => (
                    <li key={e.id} className="flex items-center gap-3"><div className="h-9 w-9 rounded-lg bg-gold-soft text-burgundy grid place-items-center"><Heart className="h-4 w-4" /></div><div className="min-w-0"><p className="text-sm font-medium truncate">{e.name}</p><p className="text-xs text-ink-soft">{fmtDate(e.date, 'EEE, dd MMM')}{e.venue ? ` · ${e.venue}` : ''}</p></div></li>
                  ))}</ul>
                )}
              </Card>
            </div>

            <Card title="Quick actions">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {ACTIONS.map((a) => (
                  <Link key={a.href} href={a.href} className="group flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-surface-2/60 transition-colors">
                    <a.icon className="h-4 w-4 text-burgundy" /><span className="text-sm font-medium flex-1">{a.label}</span><ArrowRight className="h-3.5 w-3.5 text-ink-soft group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                ))}
              </div>
              {d.planner && <p className="text-xs text-ink-soft mt-4">Your planner: <span className="font-medium text-ink">{d.planner.name}</span> · {d.planner.phone ?? d.planner.email}</p>}
              {toNum(d.payments.outstanding) > 0 && <p className="text-xs text-ink-soft mt-1">Outstanding balance {inr(d.payments.outstanding)}</p>}
            </Card>
          </div>
        )}
      </Async>
    </div>
  );
}
