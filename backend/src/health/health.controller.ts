import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import IORedis from 'ioredis';
import { Client } from 'minio';
import type { Response } from 'express';
import { Public } from '../common/decorators';
import { env } from '../config/env';
import { PrismaService } from '../database/prisma.service';

@ApiTags('health') @Controller('health') @Public()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get('live') live() { return { status: 'ok' }; }

  /** Readiness: database is mandatory (503 without it); redis/minio/gotenberg report as degraded. */
  @Get()
  async ready(@Res({ passthrough: true }) res: Response) {
    const check = async (fn: () => Promise<unknown>) => { try { await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2500))]); return 'up'; } catch { return 'down'; } };
    const m = env.minio;
    const checks = {
      database: await check(() => this.prisma.$queryRaw`SELECT 1`),
      redis: await check(async () => { const r = new IORedis(env.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0 }); try { await r.connect(); await r.ping(); } finally { r.disconnect(); } }),
      minio: await check(() => new Client({ endPoint: m.endPoint, port: m.port, useSSL: m.useSSL, accessKey: m.accessKey, secretKey: m.secretKey }).bucketExists(m.bucket)),
      gotenberg: await check(async () => { const r = await fetch(`${env.gotenbergUrl}/health`); if (!r.ok) throw new Error('bad'); }),
    };
    if (checks.database === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: Object.values(checks).every((c) => c === 'up') ? 'ok' : checks.database === 'down' ? 'down' : 'degraded', checks, time: new Date().toISOString() };
  }
}
