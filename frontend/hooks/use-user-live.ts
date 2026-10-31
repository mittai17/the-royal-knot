'use client';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { config } from '@/lib/config';
import type { LiveEvent } from './use-live';

/** Subscribes to events pushed to the signed-in user's own room (no wedding join). Fires `cb` for each; the caller refetches REST state. */
export function useUserEvents(events: LiveEvent[], cb: (e: LiveEvent, payload: unknown) => void) {
  const ref = useRef(cb); ref.current = cb;
  const key = events.join(',');
  useEffect(() => {
    const socket: Socket = io(`${config.wsUrl}/live`, { withCredentials: true, reconnectionDelayMax: 5000 });
    key.split(',').forEach((ev) => socket.on(ev, (p: unknown) => ref.current(ev as LiveEvent, p)));
    return () => { socket.close(); };
  }, [key]);
}
