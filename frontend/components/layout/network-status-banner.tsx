'use client';
import { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

export function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [reconnected, setReconnected] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setReconnected(true);
      // Auto-hide the "Back online" toast after 3 seconds
      const timer = setTimeout(() => {
        setReconnected(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !reconnected) return null;

  return (
    <div
      role="status"
      className={`fixed top-0 left-0 right-0 z-50 text-xs px-4 py-2 font-medium transition-all duration-300 flex items-center justify-center gap-2 shadow-sm ${
        !isOnline
          ? 'bg-[#D99A35] text-[#28121D] font-semibold'
          : 'bg-[#21845A] text-white'
      }`}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3.5 w-3.5 animate-pulse shrink-0" />
          <span>
            Venue Wi-Fi interrupted — Changes queued locally and will sync automatically when reconnected
          </span>
        </>
      ) : (
        <>
          <Wifi className="h-3.5 w-3.5 shrink-0" />
          <span>Palace Wi-Fi restored — Workspace synchronizing with database...</span>
        </>
      )}
    </div>
  );
}

