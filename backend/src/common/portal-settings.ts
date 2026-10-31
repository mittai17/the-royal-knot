import { Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from './decorators';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';

export class NotificationPrefsDto {
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() sms?: boolean;
  @IsOptional() @IsBoolean() paymentReminders?: boolean;
  @IsOptional() @IsBoolean() scheduleChanges?: boolean;
  @IsOptional() @IsBoolean() announcements?: boolean;
  @IsOptional() @IsBoolean() messages?: boolean;
}
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}
export const DEFAULT_PREFS = { email: true, sms: false, paymentReminders: true, scheduleChanges: true, announcements: true, messages: true };

/** Profile + notification preferences shared by the client and vendor portals (prefs live in SystemSetting `user.prefs.<userId>`). */
@Injectable()
export class PortalSettings {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async get(u: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: u.id }, select: { id: true, name: true, email: true, phone: true, role: true, lastLoginAt: true, createdAt: true } });
    if (!user) throw new NotFoundException('User not found');
    const row = await this.prisma.systemSetting.findUnique({ where: { key: `user.prefs.${u.id}` } });
    return { profile: user, notifications: { ...DEFAULT_PREFS, ...((row?.value as object | null) ?? {}) } };
  }

  async updateProfile(u: AuthUser, dto: UpdateProfileDto) {
    const data = { ...(dto.name?.trim() ? { name: dto.name.trim() } : {}), ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}) };
    await this.prisma.user.update({ where: { id: u.id }, data });
    await this.audit.log({ actorId: u.id, entity: 'User', entityId: u.id, action: 'profile.update', message: 'Updated own profile', meta: { fields: Object.keys(data) } });
    return this.get(u);
  }

  async updatePrefs(u: AuthUser, dto: NotificationPrefsDto) {
    const cur = (await this.get(u)).notifications;
    const value = { ...cur, ...Object.fromEntries(Object.entries(dto).filter(([, v]) => typeof v === 'boolean')) };
    await this.prisma.systemSetting.upsert({ where: { key: `user.prefs.${u.id}` }, create: { key: `user.prefs.${u.id}`, value, updatedById: u.id }, update: { value, updatedById: u.id } });
    await this.audit.log({ actorId: u.id, entity: 'User', entityId: u.id, action: 'prefs.update', message: 'Updated notification preferences' });
    return this.get(u);
  }
}
