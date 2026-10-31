import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { AllowExternal, AuthUser, CurrentUser, Public } from '../../common/decorators';
import { ACCESS_TTL_S, AuthService, REFRESH_TTL_DAYS } from './auth.service';
import { ChangePasswordDto, KeycloakLoginDto, LoginDto } from './auth.dto';
import { KeycloakService } from './keycloak.service';

@ApiTags('auth') @Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private keycloak: KeycloakService) {}

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

  /** Public realm/client info for UIs. 404 unless KEYCLOAK_ENABLED=true. */
  @Public() @Get('keycloak/config')
  keycloakConfig() { this.keycloak.assertEnabled(); return this.keycloak.publicConfig(); }

  /** Password grant against Keycloak (internal URL), then the app's own HttpOnly cookie session. */
  @Public() @Post('keycloak/login') @HttpCode(200) @Throttle({ default: { limit: () => env.authRateLimit, ttl: 60_000 } })
  async keycloakLogin(@Body() dto: KeycloakLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.keycloak.assertEnabled();
    const token = await this.keycloak.passwordGrant(dto.email.toLowerCase(), dto.password);
    const user = await this.keycloak.upsertFromClaims(await this.keycloak.verify(token));
    const r = await this.auth.sessionFor(user, 'keycloak', req.ip);
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

  @Get('me') @AllowExternal() @ApiCookieAuth() me(@CurrentUser() u: AuthUser) { return { user: u }; }

  @Post('change-password') @AllowExternal() @HttpCode(200) @ApiCookieAuth() @Throttle({ default: { limit: () => env.authRateLimit, ttl: 60_000 } })
  async change(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.changePassword(u.id, dto.currentPassword, dto.newPassword);
    this.setCookies(res, r.access, r.refresh);
    return { user: r.user };
  }
}
