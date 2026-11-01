'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { LotusMark } from '@/components/layout/logo';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [istTime, setIstTime] = useState('');

  useEffect(() => {
    const now = new Date();
    setIstTime(
      now.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'medium',
      }) + ' IST'
    );
    console.error('[The Royal Knot] Global Root Error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F7F5F1] font-sans text-[#242124] antialiased flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg text-center space-y-6">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-white border border-[#E9E4DE] shadow-sm grid place-items-center">
            <LotusMark className="h-9 w-9 text-[#401827]" />
          </div>

          <div className="p-8 rounded-2xl border border-[#E9E4DE] bg-white shadow-lg space-y-5 text-left">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#F9E5E5] text-[#C94B4B] grid place-items-center shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-serif text-2xl text-[#28121D]">Application Interrupted</h1>
                <p className="text-xs text-[#777078] mt-0.5">Global shell error caught by the root boundary.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F0ECE6]/70 border border-[#E9E4DE] text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-[#777078]">Digest ID:</span>
                <span className="font-semibold text-[#242124]">{error.digest || 'ERR_ROOT'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777078]">Time:</span>
                <span>{istTime || 'Now'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => reset()}
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-[#401827] text-white hover:bg-[#28121D] text-sm font-medium transition-colors"
              >
                <RotateCcw className="h-4 w-4 text-[#C6A46A]" />
                Restart Application Shell
              </button>
              <button
                onClick={() => window.location.assign('/dashboard')}
                className="inline-flex items-center justify-center h-11 px-4 rounded-xl border border-[#E9E4DE] bg-white hover:bg-[#F0ECE6] text-sm font-medium"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

