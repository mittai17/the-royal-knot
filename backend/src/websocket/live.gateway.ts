import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { UserStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { ScopeService } from '../common/scope.service';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from './realtime.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const readCookie = (header: string | undefined, name: string) => header?.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='))?.slice(name.length + 1);

@WebSocketGateway({ namespace: '/live', cors: { origin: (o: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => cb(null, !o || env.frontendUrl.split(',').map((s) => s.trim()).includes(o)), credentials: true } })
export class LiveGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private logger = new Logger('LiveGateway');
  constructor(private jwt: JwtService, private prisma: PrismaService, private rt: RealtimeService, private scope: ScopeService) {}

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
        client.data.user = { id: user.id, role: user.role, vendorId: user.vendorId, coupleId: user.coupleId };
        await client.join(`user:${user.id}`);
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) { this.logger.debug(`connected ${client.data.user?.id}`); }

  /**
   * Clients re-emit `join` after every reconnect and then refetch REST state; the ack carries serverTime for sync.
   * Room membership is authorised per wedding by ScopeService (CLIENT: own wedding, VENDOR: booked / invited, staff: assigned,
   * FOUNDER / FINANCE: all). Unauthorised and unknown ids get the same answer so ids cannot be probed.
   */
  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { weddingId: string }) {
    const user = client.data.user;
    if (!user || typeof body?.weddingId !== 'string' || !UUID.test(body.weddingId)) return { ok: false, error: 'unauthorized' };
    // re-read the account so a deactivated / re-roled user loses access without waiting for the socket to drop
    const fresh = await this.prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, status: true, vendorId: true, coupleId: true } });
    if (!fresh || fresh.status !== UserStatus.ACTIVE) return { ok: false, error: 'unauthorized' };
    if (!(await this.scope.canAccessWedding(fresh, body.weddingId))) return { ok: false, error: 'forbidden' };
    await client.join(`wedding:${body.weddingId}`);
    return { ok: true, serverTime: new Date().toISOString() };
  }

  @SubscribeMessage('leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: { weddingId: string }) {
    await client.leave(`wedding:${body?.weddingId}`);
    return { ok: true };
  }
}
