import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { AuthUser, CurrentUser, Roles } from '../../../common/decorators';
import { G } from '../../../common/permissions';
import { env } from '../../../config/env';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { decryptSecret, encryptSecret, isEncrypted } from '../shared/crypto';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';

type FieldType = 'text' | 'url' | 'number' | 'boolean' | 'select';
interface FieldDef { key: string; label: string; type: FieldType; secret?: boolean; options?: string[]; hint?: string }
interface ProviderDef { provider: string; label: string; description: string; fields: FieldDef[]; envDefaults?: () => Record<string, unknown> }

export const PROVIDERS: ProviderDef[] = [
  {
    provider: 'KEYCLOAK', label: 'Keycloak (single sign-on)', description: 'OpenID Connect identity provider used for SSO.',
    fields: [{ key: 'issuerUrl', label: 'Issuer URL', type: 'url', hint: 'e.g. https://auth.example.com/realms/royalknot' }, { key: 'clientId', label: 'Client ID', type: 'text' }, { key: 'clientSecret', label: 'Client secret', type: 'text', secret: true }],
    envDefaults: () => ({ issuerUrl: env.keycloak.internalIssuer, clientId: env.keycloak.clientId }),
  },
  {
    provider: 'SMTP', label: 'SMTP email', description: 'Outgoing mail server for notifications and invoices.',
    fields: [{ key: 'host', label: 'Host', type: 'text' }, { key: 'port', label: 'Port', type: 'number' }, { key: 'secure', label: 'Use TLS (port 465)', type: 'boolean' }, { key: 'user', label: 'Username', type: 'text' }, { key: 'password', label: 'Password', type: 'text', secret: true }, { key: 'from', label: 'From address', type: 'text' }],
    envDefaults: () => ({ host: env.smtp.host, port: env.smtp.port, from: env.smtp.from, secure: false }),
  },
  {
    provider: 'PAYMENT_GATEWAY', label: 'Payment gateway', description: 'Online collection of client payments.',
    fields: [{ key: 'gateway', label: 'Gateway', type: 'select', options: ['razorpay', 'stripe', 'payu', 'cashfree'] }, { key: 'mode', label: 'Mode', type: 'select', options: ['test', 'live'] }, { key: 'keyId', label: 'Key ID', type: 'text' }, { key: 'keySecret', label: 'Key secret', type: 'text', secret: true }, { key: 'webhookSecret', label: 'Webhook secret', type: 'text', secret: true }],
  },
  {
    provider: 'MAPS', label: 'Maps & places', description: 'Venue lookup and travel estimates.',
    fields: [{ key: 'provider', label: 'Provider', type: 'select', options: ['google', 'mapbox', 'osm'] }, { key: 'apiKey', label: 'API key', type: 'text', secret: true }],
  },
];

const MASK = '••••••••';

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  def(p: string) {
    const d = PROVIDERS.find((x) => x.provider === p.toUpperCase());
    if (!d) throw new NotFoundException('Unknown integration');
    return d;
  }

  /** Plain (decrypted) config, falling back to the environment for Keycloak / SMTP. Internal use only; never returned by the API. */
  async resolved(provider: string): Promise<{ enabled: boolean; config: Record<string, unknown>; source: 'database' | 'environment' }> {
    const d = this.def(provider);
    const row = await this.prisma.integrationConfig.findUnique({ where: { provider: d.provider } });
    const stored = (row?.config ?? {}) as Record<string, unknown>;
    const config: Record<string, unknown> = { ...(d.envDefaults?.() ?? {}) };
    for (const [k, v] of Object.entries(stored)) config[k] = typeof v === 'string' && isEncrypted(v) ? decryptSecret(v) : v;
    return { enabled: row?.enabled ?? (d.provider === 'KEYCLOAK' ? env.keycloak.enabled : d.provider === 'SMTP' ? !!env.smtp.host : false), config, source: row ? 'database' : 'environment' };
  }

  async view(d: ProviderDef) {
    const row = await this.prisma.integrationConfig.findUnique({ where: { provider: d.provider } });
    const stored = (row?.config ?? {}) as Record<string, unknown>;
    const env_ = d.envDefaults?.() ?? {};
    return {
      provider: d.provider, label: d.label, description: d.description, enabled: row?.enabled ?? (d.provider === 'KEYCLOAK' ? env.keycloak.enabled : d.provider === 'SMTP' ? !!env.smtp.host : false),
      source: row ? 'database' : 'environment', configured: !!row, lastTestedAt: row?.lastTestedAt ?? null, lastTestOk: row?.lastTestOk ?? null, updatedAt: row?.updatedAt ?? null,
      fields: d.fields.map((f) => {
        const raw = f.key in stored ? stored[f.key] : env_[f.key];
        return { key: f.key, label: f.label, type: f.type, options: f.options, hint: f.hint, secret: !!f.secret, isSet: f.secret ? (typeof stored[f.key] === 'string' && stored[f.key] !== '') : raw !== undefined && raw !== '', value: f.secret ? null : (raw ?? null) };
      }),
    };
  }

  async save(provider: string, body: { enabled?: boolean; config?: Record<string, unknown>; clear?: string[] }, actorId: string) {
    const d = this.def(provider);
    const row = await this.prisma.integrationConfig.findUnique({ where: { provider: d.provider } });
    const stored = { ...((row?.config ?? {}) as Record<string, unknown>) };
    const changed: string[] = [];
    for (const f of d.fields) {
      const v = body.config?.[f.key];
      if (body.clear?.includes(f.key)) { delete stored[f.key]; changed.push(`${f.key} (cleared)`); continue; }
      if (v === undefined || v === null) continue;
      if (f.secret) {
        if (typeof v !== 'string') throw new BadRequestException(`${f.label} must be text`);
        if (v === '' || v === MASK) continue; // keep the stored secret
        stored[f.key] = encryptSecret(v); changed.push(`${f.key} (secret)`); continue;
      }
      if (f.type === 'number') { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 65535 * 10) throw new BadRequestException(`${f.label} must be a number`); stored[f.key] = n; }
      else if (f.type === 'boolean') { if (typeof v !== 'boolean') throw new BadRequestException(`${f.label} must be true or false`); stored[f.key] = v; }
      else {
        if (typeof v !== 'string' || v.length > 500) throw new BadRequestException(`${f.label} must be text`);
        if (f.type === 'url' && v && !/^https?:\/\/[^\s]+$/i.test(v)) throw new BadRequestException(`${f.label} must be an http(s) URL`);
        if (f.type === 'select' && v && !f.options!.includes(v)) throw new BadRequestException(`${f.label} must be one of ${f.options!.join(', ')}`);
        stored[f.key] = v.trim();
      }
      changed.push(f.key);
    }
    const enabled = body.enabled ?? row?.enabled ?? false;
    if (body.enabled !== undefined && body.enabled !== row?.enabled) changed.push(`enabled=${body.enabled}`);
    await this.prisma.integrationConfig.upsert({ where: { provider: d.provider }, create: { provider: d.provider, enabled, config: stored as Prisma.InputJsonValue }, update: { enabled, config: stored as Prisma.InputJsonValue, lastTestOk: null, lastTestedAt: null } });
    await this.audit.log({ actorId, entity: 'Integration', entityId: d.provider, action: 'update', message: `Updated ${d.label} integration`, meta: { changed } });
    return this.view(d);
  }

  /** Real connectivity probes: Keycloak discovery document, SMTP handshake. Gateway / maps only validate that credentials are present. */
  async test(provider: string, actorId: string) {
    const d = this.def(provider);
    const { config } = await this.resolved(d.provider);
    const t0 = Date.now();
    let ok = false, message = '', details: Record<string, unknown> = {}, probe: 'live' | 'validation-only' = 'live';
    try {
      if (d.provider === 'KEYCLOAK') {
        const issuer = String(config.issuerUrl ?? '').replace(/\/$/, '');
        if (!/^https?:\/\//.test(issuer)) throw new Error('Issuer URL is not set');
        const res = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) throw new Error(`Discovery document returned HTTP ${res.status}`);
        const j = (await res.json()) as { issuer?: string; jwks_uri?: string; authorization_endpoint?: string; token_endpoint?: string };
        if (!j.issuer || !j.jwks_uri) throw new Error('Response is not an OpenID Connect discovery document');
        const jwks = await fetch(j.jwks_uri, { signal: AbortSignal.timeout(6000) });
        if (!jwks.ok) throw new Error(`JWKS endpoint returned HTTP ${jwks.status}`);
        ok = true; message = 'Keycloak discovery document and signing keys are reachable'; details = { issuer: j.issuer, authorizationEndpoint: j.authorization_endpoint, tokenEndpoint: j.token_endpoint, keys: ((await jwks.json()) as { keys?: unknown[] }).keys?.length ?? 0 };
      } else if (d.provider === 'SMTP') {
        const host = String(config.host ?? '');
        if (!host) throw new Error('SMTP host is not set');
        const user = String(config.user ?? '');
        const transport = nodemailer.createTransport({ host, port: Number(config.port ?? 25), secure: config.secure === true, connectionTimeout: 6000, greetingTimeout: 6000, socketTimeout: 6000, ...(user ? { auth: { user, pass: String(config.password ?? '') } } : {}), ...(config.secure === true ? {} : { ignoreTLS: !user }) });
        await transport.verify();
        ok = true; message = `SMTP server ${host}:${config.port} accepted the connection${user ? ' and credentials' : ''}`; details = { host, port: config.port };
      } else {
        probe = 'validation-only';
        const required = d.provider === 'PAYMENT_GATEWAY' ? ['keyId', 'keySecret'] : config.provider === 'osm' ? [] : ['apiKey'];
        const missing = required.filter((k) => !config[k]).map((k) => d.fields.find((f) => f.key === k)!.label);
        if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
        ok = true; message = 'Credentials are present. No live probe is run for this provider (it would call an external paid API).';
      }
    } catch (e) { ok = false; const err = e as Error & { cause?: { code?: string; message?: string } }; message = `${err.message || 'Connection failed'}${err.cause?.code ? ` (${err.cause.code})` : err.cause?.message ? ` (${err.cause.message})` : ''}`; }
    const ms = Date.now() - t0;
    await this.prisma.integrationConfig.upsert({ where: { provider: d.provider }, create: { provider: d.provider, enabled: false, config: {}, lastTestOk: ok, lastTestedAt: new Date() }, update: { lastTestOk: ok, lastTestedAt: new Date() } });
    await this.audit.log({ actorId, entity: 'Integration', entityId: d.provider, action: 'test', message: `Tested ${d.label}: ${ok ? 'OK' : 'failed'}`, meta: { ok, probe, ms } });
    return { provider: d.provider, ok, message, probe, latencyMs: ms, details };
  }
}

@ApiTags('admin: integrations') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/integrations')
export class IntegrationsController {
  constructor(private svc: IntegrationsService) {}
  @Get() @RequirePermission('integrations', 'read') list() { return Promise.all(PROVIDERS.map((d) => this.svc.view(d))); }
  @Get(':provider') @RequirePermission('integrations', 'read') one(@Param('provider') p: string) { return this.svc.view(this.svc.def(p)); }
  @Put(':provider') @RequirePermission('integrations', 'write') save(@Param('provider') p: string, @Body() body: { enabled?: boolean; config?: Record<string, unknown>; clear?: string[] }, @CurrentUser() u: AuthUser) { return this.svc.save(p, body ?? {}, u.id); }
  @Post(':provider/test') @RequirePermission('integrations', 'write') test(@Param('provider') p: string, @CurrentUser() u: AuthUser) { return this.svc.test(p, u.id); }
}
