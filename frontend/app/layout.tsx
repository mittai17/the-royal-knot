import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Playfair_Display } from 'next/font/google';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const serif = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' });

export const metadata: Metadata = { title: 'The Royal Knot — Wedding Management', description: 'Luxury wedding planning operations platform' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="top-right" toastOptions={{ style: { borderRadius: 12, border: '1px solid #E9E4DE', color: '#242124' } }} />
      </body>
    </html>
  );
}
