'use client';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { config } from '@/lib/config';

export interface ChatAttachment { id: string; name: string; mimeType: string; size: number }
export interface ChatMessage { id: string; threadId: string; senderId: string; sender: { id: string; name: string; role: string }; body: string; createdAt: string; attachments: ChatAttachment[] }
export interface MessageEvent { threadId: string; channel: string; weddingId: string | null; message: ChatMessage }

/**
 * One socket per page for `message.new` (pushed to the user's own room, no wedding join needed). The server persists
 * first, so after a reconnect `onSync` triggers a REST refetch to cover anything missed while offline.
 */
export function useChatLive(onMessage: (e: MessageEvent) => void, onSync?: () => void) {
  const cb = useRef(onMessage); cb.current = onMessage;
  const sync = useRef(onSync); sync.current = onSync;
  useEffect(() => {
    const socket: Socket = io(`${config.wsUrl}/live`, { withCredentials: true, reconnectionDelayMax: 5000 });
    let first = true;
    socket.on('message.new', (p: { payload: MessageEvent }) => cb.current(p.payload));
    socket.on('connect', () => { if (!first) sync.current?.(); first = false; });
    return () => { socket.close(); };
  }, []);
}
