import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { KeyLike, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { KeycloakService, mapKeycloakRoles, stableUserId } from './keycloak.service';

const PUBLIC_ISSUER = 'https://auth.example.test/realms/royalknot';
const INTERNAL_URL = 'http://keycloak:8080';

describe('mapKeycloakRoles', () => {
  it.each([
    [['FOUNDER'], Role.ADMIN], [['WEDDING_PLANNER'], Role.PLANNER], [['EVENT_MANAGER'], Role.EVENT_MANAGER],
    [['FINANCE_MANAGER'], Role.FINANCE], [['OPS_STAFF'], Role.OPERATIONS],
    [['founder_admin'], Role.ADMIN], [['operations_staff'], Role.OPERATIONS], // legacy realm role names
  ])('%j -> %s', (roles, expected) => expect(mapKeycloakRoles(roles)).toBe(expected));

  it('ignores Keycloak built-in roles and returns null when nothing maps', () => {
    expect(mapKeycloakRoles(['offline_access', 'uma_authorization', 'default-roles-royalknot'])).toBeNull();
    expect(mapKeycloakRoles([])).toBeNull();
    expect(mapKeycloakRoles(undefined)).toBeNull();
  });

  it('picks the most privileged role when several are held', () => {
    expect(mapKeycloakRoles(['OPS_STAFF', 'FINANCE_MANAGER', 'FOUNDER'])).toBe(Role.ADMIN);
    expect(mapKeycloakRoles(['OPS_STAFF', 'WEDDING_PLANNER'])).toBe(Role.PLANNER);
  });
});

describe('stableUserId', () => {
  it('uses the Keycloak sub when it is a UUID (lower-cased)', () => {
    expect(stableUserId('DAD1A747-B845-41C4-A8A6-6A0FB3CECF9A', 'a@b.c')).toBe('dad1a747-b845-41c4-a8a6-6a0fb3cecf9a');
  });
  it('derives a deterministic UUID from the email otherwise, case-insensitively', () => {
    const a = stableUserId('not-a-uuid', 'Priya@RoyalKnot.in');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableUserId(undefined, 'priya@royalknot.in')).toBe(a);
    expect(stableUserId(undefined, 'rohan@royalknot.in')).not.toBe(a);
  });
});

describe('KeycloakService (split-horizon JWT validation)', () => {
  let privateKey: KeyLike, other: KeyLike;
  let svc: KeycloakService;
  const prisma = { user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } };
  const audit = { log: jest.fn() };
  const saved = { ...process.env };

  const sign = (claims: Record<string, unknown>, o: { iss?: string; key?: KeyLike; exp?: string | number; kid?: string } = {}) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: o.kid ?? 'k1' }).setIssuer(o.iss ?? PUBLIC_ISSUER).setIssuedAt().setExpirationTime(o.exp ?? '5m').sign(o.key ?? privateKey);

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256'); privateKey = kp.privateKey;
    other = (await generateKeyPair('RS256')).privateKey;
    const jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    process.env.KEYCLOAK_ENABLED = 'true';
    process.env.KEYCLOAK_INTERNAL_URL = INTERNAL_URL;
    process.env.KEYCLOAK_PUBLIC_ISSUER = PUBLIC_ISSUER;
    svc = new KeycloakService(prisma as never, audit as never);
    svc.setKeyResolver(createLocalJWKSet({ keys: [jwk] })); // stands in for GET http://keycloak:8080/realms/royalknot/.../certs
  });
  afterAll(() => { process.env = saved; });
  beforeEach(() => jest.resetAllMocks());

  const claims = { sub: 'dad1a747-b845-41c4-a8a6-6a0fb3cecf9a', email: 'arjun@royalknot.in', name: 'Arjun Rao', azp: 'royalknot-web', realm_access: { roles: ['FOUNDER'] } };

  it('accepts a token issued under the PUBLIC issuer, signature checked against the internally fetched keys', async () => {
    await expect(svc.verify(await sign(claims))).resolves.toMatchObject({ email: 'arjun@royalknot.in' });
  });
  it('also accepts the internal issuer (tokens minted via the internal password grant)', async () => {
    await expect(svc.verify(await sign(claims, { iss: `${INTERNAL_URL}/realms/royalknot` }))).resolves.toBeDefined();
  });
  it('accepts the confidential API client (azp royalknot-api)', async () => {
    await expect(svc.verify(await sign({ ...claims, azp: 'royalknot-api' }))).resolves.toBeDefined();
  });
  it.each([
    ['foreign issuer', () => sign(claims, { iss: 'https://evil.test/realms/royalknot' })],
    ['signature from a different key', () => sign(claims, { key: other })],
    ['expired token', () => sign(claims, { exp: Math.floor(Date.now() / 1000) - 600 })],
    ['unknown client (azp)', () => sign({ ...claims, azp: 'some-other-client' })],
    ['unknown kid', () => sign(claims, { kid: 'nope' })],
  ])('rejects %s', async (_n, mk) => { await expect(svc.verify(await mk())).rejects.toBeInstanceOf(UnauthorizedException); });
  it('rejects garbage', async () => { await expect(svc.verify('a.b.c')).rejects.toBeInstanceOf(UnauthorizedException); });

  describe('upsertFromClaims', () => {
    it('provisions a new user with the token sub as id and the mapped role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({ ...data, status: UserStatus.ACTIVE }));
      const u = await svc.upsertFromClaims(claims);
      expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({ id: claims.sub, email: 'arjun@royalknot.in', role: Role.ADMIN, name: 'Arjun Rao' });
      expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toMatch(/^\$argon2/);
      expect(u.role).toBe(Role.ADMIN);
    });
    it('matches an existing user by email (keeps its id) and syncs a changed role', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111', email: 'arjun@royalknot.in', role: Role.PLANNER, status: UserStatus.ACTIVE });
      prisma.user.update.mockImplementation(async ({ data }) => ({ id: '11111111-1111-1111-1111-111111111111', ...data }));
      const u = await svc.upsertFromClaims(claims);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: '11111111-1111-1111-1111-111111111111' }, data: { role: Role.ADMIN } });
      expect(u.role).toBe(Role.ADMIN);
    });
    it('does not write when nothing changed', async () => {
      const row = { id: 'x', email: 'arjun@royalknot.in', role: Role.ADMIN, status: UserStatus.ACTIVE };
      prisma.user.findUnique.mockResolvedValue(row);
      await expect(svc.upsertFromClaims(claims)).resolves.toBe(row);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
    it('refuses disabled accounts, missing email and unmapped roles', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'x', role: Role.ADMIN, status: UserStatus.DISABLED });
      await expect(svc.upsertFromClaims(claims)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(svc.upsertFromClaims({ ...claims, email: undefined })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.upsertFromClaims({ ...claims, realm_access: { roles: ['offline_access'] } })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
