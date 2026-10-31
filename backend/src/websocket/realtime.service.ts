import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

export type LiveEvent = 'vendor.arrival' | 'timeline.updated' | 'incident.created' | 'incident.updated' | 'task.updated' | 'guests.updated' | 'event.status' | 'notification';

/** Thin broadcaster. Callers MUST persist to PostgreSQL first; this only pushes the already-saved state. */
@Injectable()
export class RealtimeService {
  private server?: Server;
  private logger = new Logger('Realtime');
  attach(server: Server) { this.server = server; }
  toWedding(weddingId: string, event: LiveEvent, payload: unknown) {
    this.server?.to(`wedding:${weddingId}`).emit(event, { weddingId, at: new Date().toISOString(), payload });
    this.logger.debug(`${event} -> wedding:${weddingId}`);
  }
  toUser(userId: string, event: LiveEvent, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, { at: new Date().toISOString(), payload });
  }
}
