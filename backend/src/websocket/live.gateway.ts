import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { UserStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from './realtime.service';

const readCookie = (header: string | undefined, name: string) => header?.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='))?.slice(name.length + 1);

@WebSocketGateway({ namespace: '/live', cors: { origin: (o: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => cb(null, !o || env.frontendUrl.split(',').map((s) => s.trim()).includes(o)), credentials: true } })
export class LiveGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private logger = new Logger('LiveGateway');
  constructor(private jwt: JwtService, private prisma: PrismaService, private rt: RealtimeService) {}

  /** Auth runs as namespace middleware, so a client is only "connected" once it is authenticated (no join-before-auth race). */
  afterInit(server: Server) {
    this.rt.attach(server);
    server.use(async (client, next) => {
      try {
        const origin = client.handshake.headers.origin;
        if (origin && !env.frontendUrl.split(',').map((s) => s.trim()).includes(origin)) throw new Error('origin not allowed'); // blocks cross-site WebSocket hijacking
        const token = (client.handshake.auth?.token as string | undefined) ?? decodeURIComponent(readCookie(client.handshake.headers.cookie, 'access_token') ?? '');
        const payload = this.jwt.verify<{ sub: string }>(token, { secret: env.jwtSecret });
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user || user.status !== UserStatus.ACTIVE) throw new Error('inactive');
        client.data.user = { id: user.id, role: user.role };
        await client.join(`user:${user.id}`);
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) { this.logger.debug(`connected ${client.data.user?.id}`); }

  /** Clients re-emit `join` after every reconnect and then refetch REST state; the ack carries serverTime for sync. */
  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { weddingId: string }) {
    if (!client.data.user || !body?.weddingId) return { ok: false, error: 'unauthorized' };
    const w = await this.prisma.wedding.findUnique({ where: { id: body.weddingId }, select: { id: true } });
    if (!w) return { ok: false, error: 'not_found' };
    await client.join(`wedding:${w.id}`);
    return { ok: true, serverTime: new Date().toISOString() };
  }

  @SubscribeMessage('leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: { weddingId: string }) {
    await client.leave(`wedding:${body?.weddingId}`);
    return { ok: true };
  }
}
