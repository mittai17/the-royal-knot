import { BadRequestException, Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles } from '../../../common/decorators';
import { G } from '../../../common/permissions';
import { ORG_PROFILE_DEFAULTS } from '../org/org.controller';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';
import { SettingsService } from '../shared/settings.service';

export const CONFIG_DEFAULTS = {
  currency: 'INR', timezone: 'Asia/Kolkata', financialYearStartMonth: 4, dateFormat: 'dd MMM yyyy', language: 'en-IN',
  features: { guestManagement: true, payments: true, vendorPortal: true, mobileAccess: true },
};
const FEATURES = Object.keys(CONFIG_DEFAULTS.features);

@ApiTags('admin: configuration') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/config')
export class AdminConfigController {
  constructor(private settings: SettingsService) {}

  @Get() @RequirePermission('config', 'read')
  get() { return this.settings.getMerged('system.config', CONFIG_DEFAULTS); }

  @Put() @RequirePermission('config', 'write')
  async save(@Body() body: Partial<typeof CONFIG_DEFAULTS>, @CurrentUser() u: AuthUser) {
    const cur = await this.settings.getMerged('system.config', CONFIG_DEFAULTS);
    const next = { ...cur, features: { ...cur.features } };
    if (body.currency !== undefined) { if (!/^[A-Z]{3}$/.test(body.currency)) throw new BadRequestException('Currency must be a 3-letter ISO code such as INR'); next.currency = body.currency; }
    if (body.timezone !== undefined) { try { new Intl.DateTimeFormat('en', { timeZone: body.timezone }); } catch { throw new BadRequestException('Unknown timezone'); } next.timezone = body.timezone; }
    if (body.financialYearStartMonth !== undefined) { const m = Number(body.financialYearStartMonth); if (!Number.isInteger(m) || m < 1 || m > 12) throw new BadRequestException('Financial year start month must be 1-12'); next.financialYearStartMonth = m; }
    if (body.dateFormat !== undefined) { if (typeof body.dateFormat !== 'string' || body.dateFormat.length > 30) throw new BadRequestException('Invalid date format'); next.dateFormat = body.dateFormat; }
    if (body.features) for (const [k, v] of Object.entries(body.features)) { if (!FEATURES.includes(k) || typeof v !== 'boolean') throw new BadRequestException(`Unknown feature toggle ${k}`); (next.features as Record<string, boolean>)[k] = v; }
    const changed = Object.keys(body).flatMap((k) => k === 'features' ? Object.keys(body.features ?? {}).map((f) => `features.${f}=${(next.features as Record<string, boolean>)[f]}`) : [k]);
    await this.settings.set('system.config', next, u.id, { entity: 'Configuration', message: 'Updated system configuration', meta: { changed } });
    return next;
  }
}

/** Public-safe configuration for the frontend (no secrets, no internal URLs). */
@ApiTags('config') @Controller('config')
export class PublicConfigController {
  constructor(private settings: SettingsService) {}

  @Get('public') @Public()
  async pub() {
    const [c, org, logo] = await Promise.all([this.settings.getMerged('system.config', CONFIG_DEFAULTS), this.settings.getMerged('org.profile', ORG_PROFILE_DEFAULTS), this.settings.get<{ updatedAt: string } | null>('org.logo', null)]);
    return { currency: c.currency, timezone: c.timezone, financialYearStartMonth: c.financialYearStartMonth, dateFormat: c.dateFormat, features: c.features, organization: { name: org.name, tagline: org.tagline, logoUrl: logo ? `/config/logo?v=${encodeURIComponent(logo.updatedAt)}` : null } };
  }
}
