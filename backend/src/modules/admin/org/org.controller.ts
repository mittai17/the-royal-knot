import { BadRequestException, Body, Controller, Delete, Get, Header, NotFoundException, Post, Put, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Public, Roles } from '../../../common/decorators';
import { G } from '../../../common/permissions';
import { StorageService } from '../../../common/storage.service';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';
import { SettingsService, pickStrings } from '../shared/settings.service';

export const ORG_PROFILE_DEFAULTS = { name: 'The Royal Knot', legalName: '', tagline: '', email: '', phone: '', website: '', address: '', city: '', state: '', country: 'India', pincode: '', gstin: '', pan: '' };
const PROFILE_KEYS = Object.keys(ORG_PROFILE_DEFAULTS);
export const ORG_BUSINESS_DEFAULTS = { workingDays: 'Mon-Sat', workingHours: '10:00-19:00', invoicePrefix: 'INV', gstRatePercent: 18, defaultAdvancePercent: 40, paymentTermsDays: 7, quotationValidityDays: 15, supportEmail: '' };
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX = 2 * 1024 * 1024;

interface Location { id: string; name: string; type: string; address: string; city: string; phone: string }

@ApiTags('admin: organization') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/org')
export class OrgController {
  constructor(private settings: SettingsService, private storage: StorageService) {}

  @Get() @RequirePermission('org', 'read')
  async get() {
    const [profile, locations, business, logo] = await Promise.all([
      this.settings.getMerged('org.profile', ORG_PROFILE_DEFAULTS), this.settings.get<Location[]>('org.locations', []),
      this.settings.getMerged('org.business', ORG_BUSINESS_DEFAULTS), this.settings.get<{ key: string; mime: string; updatedAt: string } | null>('org.logo', null),
    ]);
    return { profile, locations, business, logo: logo ? { updatedAt: logo.updatedAt, url: `/config/logo?v=${encodeURIComponent(logo.updatedAt)}` } : null };
  }

  @Put() @RequirePermission('org', 'write')
  async save(@Body() body: { profile?: Record<string, unknown>; locations?: unknown[]; business?: Record<string, unknown> }, @CurrentUser() u: AuthUser) {
    const changed: string[] = [];
    if (body.profile) {
      const p = pickStrings(body.profile, PROFILE_KEYS);
      if ('name' in p && p.name.length < 2) throw new BadRequestException('Company name is required');
      if (p.email && !/^\S+@\S+\.\S+$/.test(p.email)) throw new BadRequestException('Company email is not valid');
      if (p.website && !/^https?:\/\//i.test(p.website)) throw new BadRequestException('Website must start with http:// or https://');
      await this.settings.set('org.profile', { ...(await this.settings.getMerged('org.profile', ORG_PROFILE_DEFAULTS)), ...p }, u.id, { entity: 'Organization', message: 'Updated company profile', meta: { fields: Object.keys(p) } });
      changed.push('profile');
    }
    if (body.locations) {
      if (!Array.isArray(body.locations) || body.locations.length > 50) throw new BadRequestException('locations must be a list of at most 50 entries');
      const locs: Location[] = body.locations.map((l) => { const s = pickStrings(l, ['id', 'name', 'type', 'address', 'city', 'phone']); if (!s.name) throw new BadRequestException('Every location needs a name'); return { id: s.id || randomUUID(), name: s.name, type: s.type || 'Office', address: s.address ?? '', city: s.city ?? '', phone: s.phone ?? '' }; });
      await this.settings.set('org.locations', locs, u.id, { entity: 'Organization', message: `Updated locations (${locs.length})` });
      changed.push('locations');
    }
    if (body.business) {
      const b = body.business;
      const num = (k: string, min: number, max: number) => { const v = b[k]; if (v === undefined) return {}; const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new BadRequestException(`${k} must be between ${min} and ${max}`); return { [k]: n }; };
      const merged = { ...(await this.settings.getMerged('org.business', ORG_BUSINESS_DEFAULTS)), ...pickStrings(b, ['workingDays', 'workingHours', 'invoicePrefix', 'supportEmail'], 60), ...num('gstRatePercent', 0, 100), ...num('defaultAdvancePercent', 0, 100), ...num('paymentTermsDays', 0, 365), ...num('quotationValidityDays', 0, 365) };
      await this.settings.set('org.business', merged, u.id, { entity: 'Organization', message: 'Updated business settings', meta: { fields: Object.keys(b) } });
      changed.push('business');
    }
    if (!changed.length) throw new BadRequestException('Nothing to update');
    return this.get();
  }

  @Post('logo') @RequirePermission('org', 'write') @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: LOGO_MAX } }))
  async uploadLogo(@UploadedFile() file: Express.Multer.File, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException('file is required');
    if (!LOGO_TYPES.includes(file.mimetype)) throw new BadRequestException('Logo must be a PNG, JPEG or WebP image');
    const old = await this.settings.get<{ key: string } | null>('org.logo', null);
    const key = `branding/logo-${Date.now()}.${file.mimetype.split('/')[1].replace('jpeg', 'jpg')}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    await this.settings.set('org.logo', { key, mime: file.mimetype, size: file.size, updatedAt: new Date().toISOString() }, u.id, { entity: 'Organization', message: 'Uploaded company logo' });
    if (old?.key) await this.storage.remove(old.key).catch(() => undefined);
    return this.get();
  }

  @Delete('logo') @RequirePermission('org', 'write')
  async removeLogo(@CurrentUser() u: AuthUser) {
    const old = await this.settings.get<{ key: string } | null>('org.logo', null);
    if (old?.key) await this.storage.remove(old.key).catch(() => undefined);
    await this.settings.set('org.logo', null, u.id, { entity: 'Organization', message: 'Removed company logo' });
    return this.get();
  }
}

/** Public, branding-only: the company logo (shown on the login page and in documents). */
@ApiTags('config') @Controller('config')
export class LogoController {
  constructor(private settings: SettingsService, private storage: StorageService) {}

  @Get('logo') @Public() @Header('Cache-Control', 'public, max-age=300')
  async logo(@Res({ passthrough: true }) res: Response) {
    const logo = await this.settings.get<{ key: string; mime: string } | null>('org.logo', null);
    if (!logo?.key) throw new NotFoundException('No logo uploaded');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(await this.storage.get(logo.key), { type: logo.mime });
  }
}
