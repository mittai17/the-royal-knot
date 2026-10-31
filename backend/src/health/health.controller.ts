import { Controller, Get, HttpStatus, Injectable, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import IORedis from 'ioredis';
import { Client } from 'minio';
import type { Response } from 'express';
import { Public } from '../common/decorators';
import { env } from '../config/env';
import { PrismaService } from '../database/prisma.service';

export type ServiceState = 'up' | 'down' | 'disabled';
export interface ServiceCheck { status: ServiceState; latencyMs: number | null }

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}

  private async probe(fn: () => Promise<unknown>): Promise<ServiceCheck> {
    const t0 = Date.now();
    try {
      await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2500))]);
      return { status: 'up', latencyMs: Date.now() - t0 };
    } catch { return { status: 'down', latencyMs: null }; }
  }

  /** Database is mandatory; redis/minio/gotenberg/keycloak degrade the overall status. Keycloak is `disabled` unless KEYCLOAK_ENABLED=true. */
  async collect() {
    const m = env.minio, kc = env.keycloak;
    const [database, redis, minio, gotenberg, keycloak] = await Promise.all([
      this.probe(() => this.prisma.$queryRaw`SELECT 1`),
      this.probe(async () => { const r = new IORedis(env.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0 }); try { await r.connect(); await r.ping(); } finally { r.disconnect(); } }),
      this.probe(() => new Client({ endPoint: m.endPoint, port: m.port, useSSL: m.useSSL, accessKey: m.accessKey, secretKey: m.secretKey }).bucketExists(m.bucket)),
      this.probe(async () => { const r = await fetch(`${env.gotenbergUrl}/health`); if (!r.ok) throw new Error('bad'); }),
      kc.enabled
        ? this.probe(async () => { const r = await fetch(`${kc.internalIssuer}/.well-known/openid-configuration`); if (!r.ok) throw new Error('bad'); })
        : Promise.resolve<ServiceCheck>({ status: 'disabled', latencyMs: null }),
    ]);
    const services = { database, redis, minio, gotenberg, keycloak };
    const status = database.status === 'down' ? 'down' : Object.values(services).every((c) => c.status !== 'down') ? 'ok' : 'degraded';
    return { status, services, time: new Date().toISOString() } as const;
  }
}

@ApiTags('health') @Controller('health') @Public()
export class HealthController {
  constructor(private health: HealthService) {}

  @Get('live') live() { return { status: 'ok' }; }

  /** Readiness (Dokploy healthcheck): 503 only when the database is down. `checks` stays a flat name -> status map. */
  @Get()
  async ready(@Res({ passthrough: true }) res: Response) {
    const r = await this.health.collect();
    if (r.status === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: r.status, checks: Object.fromEntries(Object.entries(r.services).map(([k, v]) => [k, v.status])), time: r.time };
  }
}

/** Detailed per-service status (with latency) for a public status page. */
@ApiTags('health') @Controller('system') @Public()
export class SystemController {
  constructor(private health: HealthService) {}

  @Get('status')
  async status() {
    const r = await this.health.collect();
    const serviceList = Object.entries(r.services).map(([name, s]) => ({
      name,
      status: s.status,
      latencyMs: s.latencyMs,
      detail: s.latencyMs != null ? `${s.latencyMs}ms latency` : s.status === 'disabled' ? 'Disabled' : undefined,
    }));
    return {
      status: r.status,
      services: serviceList,
      checks: r.services,
      version: process.env.npm_package_version ?? '1.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      keycloakEnabled: env.keycloak.enabled,
      time: r.time,
    };
  }
}
