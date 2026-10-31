import { Role } from '@prisma/client';
import { decryptSecret, encryptSecret, isEncrypted } from './shared/crypto';
import { PermissionsService } from './roles/permissions.service';
import { render } from './email/email.controller';
import { tempPassword } from './users/admin-users.controller';
import { RingBufferLogger, logBuffer } from './shared/ring-logger';
import { PermissionGuard } from './shared/permission.guard';
import { SettingsService, pickStrings } from './shared/settings.service';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';

const prismaWith = (rows: { role: string; module: string; action: string; allowed: boolean }[]) => ({ rolePermission: { findMany: jest.fn().mockResolvedValue(rows) } }) as never;

describe('integration secret encryption', () => {
  it('round-trips and never stores plain text', () => {
    const enc = encryptSecret('s3cret-value');
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain('s3cret');
    expect(decryptSecret(enc)).toBe('s3cret-value');
    expect(encryptSecret('s3cret-value')).not.toBe(enc); // random IV
  });
  it('rejects tampered ciphertext', () => {
    const enc = encryptSecret('abc');
    expect(() => decryptSecret(enc.slice(0, -4) + 'AAAA')).toThrow();
  });
});

describe('PermissionsService', () => {
  it('falls back to the code matrix when the DB has no row', async () => {
    const p = new PermissionsService(prismaWith([]));
    expect(await p.can(Role.PLANNER, 'clients', 'write')).toBe(true);
    expect(await p.can(Role.PLANNER, 'clients', 'read')).toBe(true); // write implies read
    expect(await p.can(Role.SYSADMIN, 'payments', 'write')).toBe(false);
    expect(await p.can(Role.SYSADMIN, 'weddings', 'read')).toBe(false);
    expect(await p.can(Role.ADMIN, 'anything', 'approve')).toBe(true);
  });
  it('DB rows override the code matrix', async () => {
    const p = new PermissionsService(prismaWith([{ role: 'PLANNER', module: 'clients', action: 'write', allowed: false }, { role: 'PLANNER', module: 'clients', action: 'read', allowed: false }, { role: 'FINANCE', module: 'enquiries', action: 'read', allowed: true }]));
    expect(await p.can(Role.PLANNER, 'clients', 'write')).toBe(false);
    expect(await p.can(Role.PLANNER, 'clients', 'read')).toBe(false);
    expect(await p.can(Role.FINANCE, 'enquiries', 'read')).toBe(true);
    const m = await p.matrix();
    expect(m.PLANNER.clients).toEqual({ read: false, write: false, approve: false });
    expect(m.ADMIN.clients).toEqual({ read: true, write: true, approve: true });
  });
  it('degrades to code defaults when the DB is down', async () => {
    const p = new PermissionsService({ rolePermission: { findMany: jest.fn().mockRejectedValue(new Error('down')) } } as never);
    expect(await p.can(Role.EVENT_MANAGER, 'events', 'write')).toBe(true);
  });
});

describe('PermissionGuard', () => {
  const ctx = (user: unknown) => ({ getHandler: () => 1, getClass: () => 2, switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;
  it('allows when no requirement is set, blocks when the role lacks it', async () => {
    const reflector = new Reflector();
    const perms = { can: jest.fn().mockResolvedValue(false) } as never;
    const g = new PermissionGuard(reflector, perms);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(undefined);
    expect(await g.canActivate(ctx({ role: 'SYSADMIN' }))).toBe(true);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce({ module: 'backups', action: 'write' });
    await expect(g.canActivate(ctx({ role: 'SYSADMIN' }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('email render', () => {
  it('substitutes variables, escapes html and keeps unknown placeholders', () => {
    expect(render('Hi {{ name }} {{x}}', { name: '<b>A</b>' })).toBe('Hi &lt;b&gt;A&lt;/b&gt; {{x}}');
    expect(render('Hi {{name}}', { name: '<b>A</b>' }, false)).toBe('Hi <b>A</b>');
  });
});

describe('tempPassword', () => {
  it('is 14 chars with upper, lower and digit', () => {
    for (let i = 0; i < 50; i++) { const p = tempPassword(); expect(p).toHaveLength(14); expect(p).toMatch(/[A-Z]/); expect(p).toMatch(/[a-z]/); expect(p).toMatch(/[0-9]/); }
  });
});

describe('ring buffer logger', () => {
  it('captures entries with level and context and is bounded', () => {
    logBuffer.clear();
    const l = new RingBufferLogger(['error', 'warn']);
    l.error('boom', 'Ctx');
    l.warn('careful', 'Ctx');
    expect(logBuffer.all().map((e) => [e.level, e.context, e.message])).toEqual([['error', 'Ctx', 'boom'], ['warn', 'Ctx', 'careful']]);
    for (let i = 0; i < 2100; i++) logBuffer.push('log', 'x', String(i));
    expect(logBuffer.all().length).toBe(2000);
  });
});

describe('SettingsService', () => {
  it('merges stored values over defaults and caches reads', async () => {
    const find = jest.fn().mockResolvedValue({ key: 'k', value: { a: 2, nested: { y: 9 } } });
    const s = new SettingsService({ systemSetting: { findUnique: find } } as never, { log: jest.fn() } as never);
    expect(await s.getMerged('k', { a: 1, b: 1, nested: { x: 1, y: 1 } })).toEqual({ a: 2, b: 1, nested: { x: 1, y: 9 } });
    await s.get('k', {});
    expect(find).toHaveBeenCalledTimes(1);
    s.clear();
    await s.get('k', {});
    expect(find).toHaveBeenCalledTimes(2);
  });
  it('pickStrings drops unknown keys and non-strings', () => {
    expect(pickStrings({ a: ' x ', b: 3, evil: 'y' }, ['a', 'b'])).toEqual({ a: 'x' });
  });
});
