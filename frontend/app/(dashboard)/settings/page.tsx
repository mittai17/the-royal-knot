'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/primitives';
import { Segmented } from '@/components/shared/form-bits';
import { useAuth } from '@/lib/auth';
import { AccountSection, AgreementTemplates, TaskTemplates } from './_components/account';
import { BUSINESS_TABS, BusinessTabPanel, type BusinessTab } from './_components/business-settings';

type FounderTab = BusinessTab | 'account';
const FOUNDER_TABS = [...BUSINESS_TABS, { v: 'account' as const, l: 'My Account' }];

/** FOUNDER: Business Settings (Module 32), tabs via ?tab=. Everyone else: their profile / preferences (Finance: "Finance Settings"). SYSADMIN has no /settings (see /admin/*). */
function Inner() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  if (!user || user.role === 'SYSADMIN') return null;

  if (user.role === 'FOUNDER') {
    const q = params.get('tab');
    const tab: FounderTab = FOUNDER_TABS.some((t) => t.v === q) ? (q as FounderTab) : 'company';
    return (
      <>
        <PageHeader title="Business Settings" subtitle="How the business runs: company, pricing, payments, approvals, templates and policies." />
        <div className="mb-5 overflow-x-auto"><Segmented value={tab} onChange={(v) => router.replace(`/settings?tab=${v}`)} options={FOUNDER_TABS} /></div>
        {tab === 'account' ? <AccountSection /> : <BusinessTabPanel tab={tab} />}
      </>
    );
  }

  const title = user.role === 'FINANCE' ? 'Finance Settings' : user.role === 'OPERATIONS' ? 'Profile Preferences' : 'Settings';
  const planning = user.role === 'PLANNER' || user.role === 'EVENT_MANAGER';
  return (
    <>
      <PageHeader title={title} subtitle={planning ? 'Your account and the reusable templates behind your workflows.' : 'Your account and preferences.'} />
      <div className="grid xl:grid-cols-2 gap-5">
        <AccountSection />
        {planning && <><TaskTemplates />{user.role === 'PLANNER' && <AgreementTemplates />}</>}
      </div>
    </>
  );
}

export default function SettingsPage() { return <Suspense><Inner /></Suspense>; }
