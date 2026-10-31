'use client';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { config } from '@/lib/config';

export type LiveEvent = 'vendor.arrival' | 'timeline.updated' | 'incident.created' | 'incident.updated' | 'task.updated' | 'guests.updated' | 'event.status' | 'notification';

/** Joins a wedding room on /live; calls onEvent for any live event and onSync after every (re)connect. */
export function useLive(weddingId: string | null, onEvent: (e: LiveEvent, payload: unknown) => void, onSync?: () => void) {
  const cb = useRef(onEvent); cb.current = onEvent;
  const sync = useRef(onSync); sync.current = onSync;
  const connected = useRef(false);

  useEffect(() => {
    if (!weddingId) return;
    const socket: Socket = io(`${config.wsUrl}/live`, { withCredentials: true, reconnectionDelayMax: 5000 });
    const events: LiveEvent[] = ['vendor.arrival', 'timeline.updated', 'incident.created', 'incident.updated', 'task.updated', 'guests.updated', 'event.status', 'notification'];
    events.forEach((ev) => socket.on(ev, (p: unknown) => cb.current(ev, p)));
    socket.on('connect', () => {
      connected.current = true;
      socket.emit('join', { weddingId });
      sync.current?.(); // state resync after (re)connect
    });
    socket.on('disconnect', () => { connected.current = false; });
    return () => { socket.disconnect(); };
  }, [weddingId]);
}
