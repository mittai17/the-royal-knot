import { BadGatewayException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Role, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { JWTPayload, JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import { AuthUser } from '../../common/decorators';
import { env } from '../../config/env';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Keycloak realm role -> app role. Order = precedence when a user holds several roles. */
const ROLE_MAP: [string, Role][] = [
  ['FOUNDER', Role.ADMIN], ['FOUNDER_ADMIN', Role.ADMIN],
  ['FINANCE_MANAGER', Role.FINANCE],
  ['EVENT_MANAGER', Role.EVENT_MANAGER],
  ['WEDDING_PLANNER', Role.PLANNER],
  ['OPS_STAFF', Role.OPERATIONS], ['OPERATIONS_STAFF', Role.OPERATIONS], // second names = legacy realm role names
];

export function mapKeycloakRoles(roles: string[] | undefined): Role | null {
  const have = new Set((roles ?? []).map((r) => r.toUpperCase()));
  return ROLE_MAP.find(([kc]) => have.has(kc))?.[1] ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Stable local user id: the Keycloak `sub` when it is a UUID, else a deterministic UUID derived from the email. */
export function stableUserId(sub: string | undefined, email: string): string {
  if (sub && UUID_RE.test(sub)) return sub.toLowerCase();
  const h = createHash('sha1').update(`royalknot:${email.toLowerCase()}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface KeycloakClaims extends JWTPayload {
  email?: string; name?: string; preferred_username?: string; azp?: string;
  realm_access?: { roles?: string[] };
}

@Injectable()
export class KeycloakService {
  private readonly log = new Logger('Keycloak');
  private keys?: JWTVerifyGetKey;

  constructor(private prisma: PrismaService, private audit: AuditService) {}

  get enabled() { return env.keycloak.enabled; }
  assertEnabled() { if (!this.enabled) throw new NotFoundException(); }

  /** Test seam: swap the JWKS resolver (production fetches the keys from the internal Docker URL). */
  setKeyResolver(k: JWTVerifyGetKey | undefined) { this.keys = k; }
  private getKeys(): JWTVerifyGetKey {
    return (this.keys ??= createRemoteJWKSet(new URL(`${env.keycloak.internalIssuer}/protocol/openid-connect/certs`), { cooldownDuration: 10_000, timeoutDuration: 4_000 }));
  }

  publicConfig() {
    const k = env.keycloak;
    return { enabled: true, realm: k.realm, clientId: k.clientId, issuer: k.publicIssuer, authorizationEndpoint: `${k.publicIssuer}/protocol/openid-connect/auth`, tokenLoginUrl: '/api/v1/auth/keycloak/login' };
  }

  /**
   * Split-horizon validation: keys are fetched over the internal URL, but the token's `iss` is whatever
   * Keycloak was told its public hostname is, so we accept the public issuer (and the internal one for direct calls).
   */
  async verify(token: string): Promise<KeycloakClaims> {
    const k = env.keycloak;
    try {
      const { payload } = await jwtVerify(token, this.getKeys(), { issuer: [...new Set([k.publicIssuer, k.internalIssuer])], clockTolerance: 5 });
      const claims = payload as KeycloakClaims;
      if (claims.azp && ![k.clientId, k.apiClientId].includes(claims.azp)) throw new Error(`unexpected azp ${claims.azp}`);
      return claims;
    } catch (e) {
      this.log.debug(`token rejected: ${(e as Error).message}`);
      throw new UnauthorizedException('Invalid Keycloak token');
    }
  }

  /** Resource-owner password grant against Keycloak over the internal URL (client royalknot-web). */
  async passwordGrant(email: string, password: string): Promise<string> {
    const k = env.keycloak;
    const body = new URLSearchParams({ grant_type: 'password', client_id: k.clientId, username: email, password, scope: 'openid email profile' });
    if (k.clientSecret) body.set('client_secret', k.clientSecret);
    let res: Response;
    try {
      res = await fetch(`${k.internalIssuer}/protocol/openid-connect/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(6000) });
    } catch (e) {
      this.log.warn(`Keycloak unreachable: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Identity provider unavailable');
    }
    if (res.status === 400 || res.status === 401) throw new UnauthorizedException('Invalid email or password');
    if (!res.ok) throw new BadGatewayException('Identity provider error');
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new BadGatewayException('Identity provider returned no token');
    return json.access_token;
  }

  /** JIT-provisions / syncs the local user from verified claims. Role always follows Keycloak. */
  async upsertFromClaims(c: KeycloakClaims): Promise<User> {
    const email = (c.email ?? '').toLowerCase();
    if (!email) throw new ForbiddenException('Keycloak token has no email claim');
    const role = mapKeycloakRoles(c.realm_access?.roles);
    if (!role) throw new ForbiddenException('No Royal Knot role assigned in Keycloak');
    const name = c.name || c.preferred_username || email.split('@')[0];
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Account disabled');
      if (existing.role === role) return existing;
      await this.audit.log({ actorId: existing.id, entity: 'User', entityId: existing.id, action: 'role.synced', message: `Role set to ${role} from Keycloak`, meta: { from: existing.role, to: role } });
      return this.prisma.user.update({ where: { id: existing.id }, data: { role } });
    }
    const passwordHash = await argon2.hash(randomBytes(32).toString('base64url')); // no local password; sign in via Keycloak
    const created = await this.prisma.user.create({ data: { id: stableUserId(c.sub, email), email, name, role, passwordHash } });
    await this.audit.log({ actorId: created.id, entity: 'User', entityId: created.id, action: 'user.provisioned', message: `${name} provisioned from Keycloak as ${role}` });
    return created;
  }

  async authenticate(token: string): Promise<AuthUser> {
    const u = await this.upsertFromClaims(await this.verify(token));
    return { id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: false };
  }
}
