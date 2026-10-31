import type { ReactNode } from 'react';
import { WeddingProvider } from '@/lib/wedding-context';
import { AppShell } from '@/components/layout/app-shell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <WeddingProvider><AppShell>{children}</AppShell></WeddingProvider>;
}
