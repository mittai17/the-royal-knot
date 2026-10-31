import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { env } from '../../config/env';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private audit: AuditService) {}

  publicUser(u: User) { return { id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: u.mustChangePassword, phone: u.phone }; }

  private accessToken(u: User) { return this.jwt.sign({ sub: u.id, role: u.role }, { secret: env.jwtSecret, expiresIn: ACCESS_TTL_S }); }

  private async issueRefresh(userId: string, family: string = randomUUID()) {
    const token = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({ data: { userId, family, tokenHash: sha(token), expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 864e5) } });
    return token;
  }

  async login(email: string, password: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Same error for unknown user / bad password / disabled to avoid account enumeration.
    const ok = user && user.status === UserStatus.ACTIVE && (await argon2.verify(user.passwordHash, password).catch(() => false));
    if (!user || !ok) {
      await this.audit.log({ entity: 'User', entityId: user?.id, action: 'login.failed', message: `Failed login for ${email}`, meta: { ip } });
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actorId: user.id, entity: 'User', entityId: user.id, action: 'login', message: `${user.name} signed in`, meta: { ip } });
    return { user: this.publicUser(user), access: this.accessToken(user), refresh: await this.issueRefresh(user.id) };
  }

  /** Issues the app's own cookie session for an already-authenticated user (e.g. verified by Keycloak). */
  async sessionFor(user: User, via: string, ip?: string) {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actorId: user.id, entity: 'User', entityId: user.id, action: 'login', message: `${user.name} signed in via ${via}`, meta: { ip, via } });
    return { user: this.publicUser(user), access: this.accessToken(user), refresh: await this.issueRefresh(user.id) };
  }

  /** Rotation: every refresh token is single-use. Re-use of a revoked token revokes the whole family (theft detection). */
  async refresh(token?: string) {
    if (!token) throw new UnauthorizedException('No refresh token');
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha(token) }, include: { user: true } });
    if (!row) throw new UnauthorizedException('Invalid refresh token');
    if (row.revokedAt || row.expiresAt < new Date()) {
      if (row.revokedAt) await this.prisma.refreshToken.updateMany({ where: { family: row.family, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Refresh token expired or reused');
    }
    if (row.user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Account disabled');
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (claimed.count === 0) throw new UnauthorizedException('Refresh token already used');
    return { user: this.publicUser(row.user), access: this.accessToken(row.user), refresh: await this.issueRefresh(row.userId, row.family) };
  }

  async logout(token?: string) {
    if (!token) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha(token) } });
    if (row) await this.prisma.refreshToken.updateMany({ where: { family: row.family, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current))) throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next), mustChangePassword: false } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: userId, entity: 'User', entityId: userId, action: 'password.changed', message: 'Password changed' });
    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { user: this.publicUser(fresh), access: this.accessToken(fresh), refresh: await this.issueRefresh(userId) };
  }
}
