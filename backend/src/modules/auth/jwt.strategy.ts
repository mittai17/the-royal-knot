import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { env } from '../../config/env';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../../common/decorators';

const fromCookie = (req: Request) => req?.cookies?.access_token ?? null;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({ jwtFromRequest: ExtractJwt.fromExtractors([fromCookie, ExtractJwt.fromAuthHeaderAsBearerToken()]), ignoreExpiration: false, secretOrKey: env.jwtSecret });
  }
  /** Re-reads the user each request so disabled accounts and role changes apply immediately. */
  async validate(payload: { sub: string }): Promise<AuthUser> {
    const u = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!u || u.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Account disabled');
    const role = (u.role as string) === 'ADMIN' ? ('FOUNDER' as any) : u.role;
    return { id: u.id, email: u.email, name: u.name, role, mustChangePassword: u.mustChangePassword, vendorId: u.vendorId, coupleId: u.coupleId };
  }
}
