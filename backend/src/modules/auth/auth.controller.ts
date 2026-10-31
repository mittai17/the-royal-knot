import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { AuthUser, CurrentUser, Public } from '../../common/decorators';
import { ACCESS_TTL_S, AuthService, REFRESH_TTL_DAYS } from './auth.service';
import { ChangePasswordDto, LoginDto } from './auth.dto';

@ApiTags('auth') @Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  private setCookies(res: Response, access: string, refresh: string) {
    const base = { httpOnly: true, secure: env.cookieSecure, sameSite: 'lax' as const };
    res.cookie('access_token', access, { ...base, path: '/', maxAge: ACCESS_TTL_S * 1000 });
    res.cookie('refresh_token', refresh, { ...base, path: '/api/v1/auth', maxAge: REFRESH_TTL_DAYS * 864e5 });
  }

  @Public() @Post('login') @HttpCode(200) @Throttle({ default: { limit: () => env.authRateLimit, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.email, dto.password, req.ip);
    this.setCookies(res, r.access, r.refresh);
    return { user: r.user };
  }

  @Public() @Post('refresh') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.refresh(req.cookies?.refresh_token);
    this.setCookies(res, r.access, r.refresh);
    return { user: r.user };
  }

  @Public() @Post('logout') @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.refresh_token);
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
    return { ok: true };
  }

  @Get('me') @ApiCookieAuth() me(@CurrentUser() u: AuthUser) { return { user: u }; }

  @Post('change-password') @HttpCode(200) @ApiCookieAuth() @Throttle({ default: { limit: () => env.authRateLimit, ttl: 60_000 } })
  async change(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.changePassword(u.id, dto.currentPassword, dto.newPassword);
    this.setCookies(res, r.access, r.refresh);
    return { user: r.user };
  }
}
